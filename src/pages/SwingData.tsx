import { useEffect, useState, useCallback } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import type { Trade, Quote } from "@/lib/tradeStats";
import { computeStats } from "@/lib/tradeStats";

const Stat = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "neutral";
}) => (
  <div className="rounded-xl bg-card border border-border p-3">
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
      {label}
    </div>
    <div
      className={cn(
        "text-base font-semibold mt-1",
        tone === "good" && "text-emerald-400",
        tone === "bad" && "text-red-400"
      )}
    >
      {value}
    </div>
  </div>
);

const fmt = (n: number, prefix = "$") =>
  `${n < 0 ? "-" : ""}${prefix}${Math.abs(n).toFixed(2)}`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export default function SwingData() {
  const { user, session } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [accountSize, setAccountSize] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("swing_trades").select("*").eq("user_id", user.id),
      supabase.from("swing_settings").select("account_size").eq("user_id", user.id).maybeSingle(),
    ]).then(([tRes, sRes]) => {
      setTrades(tRes.data ?? []);
      setAccountSize(sRes.data?.account_size ?? 0);
      setLoading(false);
    });
  }, [user]);

  const fetchQuotes = useCallback(async () => {
    if (!session) return;
    const tickers = [...new Set(trades.filter((t) => t.status === "active").map((t) => t.ticker))];
    if (!tickers.length) return;
    const { data } = await supabase.functions.invoke("finnhub-quotes", { body: { tickers } });
    if (data?.quotes) setQuotes(data.quotes);
  }, [session, trades]);

  useEffect(() => {
    if (!trades.length) return;
    fetchQuotes();
    const i = setInterval(fetchQuotes, 15000);
    return () => clearInterval(i);
  }, [fetchQuotes, trades]);

  const s = computeStats(trades, quotes, accountSize);

  if (loading) {
    return (
      <>
        <ScreenHeader title="Data" subtitle="Performance analytics" />
        <div className="text-center text-sm text-muted-foreground py-10">Loading…</div>
      </>
    );
  }

  return (
    <>
      <ScreenHeader title="Data" subtitle="Performance analytics" />
      <div className="px-5 mt-5 pb-28 space-y-5">
        <section>
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Profit & Loss
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Total PnL" value={fmt(s.totalPnl)} tone={s.totalPnl >= 0 ? "good" : "bad"} />
            <Stat label="Open PnL" value={fmt(s.openPnl)} tone={s.openPnl >= 0 ? "good" : "bad"} />
            <Stat label="Closed PnL" value={fmt(s.closedPnl)} tone={s.closedPnl >= 0 ? "good" : "bad"} />
          </div>
        </section>

        <section>
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Averages
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Avg Win" value={fmt(s.avgWin)} tone="good" />
            <Stat label="Avg Loss" value={fmt(s.avgLoss)} tone="bad" />
            <Stat label="Avg Win % Equity" value={fmtPct(s.avgWinPct)} tone="good" />
            <Stat label="Avg Loss % Equity" value={fmtPct(s.avgLossPct)} tone="bad" />
          </div>
        </section>

        <section>
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Win rate & R:R
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Win Rate Open" value={fmtPct(s.winRateOpen)} />
            <Stat label="Win Rate Closed" value={fmtPct(s.winRateClosed)} />
            <Stat label="R:R Open" value={s.rrOpen.toFixed(2)} />
            <Stat label="R:R Closed" value={s.rrClosed.toFixed(2)} />
          </div>
        </section>

        <section>
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Risk & exposure
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="Total Loss if All SL Hit"
              value={fmt(-s.totalRiskOpen)}
              tone="bad"
            />
            <Stat label="Trades" value={String(s.numTrades)} />
            <Stat label="Open" value={String(s.numOpen)} />
            <Stat label="Closed" value={String(s.numClosed)} />
          </div>
        </section>

        <section>
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Advanced
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Sharpe" value={s.sharpe.toFixed(2)} />
            <Stat
              label="Expectancy"
              value={fmt(s.expectancy)}
              tone={s.expectancy >= 0 ? "good" : "bad"}
            />
            <Stat
              label="Profit Factor"
              value={isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞"}
            />
          </div>
        </section>

        {accountSize <= 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Set your account size in Settings for equity-based percentages.
          </p>
        )}
      </div>
    </>
  );
}
