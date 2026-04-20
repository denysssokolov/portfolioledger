import { useMemo, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Account } from "@/lib/calc";
import type { Recurring } from "@/hooks/useRecurringTransactions";

const TYPES = ["Deposit", "Withdrawal", "Transfer", "Profit Taken"] as const;
const ASSETS = ["Cash", "Shares", "Crypto"] as const;

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  accounts: Account[];
  edit?: Recurring | null;
};

export default function RecurringForm({ open, onOpenChange, accounts, edit }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const initial = useMemo(() => ({
    type: (edit?.type ?? "Deposit") as (typeof TYPES)[number],
    asset_class: (edit?.asset_class ?? "Cash") as (typeof ASSETS)[number],
    from_account_id: edit?.from_account_id ?? "",
    to_account_id: edit?.to_account_id ?? accounts[0]?.id ?? "",
    amount: edit ? String(edit.amount) : "",
    notes: edit?.notes ?? "",
    day_of_month: edit?.day_of_month ?? new Date().getDate(),
    start_date: edit?.start_date ?? new Date().toISOString().slice(0, 10),
    active: edit?.active ?? true,
  }), [edit, accounts, open]);

  const [f, setF] = useState(initial);
  useEffect(() => setF(initial), [initial]);

  const needsFrom = f.type === "Withdrawal" || f.type === "Transfer" || f.type === "Profit Taken";
  const needsTo = f.type === "Deposit" || f.type === "Transfer";

  const submit = async () => {
    if (!user) return;
    const amt = Number(f.amount);
    if (!amt || amt <= 0) return toast.error("Enter an amount");
    if (!f.day_of_month || f.day_of_month < 1 || f.day_of_month > 31)
      return toast.error("Day of month must be 1–31");
    if (needsFrom && f.type !== "Profit Taken" && !f.from_account_id) return toast.error("Choose 'from' account");
    if (needsTo && !f.to_account_id) return toast.error("Choose 'to' account");

    const payload = {
      user_id: user.id,
      type: f.type,
      asset_class: f.asset_class,
      amount: amt,
      from_account_id: needsFrom ? (f.from_account_id || null) : null,
      to_account_id: needsTo ? (f.to_account_id || null) : null,
      notes: f.notes.trim() || null,
      day_of_month: Number(f.day_of_month),
      start_date: f.start_date,
      active: f.active,
    };

    const { error } = edit
      ? await supabase.from("recurring_transactions").update(payload).eq("id", edit.id)
      : await supabase.from("recurring_transactions").insert(payload);

    if (error) {
      console.error("Recurring save failed:", error);
      return toast.error("Couldn't save schedule. Please try again.");
    }
    toast.success(edit ? "Schedule updated" : "Recurring transaction created");
    qc.invalidateQueries({ queryKey: ["recurring_transactions"] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {edit ? "Edit recurring" : "New recurring"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Day of month</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={f.day_of_month}
                onChange={(e) => setF({ ...f, day_of_month: Number(e.target.value) })}
                className="h-11 rounded-xl bg-secondary border-0 tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Type</Label>
              <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v as any })}>
                <SelectTrigger className="h-11 rounded-xl bg-secondary border-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Amount (£)</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={f.amount}
              onChange={(e) => setF({ ...f, amount: e.target.value })}
              placeholder="0.00"
              className="h-14 rounded-xl bg-secondary border-0 font-display text-2xl font-bold tabular"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">From</Label>
              <Select
                value={f.from_account_id || "_none"}
                onValueChange={(v) => setF({ ...f, from_account_id: v === "_none" ? "" : v })}
                disabled={!needsFrom}
              >
                <SelectTrigger className="h-11 rounded-xl bg-secondary border-0 disabled:opacity-40">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">External / —</SelectItem>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">To</Label>
              <Select
                value={f.to_account_id || "_none"}
                onValueChange={(v) => setF({ ...f, to_account_id: v === "_none" ? "" : v })}
                disabled={!needsTo}
              >
                <SelectTrigger className="h-11 rounded-xl bg-secondary border-0 disabled:opacity-40">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">External / —</SelectItem>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Asset class</Label>
              <Select value={f.asset_class} onValueChange={(v) => setF({ ...f, asset_class: v as any })}>
                <SelectTrigger className="h-11 rounded-xl bg-secondary border-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSETS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Starts on</Label>
              <Input
                type="date"
                value={f.start_date}
                onChange={(e) => setF({ ...f, start_date: e.target.value })}
                className="h-11 rounded-xl bg-secondary border-0"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Notes</Label>
            <Textarea
              value={f.notes}
              onChange={(e) => setF({ ...f, notes: e.target.value })}
              className="rounded-xl bg-secondary border-0 min-h-[60px]"
              maxLength={500}
            />
          </div>

          <Button
            onClick={submit}
            className="w-full h-12 rounded-xl bg-gradient-primary text-primary-foreground font-semibold shadow-elegant"
          >
            {edit ? "Save changes" : "Create recurring"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
