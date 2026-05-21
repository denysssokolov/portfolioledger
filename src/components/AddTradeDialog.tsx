import { useState, useMemo } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
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

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}

export function AddTradeDialog({ open, onOpenChange, onSaved }: Props) {
  const { user } = useAuth();
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [ticker, setTicker] = useState("");
  const [capitalInvested, setCapitalInvested] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [entryDate, setEntryDate] = useState<Date>(new Date());
  const [stopLoss, setStopLoss] = useState("");
  const [saving, setSaving] = useState(false);

  const riskAmount = useMemo(() => {
    const cap = Number(capitalInvested);
    const entry = Number(entryPrice);
    const sl = Number(stopLoss);
    if (!cap || !entry || !sl) return null;
    const shares = cap / entry;
    const risk =
      direction === "long"
        ? (entry - sl) * shares
        : (sl - entry) * shares;
    return risk;
  }, [capitalInvested, entryPrice, stopLoss, direction]);

  const reset = () => {
    setDirection("long");
    setTicker("");
    setCapitalInvested("");
    setEntryPrice("");
    setEntryDate(new Date());
    setStopLoss("");
  };

  const handleSave = async () => {
    if (!user) return;
    if (!ticker.trim() || !capitalInvested || !entryPrice) {
      toast.error("Fill in ticker, capital invested, and entry price");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("swing_trades").insert({
      user_id: user.id,
      status: "active",
      ticker: ticker.trim().toUpperCase(),
      direction,
      capital_invested: Number(capitalInvested),
      entry_price: Number(entryPrice),
      entry_date: format(entryDate, "yyyy-MM-dd"),
      stop_loss: stopLoss ? Number(stopLoss) : null,
    });
    setSaving(false);
    if (error) {
      console.error("swing_trades insert error:", error);
      toast.error("Couldn't save trade. Please try again.");
      return;
    }
    toast.success("Trade added");
    reset();
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>Add Trade</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Direction toggle */}
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

          {/* Ticker */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Ticker</Label>
            <Input
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="AAPL"
              autoCapitalize="characters"
            />
          </div>

          {/* Capital invested */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Capital Invested</Label>
            <Input
              type="number"
              value={capitalInvested}
              onChange={(e) => setCapitalInvested(e.target.value)}
              placeholder="1000"
            />
          </div>

          {/* Entry price + Stop loss */}
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

          {/* Entry date */}
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

          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            {saving ? "Saving…" : "Add Trade"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
