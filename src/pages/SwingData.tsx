import { useEffect, useState, useCallback } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSafetyMode } from "@/hooks/useSafetyMode";
import { cn } from "@/lib/utils";
import type { Trade, Quote } from "@/lib/tradeStats";
import { computeStats } from "@/lib/tradeStats";
import { fmtUsd, fmtUsdSigned } from "@/lib/format";

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

const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtDays = (n: number) => (n >= 1 ? `${n.toFixed(1)}d` : `${(n * 24).toFixed(1)}h`);
const fmtPF = (n: number) => (isFinite(n) ? n.toFixed(2) : "∞");

export default function SwingData() {
  const { user, session } = useAuth();
  useSafetyMode();
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
            <Stat label="Total PnL" value={fmtUsdSigned(s.totalPnl)} tone={s.totalPnl >= 0 ? "good" : "bad"} />
            <Stat label="Open PnL" value={fmtUsdSigned(s.openPnl)} tone={s.openPnl >= 0 ? "good" : "bad"} />
            <Stat label="Closed PnL" value={fmtUsdSigned(s.closedPnl)} tone={s.closedPnl >= 0 ? "good" : "bad"} />
          </div>
        </section>

        <section>
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Average position time
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Open · Winners" value={fmtDays(s.avgWinTimeOpen)} tone="good" />
            <Stat label="Open · Losers" value={fmtDays(s.avgLossTimeOpen)} tone="bad" />
            <Stat label="Closed · Winners" value={fmtDays(s.avgWinTimeClosed)} tone="good" />
            <Stat label="Closed · Losers" value={fmtDays(s.avgLossTimeClosed)} tone="bad" />
          </div>
        </section>

        <section>
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Average win / loss (all)
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Avg Win" value={fmtUsd(s.avgWin)} tone="good" />
            <Stat label="Avg Loss" value={fmtUsd(s.avgLoss)} tone="bad" />
            <Stat label="Avg Win % Equity" value={fmtPct(s.avgWinPct)} tone="good" />
            <Stat label="Avg Loss % Equity" value={fmtPct(s.avgLossPct)} tone="bad" />
          </div>
        </section>

        <section>
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Open positions
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Avg Winner" value={fmtUsd(s.avgWinOpen)} tone="good" />
            <Stat label="Avg Loser" value={fmtUsd(s.avgLossOpen)} tone="bad" />
            <Stat label="Win Rate" value={fmtPct(s.winRateOpen)} />
            <Stat label="R:R" value={s.rrOpen.toFixed(2)} />
            <Stat
              label="Profit Factor"
              value={fmtPF(s.profitFactorOpen)}
              tone={s.profitFactorOpen >= 1 ? "good" : "bad"}
            />
          </div>
        </section>

        <section>
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Closed positions
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Avg Winner" value={fmtUsd(s.avgWinClosed)} tone="good" />
            <Stat label="Avg Loser" value={fmtUsd(s.avgLossClosed)} tone="bad" />
            <Stat label="Win Rate" value={fmtPct(s.winRateClosed)} />
            <Stat label="R:R" value={s.rrClosed.toFixed(2)} />
            <Stat
              label="Profit Factor"
              value={fmtPF(s.profitFactorClosed)}
              tone={s.profitFactorClosed >= 1 ? "good" : "bad"}
            />
          </div>
        </section>

        <section>
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Risk & exposure
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="Net if All SL Hit"
              value={fmtUsdSigned(s.netIfAllSlHit)}
              tone={s.netIfAllSlHit >= 0 ? "good" : "bad"}
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
              value={fmtUsdSigned(s.expectancy)}
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
