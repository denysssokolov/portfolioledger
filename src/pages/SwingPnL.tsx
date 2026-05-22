import { useEffect, useState, useCallback, useMemo } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { AddTradeDialog } from "@/components/AddTradeDialog";
import type { Trade, Quote } from "@/lib/tradeStats";
import { pnlOf, sharesOf, riskAtStop } from "@/lib/tradeStats";

type Group = {
  ticker: string;
  trades: Trade[];
  open: Trade[];
  currentPrice: number | null;
  stopLoss: number | null;
  totalPnl: number;
  equityTaken: number;
};

export default function SwingPnL() {
  const { user, session } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [accountSize, setAccountSize] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Trade | null>(null);
  const [addingTicker, setAddingTicker] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchTrades = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("swing_trades")
      .select("*")
      .eq("user_id", user.id)
      .order("entry_date", { ascending: false });
    setTrades(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchTrades();
    if (!user) return;
    supabase
      .from("swing_settings")
      .select("account_size")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setAccountSize(data?.account_size ?? null));
  }, [user, fetchTrades]);

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

  const groups: Group[] = useMemo(() => {
    const map = new Map<string, Trade[]>();
    trades.forEach((t) => {
      const arr = map.get(t.ticker) ?? [];
      arr.push(t);
      map.set(t.ticker, arr);
    });
    return Array.from(map.entries())
      .map(([ticker, arr]) => {
        const q = quotes[ticker] ?? null;
        const open = arr.filter((t) => t.status === "active");
        const totalPnl = arr.reduce((s, t) => s + (pnlOf(t, q) ?? 0), 0);
        const equityTaken = open.reduce((s, t) => s + t.capital_invested, 0);
        // Weighted average stop loss (across open trades that have one)
        const withSl = open.filter((t) => t.stop_loss != null);
        const stopLoss =
          withSl.length === 0
            ? null
            : withSl.reduce((s, t) => s + (t.stop_loss as number) * sharesOf(t), 0) /
              withSl.reduce((s, t) => s + sharesOf(t), 0);
        return {
          ticker,
          trades: arr,
          open,
          currentPrice: q?.c ?? null,
          stopLoss,
          totalPnl,
          equityTaken,
        };
      })
      .sort((a, b) => b.totalPnl - a.totalPnl);
  }, [trades, quotes]);

  const closeTradeNow = async (t: Trade) => {
    const q = quotes[t.ticker] ?? null;
    const px = q?.c;
    if (!px) {
      toast.error("No live price available; open trade to set exit price.");
      return;
    }
    if (!confirm(`Close ${t.ticker} at $${px.toFixed(2)}?`)) return;
    const { error } = await supabase
      .from("swing_trades")
      .update({
        status: "closed",
        exit_price: px,
        exit_date: format(new Date(), "yyyy-MM-dd"),
      })
      .eq("id", t.id);
    if (error) {
      toast.error("Couldn't close trade");
      return;
    }
    toast.success("Trade closed");
    fetchTrades();
  };

  return (
    <>
      <ScreenHeader title="PnL" subtitle="Aggregated by stock" />
      <div className="px-5 mt-5 pb-28">
        {loading ? (
          <div className="text-center text-sm text-muted-foreground py-10">Loading…</div>
        ) : groups.length === 0 ? (
          <div className="rounded-2xl bg-card border border-border p-6 text-center text-sm text-muted-foreground">
            Add trades to see PnL.
          </div>
        ) : (
          <div className="space-y-2">
            {groups.map((g) => {
              const isOpen = expanded[g.ticker];
              const equityPct =
                accountSize && accountSize > 0
                  ? (g.equityTaken / accountSize) * 100
                  : null;
              return (
                <div
                  key={g.ticker}
                  className="rounded-xl bg-card border border-border overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpanded((s) => ({ ...s, [g.ticker]: !s[g.ticker] }))
                    }
                    className="w-full px-3 py-2.5 flex items-center gap-2 text-left hover:bg-muted/30"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm">{g.ticker}</span>
                        <span
                          className={cn(
                            "text-sm font-semibold",
                            g.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"
                          )}
                        >
                          {g.totalPnl >= 0 ? "+" : ""}${g.totalPnl.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mt-0.5">
                        <span>
                          {g.currentPrice != null
                            ? `$${g.currentPrice.toFixed(2)}`
                            : "—"}
                          {g.stopLoss != null && (
                            <span className="ml-2 text-red-400/80">
                              SL ${g.stopLoss.toFixed(2)}
                            </span>
                          )}
                        </span>
                        <span>
                          Equity ${g.equityTaken.toFixed(0)}
                          {equityPct != null && ` (${equityPct.toFixed(1)}%)`}
                        </span>
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-border bg-background/30">
                      <div className="divide-y divide-border">
                        {g.trades.map((t) => {
                          const q = quotes[t.ticker] ?? null;
                          const pnl = pnlOf(t, q);
                          const risk = riskAtStop(t);
                          return (
                            <div key={t.id} className="px-3 py-2.5 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={cn(
                                      "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                                      t.direction === "long"
                                        ? "bg-emerald-500/20 text-emerald-400"
                                        : "bg-red-500/20 text-red-400"
                                    )}
                                  >
                                    {t.direction.toUpperCase()}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {format(new Date(t.entry_date), "MMM d")} · $
                                    {t.capital_invested.toFixed(0)}
                                  </span>
                                  {t.status === "closed" && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                                      CLOSED
                                    </span>
                                  )}
                                </div>
                                {pnl != null && (
                                  <span
                                    className={cn(
                                      "font-semibold",
                                      pnl >= 0 ? "text-emerald-400" : "text-red-400"
                                    )}
                                  >
                                    {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
                                <span>
                                  {risk != null && t.status === "active"
                                    ? `Risk if SL: $${risk.toFixed(2)}`
                                    : "—"}
                                </span>
                                <div className="flex gap-3">
                                  <button
                                    onClick={() => {
                                      setEditing(t);
                                      setAddingTicker(null);
                                      setDialogOpen(true);
                                    }}
                                    className="text-primary hover:underline"
                                  >
                                    Edit
                                  </button>
                                  {t.status === "active" && (
                                    <button
                                      onClick={() => closeTradeNow(t)}
                                      className="text-red-400 hover:underline"
                                    >
                                      Close
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <button
                        onClick={() => {
                          setEditing(null);
                          setAddingTicker(g.ticker);
                          setDialogOpen(true);
                        }}
                        className="w-full px-3 py-2 text-xs font-medium text-primary hover:bg-muted/30 flex items-center justify-center gap-1 border-t border-border"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add {g.ticker} trade
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AddTradeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={fetchTrades}
        trade={editing}
        defaultTicker={addingTicker ?? undefined}
      />
    </>
  );
}
