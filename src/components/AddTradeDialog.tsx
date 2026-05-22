import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { CalendarIcon, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
    return direction === "long" ? (entry - sl) * shares : (sl - entry) * shares;
  }, [capitalInvested, entryPrice, stopLoss, direction]);

  const handleSave = async () => {
    if (!user) return;
    if (!ticker.trim() || !capitalInvested || !entryPrice) {
      toast.error("Fill in ticker, capital invested, and entry price");
      return;
    }
    setSaving(true);
    const payload = {
      user_id: user.id,
      status,
      ticker: ticker.trim().toUpperCase(),
      direction,
      capital_invested: Number(capitalInvested),
      entry_price: Number(entryPrice),
      entry_date: format(entryDate, "yyyy-MM-dd"),
      stop_loss: stopLoss ? Number(stopLoss) : null,
      exit_price: status === "closed" && exitPrice ? Number(exitPrice) : null,
      exit_date: status === "closed" ? format(exitDate, "yyyy-MM-dd") : null,
    };
    const { error } = trade
      ? await supabase.from("swing_trades").update(payload).eq("id", trade.id)
      : await supabase.from("swing_trades").insert(payload);
    setSaving(false);
    if (error) {
      console.error("swing_trades save error:", error);
      toast.error("Couldn't save trade. Please try again.");
      return;
    }
    toast.success(editing ? "Trade updated" : "Trade added");
    onOpenChange(false);
    onSaved();
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Trade" : "Add Trade"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
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
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="AAPL"
              autoCapitalize="characters"
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Capital Invested</Label>
            <Input
              type="number"
              value={capitalInvested}
              onChange={(e) => setCapitalInvested(e.target.value)}
              placeholder="1000"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Entry Price</Label>
              <Input
                type="number"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                placeholder="150.00"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Stop Loss</Label>
              <Input
                type="number"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="140.00"
              />
              {riskAmount != null && (
                <div className="mt-1.5 text-xs font-medium text-red-500">
                  Risk: £{riskAmount.toFixed(2)}
                </div>
              )}
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Entry Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
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
                      value={exitPrice}
                      onChange={(e) => setExitPrice(e.target.value)}
                      placeholder="160.00"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Exit Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal text-xs">
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
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              {saving ? "Saving…" : editing ? "Save Changes" : "Add Trade"}
            </Button>
            {editing && (
              <Button
                onClick={handleDelete}
                variant="outline"
                size="icon"
                className="rounded-xl border-red-500/40 text-red-500 hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
