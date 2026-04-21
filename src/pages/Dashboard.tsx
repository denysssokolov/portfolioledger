import { useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import {
  useAccounts, useProfile, useRealisedPnL, useSnapshots, useTransactions,
} from "@/hooks/usePortfolioData";
import { useAuth } from "@/hooks/useAuth";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { fmtMoney, fmtPct, fmtSigned, monthLabel } from "@/lib/format";
import {
  investedByAccount, latestSnapshotByAccount, liveBalanceByAccount, netContributions,
  previousMonthISO, totalsForMonth, uniqueMonths,
} from "@/lib/calc";
import { ArrowDownRight, ArrowUpRight, Briefcase, ChevronRight, LogOut, Plus, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import TransactionForm from "@/components/TransactionForm";
import { useSafetyMode } from "@/hooks/useSafetyMode";

const ASSET_COLORS: Record<string, string> = {
  Cash: "hsl(215 14% 65%)",
  Shares: "hsl(152 76% 56%)",
  Crypto: "hsl(280 80% 65%)",
};

export default function Dashboard() {
  const { signOut, user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const { data: accounts = [] } = useAccounts();
  const { data: txs = [] } = useTransactions();
  const { data: snaps = [] } = useSnapshots();
  const { data: rpnl = [] } = useRealisedPnL();
  const [open, setOpen] = useState(false);
  useSafetyMode(); // re-render when safety mode toggles

  const months = useMemo(() => uniqueMonths(snaps), [snaps]);
  const latestMonth = months[months.length - 1];
  const prevMonth = latestMonth ? previousMonthISO(latestMonth) : null;

  const latestByAccount = useMemo(() => latestSnapshotByAccount(snaps), [snaps]);
  const live = useMemo(() => liveBalanceByAccount(accounts, snaps, txs), [accounts, snaps, txs]);

  // totals (live)
  // Total portfolio = sum of each account's "amount now" (which already includes its cash slice).
  // Cash position is a subset of that total — it's the cash held inside any account.
  const totalValue = Object.values(live).reduce((a, l) => a + l.value, 0);
  const cashPosition = Object.values(live).reduce((a, l) => a + l.cash, 0);
  const investedAll = useMemo(() => investedByAccount(txs), [txs]);
  const investedTotal = Object.values(investedAll).reduce((a, v) => a + v, 0);
  const unrealised = totalValue - investedTotal;
  const realisedLifetime = rpnl.reduce((a, r) => a + Number(r.amount), 0);
  const totalPnL = unrealised + realisedLifetime;
  const totalPnLPct = investedTotal > 0 ? (totalPnL / investedTotal) * 100 : 0;

  // monthly return
  const monthlyReturn = useMemo(() => {
    if (!latestMonth || !prevMonth) return null;
    const cur = totalsForMonth(latestMonth, snaps).total;
    const prev = totalsForMonth(prevMonth, snaps).total;
    if (prev <= 0) return null;
    const net = netContributions(txs, latestMonth);
    return ((cur - prev - net) / prev) * 100;
  }, [latestMonth, prevMonth, snaps, txs]);

  // Growth chart series
  const growth = useMemo(
    () => months.map((m) => ({
      month: m,
      label: new Date(m).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
      value: totalsForMonth(m, snaps).total,
    })),
    [months, snaps]
  );

  // Allocation by asset class — uses live balances split into cash vs main asset
  const allocation = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const a of accounts) {
      const l = live[a.id];
      if (!l) continue;
      if (a.asset_class === "Cash") {
        totals.Cash = (totals.Cash ?? 0) + l.value;
      } else {
        totals[a.asset_class] = (totals[a.asset_class] ?? 0) + l.nonCash;
        totals.Cash = (totals.Cash ?? 0) + l.cash;
      }
    }
    const arr = Object.entries(totals)
      .map(([name, value]) => ({ name, value: Math.max(0, value) }))
      .filter((x) => x.value > 0);
    const sum = arr.reduce((a, x) => a + x.value, 0) || 1;
    return arr.map((x) => ({ ...x, pct: (x.value / sum) * 100 }));
  }, [live, accounts]);

  // Per-account table (live)
  const accountRows = useMemo(() =>
    accounts.map((a) => {
      const l = live[a.id];
      const value = l?.value ?? 0;
      const cash = l?.cash ?? 0;
      const nonCash = l?.nonCash ?? 0;
      const sinceSnap = l?.sinceSnapshot ?? 0;
      const invested = investedAll[a.id] ?? 0;
      const pnl = value - invested;
      const pct = invested > 0 ? (pnl / invested) * 100 : 0;
      return { id: a.id, name: a.name, asset_class: a.asset_class, invested, value, pnl, pct, cash, nonCash, sinceSnap };
    }), [accounts, live, investedAll]);

  const isUp = totalPnL >= 0;

  return (
    <>
      <div className="bg-gradient-hero">
        <ScreenHeader
          title={`Hi${
            profile?.display_name
              ? ", " + profile.display_name
              : user?.user_metadata?.display_name
              ? ", " + user.user_metadata.display_name
              : ""
          }`}
          subtitle={latestMonth ? `${new Date().getDate()} ${monthLabel(latestMonth)}` : "No snapshots yet"}
          right={
            <Button size="icon" variant="ghost" onClick={() => signOut()}
              className="h-10 w-10 rounded-xl text-muted-foreground hover:text-foreground">
              <LogOut className="h-4 w-4" />
            </Button>
          }
        />

        <div className="px-5 pb-6 animate-slide-up">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Total portfolio</div>
          <div className="font-display text-5xl font-bold tabular mt-1 leading-none">
            {fmtMoney(totalValue)}
          </div>
          <div className={cn(
            "inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full text-sm font-semibold",
            isUp ? "bg-success/10 text-success" : "bg-loss/10 text-loss"
          )}>
            {isUp ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
            <span className="tabular">{fmtSigned(totalPnL)}</span>
            <span className="opacity-70 tabular">{fmtPct(totalPnLPct)}</span>
          </div>
        </div>
      </div>

      <div className="px-5 grid grid-cols-4 gap-2 -mt-2">
        <MiniStat label="Invested" value={fmtMoney(investedTotal)} />
        <MiniStat label="Cash" value={fmtMoney(cashPosition)} />
        <MiniStat label="Unrealised" value={fmtSigned(unrealised)} tone={unrealised >= 0 ? "up" : "down"} />
        <MiniStat
          label="Realised"
          value={fmtSigned(realisedLifetime)}
          tone={realisedLifetime >= 0 ? "up" : "down"}
        />
      </div>

      {/* Growth chart */}
      <div className="px-5 mt-5">
        <Card title="Portfolio growth">
          {growth.length < 2 ? (
            <EmptyHint>Add at least 2 monthly snapshots to see your growth chart.</EmptyHint>
          ) : (
            <div className="h-48 -mx-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={growth} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
                    tickFormatter={(v) => fmtMoney(v)} width={60} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                    labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                    formatter={(v: number) => [fmtMoney(v), "Value"]}
                  />
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#gv)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Allocation */}
      <div className="px-5 mt-3">
        <Card title="Asset allocation">
          {allocation.length === 0 ? (
            <EmptyHint>Save a snapshot to see your allocation.</EmptyHint>
          ) : (
            <div className="flex items-center gap-4">
              <div className="h-36 w-36 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={allocation} dataKey="value" innerRadius={42} outerRadius={62} paddingAngle={2} stroke="none">
                      {allocation.map((a) => (
                        <Cell key={a.name} fill={ASSET_COLORS[a.name] ?? "hsl(var(--muted-foreground))"} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2">
                {allocation.map((a) => (
                  <div key={a.name} className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: ASSET_COLORS[a.name] }} />
                    <div className="flex-1 text-sm">{a.name}</div>
                    <div className="text-sm tabular text-muted-foreground">{a.pct.toFixed(0)}%</div>
                    <div className="text-sm tabular font-medium w-20 text-right">{fmtMoney(a.value)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Accounts table */}
      <div className="px-5 mt-3">
        <Card title="Accounts">
          {accountRows.length === 0 ? (
            <EmptyHint>No accounts yet.</EmptyHint>
          ) : (
            <div className="divide-y divide-border -mx-1">
              {accountRows.map((r) => {
                const isCash = r.asset_class === "Cash";
                return (
                  <div key={r.id} className="py-3 px-1 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{r.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {isCash ? (
                          <>Cash {fmtMoney(r.value)}</>
                        ) : (
                          <>
                            {r.asset_class} {fmtMoney(r.nonCash)} · Cash {fmtMoney(r.cash)}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-display font-bold tabular">{fmtMoney(r.value)}</div>
                      <div className={cn("text-xs tabular", r.pnl >= 0 ? "text-success" : "text-loss")}>
                        {fmtSigned(r.pnl)} · {fmtPct(r.pct)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Floating quick add */}
      <Button
        onClick={() => setOpen(true)}
        size="icon"
        className="fixed bottom-24 right-5 h-14 w-14 rounded-full bg-gradient-primary text-primary-foreground shadow-elegant z-30"
        aria-label="Quick add transaction"
      >
        <Plus className="h-6 w-6" strokeWidth={2.6} />
      </Button>

      <TransactionForm open={open} onOpenChange={setOpen} accounts={accounts} />
    </>
  );
}

const Card = ({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) => (
  <div className="rounded-2xl bg-card border border-border p-4 shadow-card animate-fade-in">
    <div className="flex items-center justify-between mb-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
      {icon}
    </div>
    {children}
  </div>
);

const MiniStat = ({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) => (
  <div className="rounded-2xl bg-card border border-border p-3">
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className={cn(
      "font-display font-bold tabular mt-1 text-sm",
      tone === "up" && "text-success",
      tone === "down" && "text-loss",
    )}>{value}</div>
  </div>
);

const EmptyHint = ({ children }: { children: React.ReactNode }) => (
  <div className="text-sm text-muted-foreground py-4">{children}</div>
);

