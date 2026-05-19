import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAccounts, useSnapshots } from "@/hooks/usePortfolioData";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { fmtMoney, monthKey, monthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CheckCircle2, Lock, SkipForward, Pencil } from "lucide-react";
import { useSafetyMode } from "@/hooks/useSafetyMode";
import { isMonthEditable, daysLeftUntilEditable } from "@/lib/snapshotRules";

type MonthState =
  | { kind: "filled"; total: number; filledAt: string }
  | { kind: "skipped" }
  | { kind: "locked"; daysLeft: number }
  | { kind: "empty" };

const FUTURE_MONTHS_AHEAD = 3;
const PAST_MONTHS_BACK = 11;

function addMonths(iso: string, delta: number): string {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1)).toISOString().slice(0, 10);
}

export default function Snapshot() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: accounts = [] } = useAccounts();
  const { data: snaps = [] } = useSnapshots();
  const { safe } = useSafetyMode();
  const [skipping, setSkipping] = useState<string | null>(null);

  const months = useMemo(() => {
    const current = monthKey(new Date());
    const set = new Set<string>();
    for (let i = -PAST_MONTHS_BACK; i <= FUTURE_MONTHS_AHEAD; i++) set.add(addMonths(current, i));
    for (const s of snaps) set.add(s.month);
    return Array.from(set).sort().reverse(); // latest on top
  }, [snaps]);

  const stateByMonth = useMemo(() => {
    const map: Record<string, MonthState> = {};
    for (const m of months) {
      const rows = snaps.filter((s) => s.month === m);
      const skipped = rows.some((r) => r.skipped);
      const filledRows = rows.filter((r) => !r.skipped);
      if (filledRows.length > 0) {
        const total = filledRows.reduce((a, r) => a + Number(r.amount_now), 0);
        const filledAt = filledRows
          .map((r) => r.updated_at ?? r.created_at)
          .sort()
          .slice(-1)[0]!;
        map[m] = { kind: "filled", total, filledAt };
      } else if (skipped) {
        map[m] = { kind: "skipped" };
      } else if (!isMonthEditable(m)) {
        map[m] = { kind: "locked", daysLeft: daysLeftUntilEditable(m) };
      } else {
        map[m] = { kind: "empty" };
      }
    }
    return map;
  }, [months, snaps]);

  const skip = async (month: string) => {
    if (!user) return;
    if (safe) return toast.error("Safety mode is on.");
    if (accounts.length === 0) return toast.error("Add an account first");
    setSkipping(month);
    const rows = accounts.map((a) => ({
      user_id: user.id,
      account_id: a.id,
      month,
      amount_now: 0,
      cash_portion: 0,
      skipped: true,
    }));
    const { error } = await supabase
      .from("snapshots")
      .upsert(rows, { onConflict: "user_id,account_id,month" });
    setSkipping(null);
    if (error) {
      console.error("Snapshot skip failed:", error);
      return toast.error("Couldn't skip month. Please try again.");
    }
    toast.success(`Skipped ${monthLabel(month)}`);
    qc.invalidateQueries({ queryKey: ["snapshots"] });
  };

  return (
    <>
      <ScreenHeader
        title="Snapshot"
        subtitle="Monthly balances, newest on top."
      />

      <div className="px-5 space-y-2 pb-8">
        {months.map((m) => {
          const st = stateByMonth[m];
          const clickable = st.kind === "filled" || st.kind === "empty";
          return (
            <div
              key={m}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : -1}
              onClick={() => clickable && navigate(`/snapshot/${m}`)}
              onKeyDown={(e) => {
                if (clickable && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  navigate(`/snapshot/${m}`);
                }
              }}
              className={cn(
                "rounded-2xl border border-border p-4 shadow-card animate-fade-in transition-all",
                st.kind === "filled" && "bg-gradient-card cursor-pointer hover:shadow-elegant hover:-translate-y-0.5",
                st.kind === "empty" && "bg-card cursor-pointer hover:shadow-elegant hover:-translate-y-0.5",
                (st.kind === "locked" || st.kind === "skipped") && "bg-muted/40 opacity-80",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-display text-lg font-bold leading-tight">{monthLabel(m)}</div>
                  {st.kind === "filled" && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Filled {new Date(st.filledAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </div>
                  )}
                  {st.kind === "skipped" && (
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Lock className="h-3 w-3" /> Skipped
                    </div>
                  )}
                  {st.kind === "locked" && (
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Lock className="h-3 w-3" />
                      {st.daysLeft > 0
                        ? `${st.daysLeft} day${st.daysLeft === 1 ? "" : "s"} left before you can create snapshot for ${monthLabel(m)}`
                        : `Opens in the last 3 days of ${monthLabel(m)}`}
                    </div>
                  )}
                  {st.kind === "empty" && (
                    <div className="text-xs text-muted-foreground mt-0.5">Not filled yet</div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {st.kind === "filled" && (
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</div>
                      <div className="font-display text-xl font-bold tabular">{fmtMoney(st.total)}</div>
                    </div>
                  )}
                  {st.kind === "empty" && (
                    <>
                      <Button
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); navigate(`/snapshot/${m}`); }}
                        className="rounded-xl bg-gradient-primary text-primary-foreground"
                      >
                        <Pencil className="h-4 w-4 mr-1" /> Fill
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={safe || skipping === m}
                        onClick={(e) => { e.stopPropagation(); skip(m); }}
                        className="rounded-xl"
                      >
                        <SkipForward className="h-4 w-4 mr-1" /> Skip
                      </Button>
                    </>
                  )}
                  {st.kind === "locked" && <Lock className="h-5 w-5 text-muted-foreground" />}
                  {st.kind === "skipped" && <Lock className="h-5 w-5 text-muted-foreground" />}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
