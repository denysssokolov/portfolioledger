import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAccounts, useSnapshots, useTransactions } from "@/hooks/usePortfolioData";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtMoney, monthLabel } from "@/lib/format";
import { investedByAccount, previousMonthISO } from "@/lib/calc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Lock } from "lucide-react";
import { useSafetyMode } from "@/hooks/useSafetyMode";
import { isMonthEditable, daysLeftUntilEditable } from "@/lib/snapshotRules";

export default function SnapshotEditor() {
  const { month: monthParam } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: accounts = [] } = useAccounts();
  const { data: snaps = [] } = useSnapshots();
  const { data: txs = [] } = useTransactions();
  const { safe } = useSafetyMode();

  const month = monthParam ?? "";
  const editable = useMemo(() => isMonthEditable(month), [month]);
  const daysLeft = useMemo(() => daysLeftUntilEditable(month), [month]);

  const [values, setValues] = useState<Record<string, { amount_now: string; cash_portion: string }>>({});

  useEffect(() => {
    const cur = snaps.filter((s) => s.month === month);
    const prevISO = previousMonthISO(month);
    const prev = snaps.filter((s) => s.month === prevISO);
    const next: typeof values = {};
    for (const a of accounts) {
      const c = cur.find((s) => s.account_id === a.id);
      const p = prev.find((s) => s.account_id === a.id);
      next[a.id] = {
        amount_now: c && !c.skipped ? String(c.amount_now) : p && !p.skipped ? String(p.amount_now) : "",
        cash_portion:
          c && !c.skipped
            ? String(c.cash_portion)
            : p && !p.skipped
              ? String(p.cash_portion)
              : a.asset_class === "Cash"
                ? ""
                : "0",
      };
    }
    setValues(next);
  }, [month, snaps, accounts]);

  const monthEndISO = useMemo(() => {
    if (!month) return "";
    const d = new Date(month);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  }, [month]);

  const investedMap = useMemo(() => investedByAccount(txs, monthEndISO), [txs, monthEndISO]);

  const save = async () => {
    if (!user) return;
    if (safe) return toast.error("Safety mode is on. Disable it to save.");
    if (!editable) return toast.error("This month isn't open for snapshots yet.");
    const cur = snaps.filter((s) => s.month === month);
    const candidates = accounts
      .filter((a) => values[a.id]?.amount_now !== "")
      .map((a) => {
        const amt = Number(values[a.id].amount_now || 0);
        return {
          account: a,
          row: {
            user_id: user.id,
            account_id: a.id,
            month,
            amount_now: amt,
            cash_portion: a.asset_class === "Cash" ? amt : Number(values[a.id].cash_portion || 0),
            skipped: false,
          },
        };
      });
    if (candidates.length === 0) return toast.error("Enter at least one balance");
    // Only keep rows that differ from what's stored, so updated_at (filled date) stays put when nothing changed.
    const rows = candidates
      .filter(({ row }) => {
        const existing = cur.find((s) => s.account_id === row.account_id);
        if (!existing) return true;
        if (existing.skipped) return true;
        return (
          Number(existing.amount_now) !== row.amount_now ||
          Number(existing.cash_portion) !== row.cash_portion
        );
      })
      .map(({ row }) => row);
    if (rows.length === 0) {
      toast.success("No changes");
      navigate("/snapshot");
      return;
    }
    const { error } = await supabase
      .from("snapshots")
      .upsert(rows, { onConflict: "user_id,account_id,month" });
    if (error) {
      console.error("Snapshot save failed:", error);
      return toast.error("Couldn't save snapshot. Please try again.");
    }
    toast.success(`Saved snapshot for ${monthLabel(month)}`);
    qc.invalidateQueries({ queryKey: ["snapshots"] });
    navigate("/snapshot");
  };


  const total = accounts.reduce((a, x) => a + (Number(values[x.id]?.amount_now) || 0), 0);

  if (!month) return null;

  return (
    <>
      <ScreenHeader
        title={monthLabel(month)}
        subtitle="Enter end-of-month balances. Invested is auto-calculated."
        right={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/snapshot")}
            className="gap-1"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        }
      />

      <div className="px-5">
        {!editable && (
          <div className="rounded-2xl border border-border bg-muted/40 p-4 mb-4 flex items-start gap-3">
            <Lock className="h-5 w-5 mt-0.5 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              This snapshot is locked. {daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left before you can create snapshot for ${monthLabel(month)}.` : "Snapshots open in the last 3 days of the month."}
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-gradient-card border border-border p-5 shadow-card mb-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Total this month</div>
          <div className="font-display text-3xl font-bold tabular mt-1">{fmtMoney(total)}</div>
        </div>

        <div className="space-y-2">
          {accounts.map((a) => {
            const v = values[a.id] ?? { amount_now: "", cash_portion: "" };
            const invested = investedMap[a.id] ?? 0;
            const amt = Number(v.amount_now) || 0;
            const pnl = v.amount_now === "" ? null : amt - invested;
            const disabled = safe || !editable;
            return (
              <div key={a.id} className="rounded-2xl border border-border bg-card p-4 shadow-card animate-fade-in">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-semibold">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{a.asset_class}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Invested</div>
                    <div className="text-sm tabular">{fmtMoney(invested)}</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Invested</label>
                    <div className="h-12 rounded-xl bg-muted/40 border border-border flex items-center px-3 font-display text-lg font-bold tabular text-muted-foreground">
                      {fmtMoney(invested)}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Amount now</label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={safe ? "" : v.amount_now}
                      disabled={disabled}
                      onChange={(e) => setValues({ ...values, [a.id]: { ...v, amount_now: e.target.value } })}
                      placeholder={safe ? "••••" : "0.00"}
                      className="h-12 rounded-xl bg-secondary border-0 font-display text-lg font-bold tabular"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Cash portion</label>
                    {a.asset_class === "Cash" ? (
                      <div className="h-12 rounded-xl bg-muted/40 border border-border flex items-center px-3 font-display text-lg font-bold tabular text-muted-foreground">
                        {safe ? "••••" : (v.amount_now === "" ? "0.00" : Number(v.amount_now || 0).toFixed(2))}
                      </div>
                    ) : (
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        value={safe ? "" : v.cash_portion}
                        disabled={disabled}
                        onChange={(e) => setValues({ ...values, [a.id]: { ...v, cash_portion: e.target.value } })}
                        placeholder={safe ? "••••" : "0.00"}
                        className="h-12 rounded-xl bg-secondary border-0 font-display text-lg font-bold tabular"
                      />
                    )}
                  </div>
                </div>
                {pnl !== null && (
                  <div className={cn("text-xs mt-2 tabular", pnl >= 0 ? "text-success" : "text-loss")}>
                    Unrealised: {pnl >= 0 ? "+" : "−"}{fmtMoney(Math.abs(pnl))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Button
          onClick={save}
          disabled={safe || !editable}
          className="w-full mt-6 h-13 py-3.5 rounded-2xl bg-gradient-primary text-primary-foreground font-semibold shadow-elegant"
        >
          {safe || !editable ? <Lock className="h-5 w-5 mr-2" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
          {safe ? "Safety mode on" : !editable ? "Locked" : "Save snapshot"}
        </Button>
      </div>
    </>
  );
}
