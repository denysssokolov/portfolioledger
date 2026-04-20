import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAccounts, useTransactions, useSnapshots } from "@/hooks/usePortfolioData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Coins, LineChart, Bitcoin, Pencil } from "lucide-react";
import { toast } from "sonner";
import { fmtMoney } from "@/lib/format";
import { liveBalanceByAccount, type Account } from "@/lib/calc";
import { cn } from "@/lib/utils";

const ASSETS = ["Cash", "Shares", "Crypto"] as const;
type AssetClass = (typeof ASSETS)[number];

const assetIcon = (a: string) => {
  if (a === "Crypto") return <Bitcoin className="h-4 w-4" />;
  if (a === "Shares") return <LineChart className="h-4 w-4" />;
  return <Coins className="h-4 w-4" />;
};

export function AccountsManager() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: accounts = [] } = useAccounts();
  const { data: txs = [] } = useTransactions();
  const { data: snaps = [] } = useSnapshots();

  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Account | null>(null);
  const [del, setDel] = useState<Account | null>(null);

  const live = liveBalanceByAccount(accounts, snaps, txs);

  const openNew = () => {
    setEdit(null);
    setOpen(true);
  };
  const openEdit = (a: Account) => {
    setEdit(a);
    setOpen(true);
  };

  const doArchive = async () => {
    if (!del) return;
    const { error } = await supabase
      .from("accounts")
      .update({ archived: true })
      .eq("id", del.id);
    if (error) {
      console.error("Archive account failed:", error);
      toast.error("Couldn't delete account. Please try again.");
      return;
    }
    toast.success(`${del.name} removed`);
    qc.invalidateQueries({ queryKey: ["accounts"] });
    setDel(null);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-semibold">Accounts</div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your portfolio accounts.
          </p>
        </div>
        <Button
          size="sm"
          onClick={openNew}
          className="h-10 rounded-xl bg-gradient-primary text-primary-foreground"
        >
          <Plus className="h-4 w-4 mr-1.5" /> New
        </Button>
      </div>

      <div className="space-y-2">
        {accounts.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No accounts yet. Create your first one to start tracking.
          </div>
        )}
        {accounts.map((a) => {
          const l = live[a.id];
          const isCash = a.asset_class === "Cash";
          return (
            <div
              key={a.id}
              className="rounded-2xl border border-border bg-background p-4 flex items-center gap-3"
            >
              <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center text-primary">
                {assetIcon(a.asset_class)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{a.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {isCash ? (
                    <>Cash {fmtMoney(l?.value ?? 0)}</>
                  ) : (
                    <>
                      {a.asset_class} {fmtMoney(l?.nonCash ?? 0)}
                      {" · "}
                      Cash {fmtMoney(l?.cash ?? 0)}
                    </>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="font-display font-bold tabular">
                  {fmtMoney(l?.value ?? 0)}
                </div>
                {l && l.sinceSnapshot !== 0 && (
                  <div
                    className={cn(
                      "text-[10px] tabular",
                      l.sinceSnapshot >= 0 ? "text-success" : "text-loss"
                    )}
                  >
                    {l.sinceSnapshot >= 0 ? "+" : "−"}
                    {fmtMoney(Math.abs(l.sinceSnapshot))} this month
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => openEdit(a)}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setDel(a)}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <AccountForm
        open={open}
        onOpenChange={setOpen}
        edit={edit}
        userId={user?.id}
        onSaved={() => qc.invalidateQueries({ queryKey: ["accounts"] })}
      />

      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {del?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The account will be archived and hidden. Past transactions and
              snapshots are preserved for accurate history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={doArchive}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AccountForm({
  open,
  onOpenChange,
  edit,
  userId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  edit: Account | null;
  userId?: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState(edit?.name ?? "");
  const [assetClass, setAssetClass] = useState<AssetClass>(
    (edit?.asset_class as AssetClass) ?? "Cash"
  );

  const submit = async () => {
    if (!userId) return;
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Name required");
    const payload = { name: trimmed, asset_class: assetClass, user_id: userId };
    const { error } = edit
      ? await supabase.from("accounts").update(payload).eq("id", edit.id)
      : await supabase.from("accounts").insert(payload);
    if (error) {
      console.error("Save account failed:", error);
      toast.error("Couldn't save account. Please try again.");
      return;
    }
    toast.success(edit ? "Updated" : "Account created");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) {
          setName(edit?.name ?? "");
          setAssetClass((edit?.asset_class as AssetClass) ?? "Cash");
        }
      }}
    >
      <DialogContent className="bg-card border-border max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {edit ? "Edit account" : "New account"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Name
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Trading 212 ISA"
              className="h-11 rounded-xl bg-secondary border-0"
              maxLength={60}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Main asset
            </Label>
            <Select
              value={assetClass}
              onValueChange={(v) => setAssetClass(v as AssetClass)}
            >
              <SelectTrigger className="h-11 rounded-xl bg-secondary border-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSETS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={submit}
            className="w-full h-12 rounded-xl bg-gradient-primary text-primary-foreground font-semibold shadow-elegant"
          >
            {edit ? "Save changes" : "Create account"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
