import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccounts, useTransactions } from "@/hooks/usePortfolioData";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Plus, Search, Pencil, Trash2, ArrowUpRight, ArrowDownRight, ArrowLeftRight } from "lucide-react";
import TransactionForm from "@/components/TransactionForm";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Transaction } from "@/lib/calc";
import { useSafetyMode } from "@/hooks/useSafetyMode";

const typeColor = (t: string) =>
  t === "Deposit" || t === "Investment"
    ? "text-success bg-success/10"
    : t === "Withdrawal" || t === "Profit Taken"
    ? "text-loss bg-loss/10"
    : "text-neutral bg-muted";

const typeIcon = (t: string) =>
  t === "Deposit" || t === "Investment" ? ArrowDownRight :
  t === "Withdrawal" || t === "Profit Taken" ? ArrowUpRight : ArrowLeftRight;

export default function Transactions() {
  const { data: accounts = [] } = useAccounts();
  const { data: txs = [], isLoading } = useTransactions();
  const qc = useQueryClient();
  useSafetyMode();

  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Transaction | null>(null);
  const [del, setDel] = useState<Transaction | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState<string>("all");
  const [acc, setAcc] = useState<string>("all");

  const accMap = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts]);

  const filtered = useMemo(() => {
    return txs.filter((t) => {
      if (type !== "all" && t.type !== type) return false;
      if (acc !== "all" && t.from_account_id !== acc && t.to_account_id !== acc) return false;
      if (q) {
        const hay = (t.notes ?? "") + " " + (accMap[t.from_account_id ?? ""]?.name ?? "") +
                    " " + (accMap[t.to_account_id ?? ""]?.name ?? "");
        if (!hay.toLowerCase().includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [txs, type, acc, q, accMap]);

  const grouped = useMemo(() => {
    const m: Record<string, Transaction[]> = {};
    for (const t of filtered) (m[t.occurred_on] ??= []).push(t);
    return m;
  }, [filtered]);

  const doDelete = async () => {
    if (!del) return;
    const { error } = await supabase.from("transactions").delete().eq("id", del.id);
    if (error) {
      console.error("Delete transaction failed:", error);
      return toast.error("Couldn't delete transaction. Please try again.");
    }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["transactions"] });
    setDel(null);
  };

  return (
    <>
      <ScreenHeader
        title="Transactions"
        subtitle={`${txs.length} entr${txs.length === 1 ? "y" : "ies"}`}
        right={
          <Button
            size="icon"
            onClick={() => { setEdit(null); setOpen(true); }}
            className="h-12 w-12 rounded-2xl bg-gradient-primary text-primary-foreground shadow-elegant animate-pulse-glow"
            aria-label="Add transaction"
          >
            <Plus className="h-5 w-5" strokeWidth={2.6} />
          </Button>
        }
      />

      <div className="px-5 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search notes or account…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9 h-11 rounded-xl bg-secondary border-0"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-11 rounded-xl bg-secondary border-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {["Deposit","Withdrawal","Transfer","Profit Taken"].map(t => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={acc} onValueChange={setAcc}>
            <SelectTrigger className="h-11 rounded-xl bg-secondary border-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="px-5 mt-4 space-y-6">
        {isLoading && (
          <div className="text-center py-16 text-muted-foreground">Loading…</div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16">
            <div className="text-muted-foreground">No transactions yet.</div>
            <Button
              onClick={() => { setEdit(null); setOpen(true); }}
              className="mt-4 rounded-xl bg-gradient-primary text-primary-foreground"
            >
              <Plus className="h-4 w-4 mr-2" /> Log your first transaction
            </Button>
          </div>
        )}

        {Object.entries(grouped).map(([date, items]) => (
          <div key={date} className="animate-fade-in">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 px-1">
              {new Date(date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
            </div>
            <div className="rounded-2xl bg-card border border-border overflow-hidden divide-y divide-border">
              {items.map((t) => {
                const Icon = typeIcon(t.type);
                const from = t.from_account_id ? accMap[t.from_account_id]?.name : null;
                const to = t.to_account_id ? accMap[t.to_account_id]?.name : null;
                const sign =
                  t.type === "Deposit" || t.type === "Investment"
                    ? "+"
                    : t.type === "Withdrawal" || t.type === "Profit Taken"
                    ? "−"
                    : "";
                const moneyClass =
                  sign === "+" ? "text-success" : sign === "−" ? "text-loss" : "text-foreground";
                return (
                  <div key={t.id} className="flex items-center gap-3 p-3 group">
                    <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", typeColor(t.type))}>
                      <Icon className="h-5 w-5" strokeWidth={2.4} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{t.type}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {from && to ? `${from} → ${to}` : from ?? to ?? "—"} · {t.asset_class}
                        {t.notes ? ` · ${t.notes}` : ""}
                      </div>
                    </div>
                    <div className={cn("font-display font-bold tabular text-right", moneyClass)}>
                      {sign}{fmtMoney(Number(t.amount))}
                    </div>
                    <div className="flex flex-col gap-1 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEdit(t); setOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-loss" onClick={() => setDel(t)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <TransactionForm open={open} onOpenChange={setOpen} accounts={accounts} edit={edit} />

      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent className="bg-card border-border rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
            <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="rounded-xl bg-loss text-loss-foreground hover:bg-loss/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
