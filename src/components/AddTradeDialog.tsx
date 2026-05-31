import { useState, useMemo, useEffect, useCallback, useRef } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  const [tickerSuggestOpen, setTickerSuggestOpen] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [useCurrentEntry, setUseCurrentEntry] = useState(true);
  const [useCurrentExit, setUseCurrentExit] = useState(true);
  const [openSiblingCount, setOpenSiblingCount] = useState(0);
  const [closingAll, setClosingAll] = useState(false);
  const tickerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || trade) return;
    const id = setTimeout(() => tickerInputRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [open, trade]);

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
      setUseCurrentEntry(false);
      setUseCurrentExit(trade.status !== "closed");
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
      setUseCurrentEntry(true);
      setUseCurrentExit(true);
    }
    setTickerSuggestOpen(false);
    setCurrentPrice(null);
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
        // If the call itself failed, don't block the user — allow the save.
        if (error) return true;
        // If the response shape is unexpected, allow it through rather than blocking.
        if (!data || !data.quotes || !(t in data.quotes)) return true;
        const q = data.quotes[t];
        // Network/fetch error inside the function returns null — treat as inconclusive, allow.
        if (q === null || q === undefined) return true;
        // Finnhub returns { c: 0, d: null, dp: null } for symbols it doesn't recognise.
        // Only reject when we have that definitive "unknown symbol" signal.
        if (q.c === 0 && q.d == null && q.dp == null) return false;
        return true;
      } catch {
        // Network exception — inconclusive, allow.
        return true;
      }
    },
    []
  );

  // Fetch live quote for current ticker (debounced)
  useEffect(() => {
    if (!open) return;
    const t = ticker.trim().toUpperCase();
    if (!t) {
      setCurrentPrice(null);
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("finnhub-quotes", {
          body: { tickers: [t] },
        });
        if (cancelled) return;
        if (error) {
          setCurrentPrice(null);
        } else {
          const c = data?.quotes?.[t]?.c;
          setCurrentPrice(typeof c === "number" && c > 0 ? c : null);
        }
      } catch {
        if (!cancelled) setCurrentPrice(null);
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, ticker]);

  // If the market is closed (no current price), keep entry field editable.
  useEffect(() => {
    if (currentPrice == null && useCurrentEntry && !quoteLoading) {
      setUseCurrentEntry(false);
    }
  }, [currentPrice, useCurrentEntry, quoteLoading]);

  // Count other open trades for the same ticker (for "close all" affordance)
  useEffect(() => {
    if (!open || !user) {
      setOpenSiblingCount(0);
      return;
    }
    const t = ticker.trim().toUpperCase();
    if (!t) {
      setOpenSiblingCount(0);
      return;
    }
    supabase
      .from("swing_trades")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("ticker", t)
      .eq("status", "active")
      .then(({ count }) => {
        const c = count ?? 0;
        // Exclude self if editing an active trade
        setOpenSiblingCount(trade && trade.status === "active" ? Math.max(0, c - 1) : c);
      });
  }, [open, user, ticker, trade]);

  const filteredSuggestions = useMemo(() => {
    const q = ticker.trim().toUpperCase();
    const list = q
      ? knownTickers.filter((t) => t.includes(q) && t !== q)
      : knownTickers;
    return list.slice(0, 8);
  }, [knownTickers, ticker]);

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
    const effectiveEntryPrice =
      useCurrentEntry && currentPrice != null && !entryPrice
        ? String(currentPrice)
        : entryPrice;
    if (!ticker.trim() || !capitalInvested || !effectiveEntryPrice) {
      toast.error("Fill in ticker, capital invested, and entry price");
      return;
    }
    const effectiveExitPrice =
      status === "closed" && useCurrentExit && currentPrice != null && !exitPrice
        ? String(currentPrice)
        : exitPrice;
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
      entry_price: Number(effectiveEntryPrice),
      entry_date: format(entryDate, "yyyy-MM-dd"),
      stop_loss: newSlNum,
      exit_price: status === "closed" && effectiveExitPrice ? Number(effectiveExitPrice) : null,
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

  const handleCloseAllOfTicker = async () => {
    if (!user) return;
    const tickerKey = ticker.trim().toUpperCase();
    if (!tickerKey) {
      toast.error("Set a ticker first");
      return;
    }
    const priceStr =
      useCurrentExit && currentPrice != null && !exitPrice ? String(currentPrice) : exitPrice;
    if (!priceStr) {
      toast.error("No exit price available");
      return;
    }
    if (!confirm(`Close ALL open ${tickerKey} positions at $${Number(priceStr).toFixed(2)}?`)) return;
    setClosingAll(true);
    const { error } = await supabase
      .from("swing_trades")
      .update({
        status: "closed",
        exit_price: Number(priceStr),
        exit_date: format(exitDate, "yyyy-MM-dd"),
      })
      .eq("user_id", user.id)
      .eq("ticker", tickerKey)
      .eq("status", "active");
    setClosingAll(false);
    if (error) {
      console.error(error);
      toast.error("Couldn't close positions");
      return;
    }
    toast.success(`All open ${tickerKey} positions closed`);
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
              <div className="relative">
                <Input
                  ref={tickerInputRef}
                  value={ticker}
                  onChange={(e) => {
                    setTicker(e.target.value.toUpperCase());
                    setTickerSuggestOpen(true);
                  }}
                  onFocus={() => setTickerSuggestOpen(true)}
                  onBlur={() => setTimeout(() => setTickerSuggestOpen(false), 150)}
                  placeholder="AAPL"
                  autoCapitalize="characters"
                  autoComplete="off"
                  name="ticker_symbol_field"
                />
                {tickerSuggestOpen && filteredSuggestions.length > 0 && (
                  <div className="absolute z-50 left-0 right-0 mt-1 rounded-xl border border-border bg-popover shadow-md max-h-56 overflow-y-auto">
                    {filteredSuggestions.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setTicker(t);
                          setTickerSuggestOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {currentPrice != null && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Current price: <span className="text-foreground font-medium">${currentPrice.toFixed(2)}</span>
                </div>
              )}
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
                  value={
                    useCurrentEntry && !entryPrice && currentPrice != null
                      ? currentPrice.toFixed(2)
                      : entryPrice
                  }
                  onChange={(e) => {
                    setEntryPrice(e.target.value);
                    if (e.target.value) setUseCurrentEntry(false);
                  }}
                  placeholder={currentPrice != null ? currentPrice.toFixed(2) : "150.00"}
                  disabled={useCurrentEntry && !entryPrice}
                  autoComplete="off"
                  name="entry_price_field"
                />
                {!editing && (
                  <label className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
                    <Checkbox
                      checked={useCurrentEntry}
                      onCheckedChange={(v) => {
                        const checked = v === true;
                        setUseCurrentEntry(checked);
                        if (checked) setEntryPrice("");
                      }}
                    />
                    Use current price
                    {quoteLoading && currentPrice == null
                      ? " (loading…)"
                      : currentPrice == null
                      ? " (market closed)"
                      : ""}
                  </label>
                )}
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
                {!editing &&
                  ticker.trim() &&
                  openSlByTicker[ticker.trim().toUpperCase()] != null &&
                  Number(openSlByTicker[ticker.trim().toUpperCase()]) !== Number(stopLoss) && (
                    <label className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
                      <Checkbox
                        checked={
                          Number(stopLoss) ===
                          Number(openSlByTicker[ticker.trim().toUpperCase()])
                        }
                        onCheckedChange={(v) => {
                          if (v === true) {
                            setStopLoss(
                              String(openSlByTicker[ticker.trim().toUpperCase()])
                            );
                          } else {
                            setStopLoss("");
                          }
                        }}
                      />
                      Use existing SL: $
                      {openSlByTicker[ticker.trim().toUpperCase()].toFixed(2)}
                    </label>
                  )}
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
                  <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Exit Price</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={
                          useCurrentExit && !exitPrice && currentPrice != null
                            ? currentPrice.toFixed(2)
                            : exitPrice
                        }
                        onChange={(e) => {
                          setExitPrice(e.target.value);
                          if (e.target.value) setUseCurrentExit(false);
                        }}
                        placeholder={currentPrice != null ? currentPrice.toFixed(2) : "160.00"}
                        disabled={useCurrentExit && !exitPrice}
                        autoComplete="off"
                        name="exit_price_field"
                      />
                      <label className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
                        <Checkbox
                          checked={useCurrentExit}
                          onCheckedChange={(v) => {
                            const checked = v === true;
                            setUseCurrentExit(checked);
                            if (checked) setExitPrice("");
                          }}
                          disabled={currentPrice == null}
                        />
                        Use current price
                      </label>
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
                  {openSiblingCount > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCloseAllOfTicker}
                      disabled={closingAll}
                      className="w-full rounded-xl border-red-500/40 text-red-500 hover:bg-red-500/10"
                    >
                      {closingAll
                        ? "Closing…"
                        : `Close all ${ticker.trim().toUpperCase()} positions (${openSiblingCount + 1})`}
                    </Button>
                  )}
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
