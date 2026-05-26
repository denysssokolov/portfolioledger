import { useState, useMemo, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { CalendarIcon, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Trade } from "@/lib/tradeStats";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  trade?: Trade | null;
  defaultTicker?: string;
}

export function AddTradeDialog({ open, onOpenChange, onSaved, trade, defaultTicker }: Props) {
  const { user } = useAuth();
  const editing = !!trade;
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [ticker, setTicker] = useState("");
  const [capitalInvested, setCapitalInvested] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [entryDate, setEntryDate] = useState<Date>(new Date());
  const [stopLoss, setStopLoss] = useState("");
  const [status, setStatus] = useState<"active" | "closed">("active");
  const [exitPrice, setExitPrice] = useState("");
  const [exitDate, setExitDate] = useState<Date>(new Date());
  const [saving, setSaving] = useState(false);
  const [knownTickers, setKnownTickers] = useState<string[]>([]);
  const [openSlByTicker, setOpenSlByTicker] = useState<Record<string, number>>({});
  const [slPrompt, setSlPrompt] = useState<{
    message: string;
    onYes: () => Promise<void>;
    onNo: () => Promise<void>;
  } | null>(null);

  // Load distinct tickers + existing stop losses on open trades for autocomplete + 1-click SL copy
  useEffect(() => {
    if (!open || !user) return;
    supabase
      .from("swing_trades")
      .select("ticker, stop_loss, status")
      .eq("user_id", user.id)
      .then(({ data }) => {
        const set = new Set<string>();
        const slMap: Record<string, number> = {};
        (data ?? []).forEach((r: { ticker: string; stop_loss: number | null; status: string }) => {
          set.add(r.ticker);
          if (r.status === "active" && r.stop_loss != null && slMap[r.ticker] == null) {
            slMap[r.ticker] = Number(r.stop_loss);
          }
        });
        setKnownTickers([...set].sort());
        setOpenSlByTicker(slMap);
      });
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    if (trade) {
      setDirection(trade.direction as "long" | "short");
      setTicker(trade.ticker);
      setCapitalInvested(String(trade.capital_invested));
      setEntryPrice(String(trade.entry_price));
      setEntryDate(new Date(trade.entry_date));
      setStopLoss(trade.stop_loss != null ? String(trade.stop_loss) : "");
      setStatus(trade.status as "active" | "closed");
      setExitPrice(trade.exit_price != null ? String(trade.exit_price) : "");
      setExitDate(trade.exit_date ? new Date(trade.exit_date) : new Date());
    } else {
      setDirection("long");
      setTicker(defaultTicker ?? "");
      setCapitalInvested("");
      setEntryPrice("");
      setEntryDate(new Date());
      setStopLoss("");
      setStatus("active");
      setExitPrice("");
      setExitDate(new Date());
    }
  }, [open, trade, defaultTicker]);

  const riskAmount = useMemo(() => {
    const cap = Number(capitalInvested);
    const entry = Number(entryPrice);
    const sl = Number(stopLoss);
    if (!cap || !entry || !sl) return null;
    const shares = cap / entry;
    // Signed P&L if stop hit. Positive = SL acts as take-profit.
    return direction === "long" ? (sl - entry) * shares : (entry - sl) * shares;
  }, [capitalInvested, entryPrice, stopLoss, direction]);

  // Validate ticker exists via finnhub-quotes
  const validateTicker = useCallback(
    async (t: string): Promise<boolean> => {
      try {
        const { data, error } = await supabase.functions.invoke("finnhub-quotes", {
          body: { tickers: [t] },
        });
        if (error) return false;
        const q = data?.quotes?.[t];
        return !!(q && typeof q.c === "number" && q.c > 0);
      } catch {
        return false;
      }
    },
    []
  );

  const persistTrade = useCallback(
    async (payload: any) => {
      const { error } = trade
        ? await supabase.from("swing_trades").update(payload).eq("id", trade.id)
        : await supabase.from("swing_trades").insert(payload);
      if (error) {
        console.error("swing_trades save error:", error);
        toast.error("Couldn't save trade. Please try again.");
        return false;
      }
      return true;
    },
    [trade]
  );

  const finishSave = async (
    payload: any,
    syncSlValue: number | null | undefined,
    tickerKey: string
  ) => {
    const ok = await persistTrade(payload);
    if (!ok) {
      setSaving(false);
      return;
    }
    // Sync SL across all other open trades for this ticker if requested
    if (syncSlValue !== undefined && user) {
      const q = supabase
        .from("swing_trades")
        .update({ stop_loss: syncSlValue })
        .eq("user_id", user.id)
        .eq("ticker", tickerKey)
        .eq("status", "active");
      if (trade) q.neq("id", trade.id);
      const { error: sErr } = await q;
      if (sErr) {
        console.error("SL sync error:", sErr);
        toast.error("Saved trade, but couldn't sync stop loss.");
      } else {
        toast.success("Stop loss synced across all open trades");
      }
    }
    setSaving(false);
    toast.success(editing ? "Trade updated" : "Trade added");
    onOpenChange(false);
    onSaved();
  };

  const handleSave = async () => {
    if (!user) return;
    if (!ticker.trim() || !capitalInvested || !entryPrice) {
      toast.error("Fill in ticker, capital invested, and entry price");
      return;
    }
    const tickerKey = ticker.trim().toUpperCase();
    setSaving(true);

    // 1. Validate ticker — only when ticker has changed (or new trade)
    const tickerChanged = !trade || trade.ticker !== tickerKey;
    if (tickerChanged) {
      const valid = await validateTicker(tickerKey);
      if (!valid) {
        setSaving(false);
        toast.error(`Ticker "${tickerKey}" not found. Check the symbol and try again.`);
        return;
      }
    }

    const newSlNum = stopLoss ? Number(stopLoss) : null;
    const payload = {
      user_id: user.id,
      status,
      ticker: tickerKey,
      direction,
      capital_invested: Number(capitalInvested),
      entry_price: Number(entryPrice),
      entry_date: format(entryDate, "yyyy-MM-dd"),
      stop_loss: newSlNum,
      exit_price: status === "closed" && exitPrice ? Number(exitPrice) : null,
      exit_date: status === "closed" ? format(exitDate, "yyyy-MM-dd") : null,
    };

    // 2. Stop-loss-sync logic across same-ticker open positions
    const { data: siblings } = await supabase
      .from("swing_trades")
      .select("id, stop_loss, status")
      .eq("user_id", user.id)
      .eq("ticker", tickerKey)
      .eq("status", "active");

    const otherOpen = (siblings ?? []).filter((r) => r.id !== trade?.id);

    if (otherOpen.length > 0 && newSlNum != null) {
      const otherSls = otherOpen
        .map((r) => (r.stop_loss == null ? null : Number(r.stop_loss)))
        .filter((v): v is number => v != null);
      const existingSl = otherSls.length ? otherSls[0] : null;
      const allOthersHaveNoSl = otherSls.length === 0;

      if (allOthersHaveNoSl) {
        // First SL being introduced — ask whether to apply to all open trades of this ticker
        setSlPrompt({
          message: `${otherOpen.length} other open ${tickerKey} trade${
            otherOpen.length > 1 ? "s have" : " has"
          } no stop loss. Use $${newSlNum.toFixed(2)} for all of them?`,
          onYes: () => finishSave(payload, newSlNum, tickerKey),
          onNo: () => finishSave(payload, undefined, tickerKey),
        });
        return;
      }
      if (existingSl != null && Math.abs(existingSl - newSlNum) > 0.0001) {
        setSlPrompt({
          message: `Other open ${tickerKey} trades use a stop loss of $${existingSl.toFixed(
            2
          )}. Update them all to $${newSlNum.toFixed(2)}?`,
          onYes: () => finishSave(payload, newSlNum, tickerKey),
          onNo: () => finishSave(payload, undefined, tickerKey),
        });
        return;
      }
    }

    await finishSave(payload, undefined, tickerKey);
  };

  const handleDelete = async () => {
    if (!trade) return;
    if (!confirm("Delete this trade?")) return;
    const { error } = await supabase.from("swing_trades").delete().eq("id", trade.id);
    if (error) {
      toast.error("Couldn't delete trade");
      return;
    }
    toast.success("Trade deleted");
    onOpenChange(false);
    onSaved();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Trade" : "Add Trade"}</DialogTitle>
          </DialogHeader>

          <form
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
            className="space-y-4 mt-2"
          >
            {/* Hidden decoy to suppress password autofill */}
            <input type="text" name="prevent_autofill" autoComplete="off" className="hidden" />

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Direction</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["long", "short"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDirection(d)}
                    className={cn(
                      "py-2 rounded-xl text-sm font-medium transition-colors border",
                      direction === d
                        ? d === "long"
                          ? "bg-emerald-500 text-white border-emerald-500"
                          : "bg-red-500 text-white border-red-500"
                        : "bg-card text-muted-foreground border-border hover:text-foreground"
                    )}
                  >
                    {d.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Ticker</Label>
              <Input
                list="known-tickers"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="AAPL"
                autoCapitalize="characters"
                autoComplete="off"
                name="ticker_symbol_field"
              />
              <datalist id="known-tickers">
                {knownTickers
                  .filter((t) => !ticker || t.includes(ticker.toUpperCase()))
                  .map((t) => (
                    <option key={t} value={t} />
                  ))}
              </datalist>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Capital Invested</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={capitalInvested}
                onChange={(e) => setCapitalInvested(e.target.value)}
                placeholder="1000"
                autoComplete="off"
                name="capital_invested_field"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Entry Price</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  placeholder="150.00"
                  autoComplete="off"
                  name="entry_price_field"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Stop Loss</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  placeholder="140.00"
                  autoComplete="off"
                  name="stop_loss_field"
                />
                {riskAmount != null && (
                  <div
                    className={cn(
                      "mt-1.5 text-xs font-medium",
                      riskAmount >= 0 ? "text-emerald-500" : "text-red-500"
                    )}
                  >
                    {riskAmount >= 0 ? "Take-profit" : "Risk"}: £
                    {Math.abs(riskAmount).toFixed(2)}
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Entry Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(entryDate, "MMMM d, yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={entryDate}
                    onSelect={(d) => d && setEntryDate(d)}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {editing && (
              <div className="rounded-xl border border-border p-3 space-y-3">
                <Label className="text-xs text-muted-foreground block">Status</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["active", "closed"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={cn(
                        "py-2 rounded-xl text-sm font-medium border",
                        status === s
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-muted-foreground border-border"
                      )}
                    >
                      {s.toUpperCase()}
                    </button>
                  ))}
                </div>
                {status === "closed" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Exit Price</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={exitPrice}
                        onChange={(e) => setExitPrice(e.target.value)}
                        placeholder="160.00"
                        autoComplete="off"
                        name="exit_price_field"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Exit Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-start text-left font-normal text-xs"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {format(exitDate, "MMM d, yyyy")}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={exitDate}
                            onSelect={(d) => d && setExitDate(d)}
                            initialFocus
                            className="p-3 pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                {saving ? "Saving…" : editing ? "Save Changes" : "Add Trade"}
              </Button>
              {editing && (
                <Button
                  type="button"
                  onClick={handleDelete}
                  variant="outline"
                  size="icon"
                  className="rounded-xl border-red-500/40 text-red-500 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!slPrompt}
        onOpenChange={(o) => {
          if (!o) setSlPrompt(null);
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Sync stop loss?</AlertDialogTitle>
            <AlertDialogDescription>{slPrompt?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={async () => {
                const p = slPrompt;
                setSlPrompt(null);
                await p?.onNo();
              }}
            >
              No, just this one
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const p = slPrompt;
                setSlPrompt(null);
                await p?.onYes();
              }}
            >
              Yes, apply to all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
