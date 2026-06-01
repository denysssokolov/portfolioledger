import { useEffect, useState, useCallback, useMemo } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Plus, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { AddTradeDialog } from "@/components/AddTradeDialog";
import type { Trade } from "@/lib/tradeStats";
import { pnlOf, sharesOf, riskAtStop } from "@/lib/tradeStats";
import { fmtUsd, fmtUsdSigned } from "@/lib/format";
import { useSafetyMode } from "@/hooks/useSafetyMode";
import { useQuotes } from "@/hooks/useQuotes";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type Group = {
  ticker: string;
  trades: Trade[];
  open: Trade[];
  currentPrice: number | null;
  stopLoss: number | null;
  totalPnl: number;
  equityTaken: number;
  totalRiskAtStop: number | null;
};

export default function SwingPnL() {
  const { user } = useAuth();
  useSafetyMode();
  const [trades, setTrades] = useState<Trade[]>([]);
  const quotes = useQuotes();
  const [accountSize, setAccountSize] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Trade | null>(null);
  const [addingTicker, setAddingTicker] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showClosed, setShowClosed] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<"open" | "closed">("open");

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
        const totalRiskAtStop =
          withSl.length === 0
            ? null
            : withSl.reduce((s, t) => s + (riskAtStop(t) ?? 0), 0);
        return {
          ticker,
          trades: arr,
          open,
          currentPrice: q?.c ?? null,
          stopLoss,
          totalPnl,
          equityTaken,
          totalRiskAtStop,
        };
      })
      .sort((a, b) => b.totalPnl - a.totalPnl);
  }, [trades, quotes]);

  const openGroups = useMemo(
    () => groups.filter((g) => g.open.length > 0),
    [groups]
  );
  const closedGroups = useMemo(
    () => groups.filter((g) => g.open.length === 0),
    [groups]
  );

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

  const closeAllOfTicker = async (ticker: string, openTrades: Trade[]) => {
    const q = quotes[ticker] ?? null;
    const px = q?.c;
    if (!px) {
      toast.error("No live price available.");
      return;
    }
    if (!confirm(`Close all ${openTrades.length} open ${ticker} positions at $${px.toFixed(2)}?`)) return;
    const today = format(new Date(), "yyyy-MM-dd");
    const ids = openTrades.map((t) => t.id);
    const { error } = await supabase
      .from("swing_trades")
      .update({ status: "closed", exit_price: px, exit_date: today })
      .in("id", ids);
    if (error) {
      toast.error("Couldn't close all trades");
      return;
    }
    toast.success(`Closed ${openTrades.length} ${ticker} positions`);
    fetchTrades();
  };

  const deleteTrade = async (t: Trade) => {
    if (!confirm(`Delete this ${t.ticker} trade? This cannot be undone.`)) return;
    const { error } = await supabase.from("swing_trades").delete().eq("id", t.id);
    if (error) {
      toast.error("Couldn't delete trade");
      return;
    }
    toast.success("Trade deleted");
    fetchTrades();
  };

  return (
    <>
      <ScreenHeader title="PnL" subtitle="Aggregated by stock" />
      <div className="px-5 mt-5 pb-28">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "open" | "closed")}>
          <TabsList className="grid grid-cols-2 w-full mb-4">
            <TabsTrigger value="open">Open ({openGroups.length})</TabsTrigger>
            <TabsTrigger value="closed">Closed ({closedGroups.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="open">
            {loading ? (
              <div className="text-center text-sm text-muted-foreground py-10">Loading…</div>
            ) : openGroups.length === 0 ? (
              <div className="rounded-2xl bg-card border border-border p-6 text-center text-sm text-muted-foreground">
                No open positions.
              </div>
            ) : (
              <div className="space-y-2">
                {openGroups.map((g) => {
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
                          {fmtUsdSigned(g.totalPnl)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mt-0.5">
                        <span>
                          {g.currentPrice != null ? fmtUsd(g.currentPrice) : "—"}
                          {g.stopLoss != null && (
                            <span className="ml-2 text-red-400/80">
                              SL {fmtUsd(g.stopLoss)}
                              {g.totalRiskAtStop != null && (
                                <span
                                  className={cn(
                                    g.totalRiskAtStop >= 0 ? "text-emerald-400" : "text-red-400"
                                  )}
                                >
                                  {" "}({fmtUsdSigned(g.totalRiskAtStop)})
                                </span>
                              )}
                            </span>
                          )}
                        </span>
                        <span>
                          Equity {fmtUsd(g.equityTaken, 0)}
                          {equityPct != null && ` (${equityPct.toFixed(1)}%)`}
                        </span>
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-border bg-background/30">
                      <div className="divide-y divide-border">
                        {g.trades
                          .filter((t) => t.status === "active")
                          .map((t) => {
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
                                      {format(new Date(t.entry_date), "MMM d")} ·{" "}
                                      {fmtUsd(t.capital_invested, 0)}
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
                                      {fmtUsdSigned(pnl)}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
                                  <span>
                                    {risk != null && t.status === "active"
                                      ? `${risk >= 0 ? "Profit" : "Loss"} if SL: ${fmtUsdSigned(risk)}`
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
                                    <button
                                      onClick={() => deleteTrade(t)}
                                      className="text-red-400 hover:underline"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>

                      {/* Show / hide closed positions */}
                      {g.trades.some((t) => t.status === "closed") && (
                        <>
                          <button
                            onClick={() =>
                              setShowClosed((s) => ({ ...s, [g.ticker]: !s[g.ticker] }))
                            }
                            className="w-full px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/30 flex items-center justify-center gap-1.5 border-t border-border"
                          >
                            {showClosed[g.ticker] ? (
                              <>
                                <EyeOff className="h-3.5 w-3.5" /> Hide closed positions
                              </>
                            ) : (
                              <>
                                <Eye className="h-3.5 w-3.5" /> Show closed positions
                              </>
                            )}
                          </button>
                          {showClosed[g.ticker] && (
                            <div className="divide-y divide-border border-t border-border bg-muted/10">
                              {g.trades
                                .filter((t) => t.status === "closed")
                                .slice()
                                .sort((a, b) => {
                                  const ad = a.exit_date ?? a.entry_date;
                                  const bd = b.exit_date ?? b.entry_date;
                                  return bd.localeCompare(ad);
                                })
                                .map((t) => {
                                  const q = quotes[t.ticker] ?? null;
                                  const pnl = pnlOf(t, q);
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
                                            {format(new Date(t.entry_date), "MMM d")}
                                            {t.exit_date && ` → ${format(new Date(t.exit_date), "MMM d")}`}
                                            {" · "}
                                            {fmtUsd(t.capital_invested, 0)}
                                          </span>
                                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                                            CLOSED
                                          </span>
                                        </div>
                                        {pnl != null && (
                                          <span
                                            className={cn(
                                              "font-semibold",
                                              pnl >= 0 ? "text-emerald-400" : "text-red-400"
                                            )}
                                          >
                                            {fmtUsdSigned(pnl)}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center justify-end mt-1 text-[11px]">
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
                                        <button
                                          onClick={() => deleteTrade(t)}
                                          className="text-red-400 hover:underline"
                                        >
                                          Delete
                                        </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </>
                      )}

                      {/* Close all + Add trade buttons */}
                      <div className="grid grid-cols-2 gap-0 border-t border-border">
                        {g.open.length > 0 && (
                          <button
                            onClick={() => closeAllOfTicker(g.ticker, g.open)}
                            className="px-3 py-2 text-xs font-medium text-red-400 hover:bg-muted/30 flex items-center justify-center gap-1"
                          >
                            Close all ({g.open.length})
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setEditing(null);
                            setAddingTicker(g.ticker);
                            setDialogOpen(true);
                          }}
                          className={cn(
                            "px-3 py-2 text-xs font-medium text-primary hover:bg-muted/30 flex items-center justify-center gap-1",
                            g.open.length === 0 ? "col-span-2" : ""
                          )}
                        >
                          <Plus className="h-3.5 w-3.5" /> Add {g.ticker} trade
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="closed">
            {loading ? (
              <div className="text-center text-sm text-muted-foreground py-10">Loading…</div>
            ) : closedGroups.length === 0 ? (
              <div className="rounded-2xl bg-card border border-border p-6 text-center text-sm text-muted-foreground">
                No fully-closed tickers yet.
              </div>
            ) : (
              <div className="space-y-2">
                {closedGroups.map((g) => {
                  const isOpen = expanded[g.ticker];
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
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm">{g.ticker}</span>
                        <span
                          className={cn(
                            "text-sm font-semibold",
                            g.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"
                          )}
                        >
                          {fmtUsdSigned(g.totalPnl)}
                        </span>
                      </div>
                    </button>
                    {isOpen && (
                    <div className="divide-y divide-border border-t border-border bg-background/30">
                      {g.trades
                        .slice()
                        .sort((a, b) => {
                          const ad = a.exit_date ?? a.entry_date;
                          const bd = b.exit_date ?? b.entry_date;
                          return bd.localeCompare(ad);
                        })
                        .map((t) => {
                          const pnl = pnlOf(t, null);
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
                                    {format(new Date(t.entry_date), "MMM d")}
                                    {t.exit_date && ` → ${format(new Date(t.exit_date), "MMM d")}`}
                                    {" · "}
                                    {fmtUsd(t.capital_invested, 0)}
                                  </span>
                                </div>
                                {pnl != null && (
                                  <span
                                    className={cn(
                                      "font-semibold",
                                      pnl >= 0 ? "text-emerald-400" : "text-red-400"
                                    )}
                                  >
                                    {fmtUsdSigned(pnl)}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
                                <span>
                                  Entry {fmtUsd(t.entry_price)}
                                  {t.exit_price != null && ` · Exit ${fmtUsd(t.exit_price)}`}
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
                                  <button
                                    onClick={() => deleteTrade(t)}
                                    className="text-red-400 hover:underline"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
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
