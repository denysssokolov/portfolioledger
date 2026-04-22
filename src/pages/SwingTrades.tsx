import { useState, useEffect } from "react";
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

export default function SwingTrades() {
  const { user } = useAuth();
  const [trades, setTrades] = useState<SwingTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

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

  useEffect(() => {
    fetchTrades();
  }, [user]);

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
            {trades.map((t) => (
              <div
                key={t.id}
                className="rounded-2xl bg-card border border-border p-4 flex items-center justify-between"
              >
                <div>
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
                  <div className="text-xs text-muted-foreground mt-1">
                    Entry {format(new Date(t.entry_date), "MMM d, yyyy")} · ${t.entry_price}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-foreground">
                    ${Number(t.capital_invested).toLocaleString()}
                  </div>
                  {t.exit_price && (
                    <div className="text-xs text-muted-foreground">Exit ${t.exit_price}</div>
                  )}
                </div>
              </div>
            ))}
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
