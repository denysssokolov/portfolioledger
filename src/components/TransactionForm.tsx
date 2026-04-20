import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Account, Transaction } from "@/lib/calc";

const TYPES = ["Deposit", "Withdrawal", "Transfer", "Profit Taken"] as const;
const ASSETS = ["Cash", "Shares", "Crypto"] as const;

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  accounts: Account[];
  edit?: Transaction | null;
};

export default function TransactionForm({ open, onOpenChange, accounts, edit }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const initial = useMemo(
    () => ({
      occurred_on: edit?.occurred_on ?? new Date().toISOString().slice(0, 10),
      type: (edit?.type ?? "Deposit") as (typeof TYPES)[number],
      asset_class: (edit?.asset_class ?? "Cash") as (typeof ASSETS)[number],
      from_account_id: edit?.from_account_id ?? "",
      to_account_id: edit?.to_account_id ?? accounts[0]?.id ?? "",
      amount: edit ? String(edit.amount) : "",
      notes: edit?.notes ?? "",
    }),
    [edit, accounts, open]
  );

  const [f, setF] = useState(initial);
  // Reset when reopening
  useMemo(() => setF(initial), [initial]);

  const needsFrom = f.type === "Withdrawal" || f.type === "Transfer" || f.type === "Profit Taken";
  const needsTo = f.type === "Deposit" || f.type === "Transfer";

  const submit = async () => {
    if (!user) return;
    const amt = Number(f.amount);
    if (!amt || amt <= 0) return toast.error("Enter an amount");
    if (needsFrom && f.type !== "Profit Taken" && !f.from_account_id) return toast.error("Choose 'from' account");
    if (needsTo && !f.to_account_id) return toast.error("Choose 'to' account");

    const payload = {
      user_id: user.id,
      occurred_on: f.occurred_on,
      type: f.type,
      asset_class: f.asset_class,
      amount: amt,
      from_account_id: needsFrom ? (f.from_account_id || null) : null,
      to_account_id: needsTo ? (f.to_account_id || null) : null,
      notes: f.notes.trim() || null,
    };

    const { error } = edit
      ? await supabase.from("transactions").update(payload).eq("id", edit.id)
      : await supabase.from("transactions").insert(payload);

    if (error) {
      console.error("Transaction save failed:", error);
      return toast.error("Couldn't save transaction. Please check your input and try again.");
    }

    // Auto-record realised P&L when logging a "Profit Taken" transaction (insert only).
    // The transaction itself reduces the from-account balance; this entry adds the
    // same amount to the realised lifetime so Total P&L on the dashboard is preserved.
    if (!edit && f.type === "Profit Taken") {
      const { error: rpnlErr } = await supabase.from("realised_pnl").insert({
        user_id: user.id,
        occurred_on: f.occurred_on,
        account_id: f.from_account_id || null,
        amount: amt,
        notes: f.notes.trim() || "Auto-recorded from Profit Taken",
      });
      if (rpnlErr) {
        console.error("Realised PnL auto-insert failed:", rpnlErr);
        toast.error("Transaction saved, but couldn't auto-record realised P&L.");
      } else {
        qc.invalidateQueries({ queryKey: ["realised_pnl"] });
      }
    }

    toast.success(edit ? "Updated" : f.type === "Profit Taken" ? "Logged & added to realised P&L" : "Logged");
    qc.invalidateQueries({ queryKey: ["transactions"] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {edit ? "Edit transaction" : "New transaction"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Date</Label>
              <Input
                type="date"
                value={f.occurred_on}
                onChange={(e) => setF({ ...f, occurred_on: e.target.value })}
                className="h-11 rounded-xl bg-secondary border-0"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Type</Label>
              <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v as any })}>
                <SelectTrigger className="h-11 rounded-xl bg-secondary border-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
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
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
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
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Asset class</Label>
            <Select value={f.asset_class} onValueChange={(v) => setF({ ...f, asset_class: v as any })}>
              <SelectTrigger className="h-11 rounded-xl bg-secondary border-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSETS.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            {edit ? "Save changes" : "Log transaction"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
