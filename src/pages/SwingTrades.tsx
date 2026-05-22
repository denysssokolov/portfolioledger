import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Search } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { AddTradeDialog } from "@/components/AddTradeDialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Trade, Quote } from "@/lib/tradeStats";
import { pnlOf, pnlPctOf } from "@/lib/tradeStats";

export default function SwingTrades() {
  const { user, session } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Trade | null>(null);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [accountSize, setAccountSize] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState<string>("all");

  const fetchTrades = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("swing_trades")
      .select("*")
      .eq("user_id", user.id)
      .order("entry_date", { ascending: false });
    if (error) {
      console.error("swing_trades fetch error:", error);
      toast.error("Couldn't load trades. Please try again.");
    } else setTrades(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    supabase
      .from("swing_settings")
      .select("account_size")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setAccountSize(data?.account_size ?? null));
  }, [user]);

  const fetchQuotes = useCallback(async () => {
    if (!session) return;
    const activeTickers = trades.filter((t) => t.status === "active").map((t) => t.ticker);
    if (activeTickers.length === 0) return;
    const unique = [...new Set(activeTickers)];
    try {
      const { data, error } = await supabase.functions.invoke("finnhub-quotes", {
        body: { tickers: unique },
      });
      if (error) return;
      if (data?.quotes) setQuotes(data.quotes);
    } catch (e) {
      console.error("Quote fetch failed:", e);
    }
  }, [session, trades]);

  useEffect(() => {
    fetchTrades();
  }, [user]);

  useEffect(() => {
    if (trades.length === 0) return;
    fetchQuotes();
    const interval = setInterval(fetchQuotes, 15000);
    return () => clearInterval(interval);
  }, [fetchQuotes, trades]);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    trades.forEach((t) => set.add(t.entry_date.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [trades]);

  const filtered = useMemo(() => {
    return trades.filter((t) => {
      if (search && !t.ticker.toLowerCase().includes(search.toLowerCase())) return false;
      if (monthFilter !== "all" && !t.entry_date.startsWith(monthFilter)) return false;
      return true;
    });
  }, [trades, search, monthFilter]);

  return (
    <>
      <ScreenHeader title="Trades" subtitle="Track your swing trades" />
      <div className="px-5 mt-5 pb-24">
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ticker…"
              className="pl-9 h-9 rounded-xl"
            />
          </div>
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="w-[150px] h-9 rounded-xl">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All months</SelectItem>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m}>
                  {format(new Date(m + "-01"), "MMMM yyyy")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="text-center text-sm text-muted-foreground py-10">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-card border border-border p-6 text-center text-sm text-muted-foreground">
            {trades.length === 0
              ? "No trades yet. Tap + to add your first trade."
              : "No trades match your filters."}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((t) => {
              const quote = quotes[t.ticker] ?? null;
              const pnl = pnlOf(t, quote);
              const pnlPct = pnlPctOf(t, quote);
              const equityPct =
                accountSize && accountSize > 0
                  ? (t.capital_invested / accountSize) * 100
                  : null;

              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setEditing(t);
                    setDialogOpen(true);
                  }}
                  className="w-full text-left rounded-xl bg-card border border-border px-3 py-2.5 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-foreground text-sm">{t.ticker}</span>
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
                      {t.status === "closed" && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                          CLOSED
                        </span>
                      )}
                    </div>
                    {pnl != null ? (
                      <div
                        className={cn(
                          "text-sm font-semibold whitespace-nowrap",
                          pnl >= 0 ? "text-emerald-400" : "text-red-400"
                        )}
                      >
                        {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}{" "}
                        <span className="text-xs font-normal">
                          ({pnlPct! >= 0 ? "+" : ""}
                          {pnlPct!.toFixed(1)}%)
                        </span>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">—</div>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mt-0.5">
                    <span>{format(new Date(t.entry_date), "MMM d, yyyy")}</span>
                    {equityPct != null && (
                      <span>Equity: {equityPct.toFixed(1)}%</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <button
        onClick={() => {
          setEditing(null);
          setDialogOpen(true);
        }}
        className="fixed bottom-24 right-5 z-30 h-14 w-14 rounded-full bg-emerald-500 text-white shadow-lg flex items-center justify-center hover:bg-emerald-600 transition-colors active:scale-95"
      >
        <Plus className="h-7 w-7" />
      </button>

      <AddTradeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={fetchTrades}
        trade={editing}
      />
    </>
  );
}
