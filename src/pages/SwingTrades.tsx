import { useState, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { AddTradeDialog } from "@/components/AddTradeDialog";

type SwingTrade = {
  id: string;
  status: string;
  ticker: string;
  direction: string;
  capital_invested: number;
  entry_price: number;
  exit_price: number | null;
  entry_date: string;
  exit_date: string | null;
  stop_loss: number | null;
  notes: string | null;
};

type Quote = { c: number; dp: number; d: number } | null;

export default function SwingTrades() {
  const { user, session } = useAuth();
  const [trades, setTrades] = useState<SwingTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});

  const fetchTrades = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("swing_trades")
      .select("*")
      .eq("user_id", user.id)
      .order("entry_date", { ascending: false });
    if (error) toast.error(error.message);
    else setTrades(data ?? []);
    setLoading(false);
  };

  const fetchQuotes = useCallback(async () => {
    if (!session) return;
    const activeTickers = trades
      .filter((t) => t.status === "active")
      .map((t) => t.ticker);
    if (activeTickers.length === 0) return;

    const unique = [...new Set(activeTickers)];
    try {
      const { data, error } = await supabase.functions.invoke("finnhub-quotes", {
        body: { tickers: unique },
      });
      if (error) {
        console.error("Quote fetch error:", error);
        return;
      }
      if (data?.quotes) {
        setQuotes(data.quotes);
      }
    } catch (e) {
      console.error("Quote fetch failed:", e);
    }
  }, [session, trades]);

  useEffect(() => {
    fetchTrades();
  }, [user]);

  // Poll quotes every 15 seconds for active trades
  useEffect(() => {
    if (trades.length === 0) return;
    fetchQuotes();
    const interval = setInterval(fetchQuotes, 15000);
    return () => clearInterval(interval);
  }, [fetchQuotes, trades]);

  const getPnl = (trade: SwingTrade, quote: Quote) => {
    if (!quote || quote.c === 0) return null;
    const currentPrice = trade.exit_price ?? quote.c;
    const shares = trade.capital_invested / trade.entry_price;
    const pnl =
      trade.direction === "long"
        ? (currentPrice - trade.entry_price) * shares
        : (trade.entry_price - currentPrice) * shares;
    const pnlPct = (pnl / trade.capital_invested) * 100;
    return { pnl, pnlPct };
  };

  return (
    <>
      <ScreenHeader title="Trades" subtitle="Track your swing trades" />
      <div className="px-5 mt-5 pb-24">
        {loading ? (
          <div className="text-center text-sm text-muted-foreground py-10">Loading…</div>
        ) : trades.length === 0 ? (
          <div className="rounded-2xl bg-card border border-border p-6 text-center text-sm text-muted-foreground">
            No trades yet. Tap + to add your first trade.
          </div>
        ) : (
          <div className="space-y-3">
            {trades.map((t) => {
              const quote = quotes[t.ticker] ?? null;
              const pnlData = t.status === "active" ? getPnl(t, quote) : null;

              return (
                <div
                  key={t.id}
                  className="rounded-2xl bg-card border border-border p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{t.ticker}</span>
                      <span
                        className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full",
                          t.direction === "long"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-red-500/20 text-red-400"
                        )}
                      >
                        {t.direction.toUpperCase()}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full",
                          t.status === "active"
                            ? "bg-primary/20 text-primary"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {t.status}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-foreground">
                        ${Number(t.capital_invested).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <div className="text-xs text-muted-foreground">
                      Entry {format(new Date(t.entry_date), "MMM d, yyyy")} · ${t.entry_price}
                      {t.stop_loss != null && ` · SL $${t.stop_loss}`}
                    </div>
                    {t.exit_price && (
                      <div className="text-xs text-muted-foreground">Exit ${t.exit_price}</div>
                    )}
                  </div>

                  {/* Live price + PnL for active trades */}
                  {t.status === "active" && quote && quote.c > 0 && (
                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="text-xs text-muted-foreground">Live</div>
                          <div className="text-sm font-semibold text-foreground">
                            ${quote.c.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Day</div>
                          <div
                            className={cn(
                              "text-sm font-medium",
                              quote.dp >= 0 ? "text-emerald-400" : "text-red-400"
                            )}
                          >
                            {quote.dp >= 0 ? "+" : ""}
                            {quote.dp.toFixed(2)}%
                          </div>
                        </div>
                      </div>
                      {pnlData && (
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Unrealized P&L</div>
                          <div
                            className={cn(
                              "text-sm font-semibold",
                              pnlData.pnl >= 0 ? "text-emerald-400" : "text-red-400"
                            )}
                          >
                            {pnlData.pnl >= 0 ? "+" : ""}${pnlData.pnl.toFixed(2)}{" "}
                            <span className="text-xs font-normal">
                              ({pnlData.pnlPct >= 0 ? "+" : ""}{pnlData.pnlPct.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setDialogOpen(true)}
        className="fixed bottom-24 right-5 z-30 h-14 w-14 rounded-full bg-emerald-500 text-white shadow-lg flex items-center justify-center hover:bg-emerald-600 transition-colors active:scale-95"
      >
        <Plus className="h-7 w-7" />
      </button>

      <AddTradeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={fetchTrades}
      />
    </>
  );
}
