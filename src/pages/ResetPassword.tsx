import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { TrendingUp } from "lucide-react";

export default function ResetPassword() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Supabase puts the recovery session in the URL hash; the client picks it
    // up automatically. We just confirm a session exists for recovery.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated. You're signed in.");
      nav("/", { replace: true });
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center px-5">
      <div className="absolute inset-0 bg-gradient-hero pointer-events-none" />
      <div className="relative w-full max-w-md">
        <div className="flex items-center gap-3 mb-10">
          <div className="h-11 w-11 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-elegant">
            <TrendingUp className="h-5 w-5 text-primary-foreground" strokeWidth={2.6} />
          </div>
          <div>
            <div className="font-display text-2xl font-bold tracking-tight">Ledger</div>
            <div className="text-xs text-muted-foreground">Personal portfolio tracker</div>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 shadow-card animate-slide-up">
          <h1 className="font-display text-2xl font-bold mb-1">Set a new password</h1>
          <p className="text-sm text-muted-foreground mb-6">
            {ready
              ? "Choose a new password for your account."
              : "Verifying your reset link…"}
          </p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 rounded-xl bg-secondary border-0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="h-12 rounded-xl bg-secondary border-0"
              />
            </div>

            {error && (
              <p className="text-sm font-medium text-destructive">{error}</p>
            )}

            <Button
              type="submit"
              disabled={busy || !ready}
              className="w-full h-12 rounded-xl bg-gradient-primary text-primary-foreground hover:opacity-90 font-semibold shadow-elegant"
            >
              {busy ? "Updating…" : "Update password"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
