import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, AlertTriangle, Wallet, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { UnlockFullAccessCard } from "@/components/UnlockFullAccessCard";

export default function Settings() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

  const deleteAccount = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("delete-account");
      if (error) throw error;
      await signOut();
      toast.success("Your account has been deleted");
      nav("/auth", { replace: true });
    } catch (e) {
      console.error("Delete account failed:", e);
      toast.error("Couldn't delete your account. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ScreenHeader title="Settings" subtitle="Manage your account." />
      <div className="px-5 space-y-4">
        <UnlockFullAccessCard />
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Signed in as
          </div>
          <div className="font-medium mt-1 break-all">{user?.email ?? "—"}</div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <div className="flex items-start gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center shrink-0 text-primary">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold">Investing accounts</div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Add, edit, and remove the accounts in your portfolio.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => nav("/settings/accounts")}
            className="w-full h-12 rounded-xl justify-between"
          >
            <span>Manage accounts</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="rounded-2xl border border-loss/30 bg-card p-5 shadow-card">
          <div className="flex items-start gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-loss/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-loss" />
            </div>
            <div>
              <div className="font-semibold">Delete account</div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Permanently remove your account and all associated data: accounts,
                transactions, snapshots, and realised P&amp;L. This cannot be undone.
              </p>
            </div>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="w-full h-12 rounded-xl border-loss/40 text-loss hover:bg-loss/10 hover:text-loss"
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete my account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete your login and every record tied to it
                  (accounts, transactions, snapshots, and realised P&amp;L). This action
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={deleteAccount}
                  disabled={busy}
                  className="bg-loss text-loss-foreground hover:bg-loss/90"
                >
                  {busy ? "Deleting…" : "Yes, delete everything"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </>
  );
}
