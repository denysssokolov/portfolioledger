import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAccounts, useSnapshots, useTransactions } from "@/hooks/usePortfolioData";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtMoney, GBP2, monthKey, monthLabel } from "@/lib/format";
import { investedByAccount, latestSnapshotByAccount, previousMonthISO, uniqueMonths } from "@/lib/calc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

export default function Snapshot() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: accounts = [] } = useAccounts();
  const { data: snaps = [] } = useSnapshots();
  const { data: txs = [] } = useTransactions();

  const months = useMemo(() => {
    const set = new Set<string>(snaps.map((s) => s.month));
    set.add(monthKey(new Date()));
    return Array.from(set).sort().reverse();
  }, [snaps]);

  const [month, setMonth] = useState(monthKey(new Date()));
  useEffect(() => {
    if (!months.includes(month)) setMonth(months[0] ?? monthKey(new Date()));
  }, [months]);

  const [values, setValues] = useState<Record<string, { amount_now: string; cash_portion: string }>>({});

  // Hydrate from current month snapshots, fall back to previous month for carry-over
  useEffect(() => {
    const cur = snaps.filter((s) => s.month === month);
    const prevISO = previousMonthISO(month);
    const prev = snaps.filter((s) => s.month === prevISO);
    const next: typeof values = {};
    for (const a of accounts) {
      const c = cur.find((s) => s.account_id === a.id);
      const p = prev.find((s) => s.account_id === a.id);
      next[a.id] = {
        amount_now: c ? String(c.amount_now) : p ? String(p.amount_now) : "",
        cash_portion: c ? String(c.cash_portion) : p ? String(p.cash_portion) : a.asset_class === "Cash" ? "" : "0",
      };
    }
    setValues(next);
  }, [month, snaps, accounts]);

  const monthEndISO = useMemo(() => {
    const d = new Date(month);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  }, [month]);

  const investedMap = useMemo(() => investedByAccount(txs, monthEndISO), [txs, monthEndISO]);

  const save = async () => {
    if (!user) return;
    const rows = accounts
      .filter((a) => values[a.id]?.amount_now !== "")
      .map((a) => ({
        user_id: user.id,
        account_id: a.id,
        month,
        amount_now: Number(values[a.id].amount_now || 0),
        cash_portion: Number(values[a.id].cash_portion || 0),
      }));
    if (rows.length === 0) return toast.error("Enter at least one balance");
    const { error } = await supabase
      .from("snapshots")
      .upsert(rows, { onConflict: "user_id,account_id,month" });
    if (error) {
      console.error("Snapshot save failed:", error);
      return toast.error("Couldn't save snapshot. Please try again.");
    }
    toast.success(`Saved snapshot for ${monthLabel(month)}`);
    qc.invalidateQueries({ queryKey: ["snapshots"] });
  };

  const total = accounts.reduce((a, x) => a + (Number(values[x.id]?.amount_now) || 0), 0);

  return (
    <>
      <ScreenHeader
        title="Snapshot"
        subtitle="Enter end-of-month balances. Invested is auto-calculated."
        right={
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-44 h-11 rounded-xl bg-secondary border-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              {months.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />

      <div className="px-5">
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
            return (
              <div key={a.id} className="rounded-2xl border border-border bg-card p-4 shadow-card animate-fade-in">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-semibold">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{a.asset_class}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Invested</div>
                    <div className="text-sm tabular">{GBP2.format(invested)}</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Invested</label>
                    <div className="h-12 rounded-xl bg-muted/40 border border-border flex items-center px-3 font-display text-lg font-bold tabular text-muted-foreground">
                      {GBP2.format(invested)}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Amount now</label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={v.amount_now}
                      onChange={(e) => setValues({ ...values, [a.id]: { ...v, amount_now: e.target.value } })}
                      placeholder="0.00"
                      className="h-12 rounded-xl bg-secondary border-0 font-display text-lg font-bold tabular"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Cash portion</label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={v.cash_portion}
                      onChange={(e) => setValues({ ...values, [a.id]: { ...v, cash_portion: e.target.value } })}
                      placeholder="0.00"
                      className="h-12 rounded-xl bg-secondary border-0 font-display text-lg font-bold tabular"
                    />
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
          className="w-full mt-6 h-13 py-3.5 rounded-2xl bg-gradient-primary text-primary-foreground font-semibold shadow-elegant"
        >
          <CheckCircle2 className="h-5 w-5 mr-2" /> Save snapshot
        </Button>
      </div>
    </>
  );
}
