import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useAccessModeFromProfile } from "@/hooks/usePortfolioData";
import { supabase } from "@/integrations/supabase/client";
import { FULL_CODE, setAccessMode } from "@/lib/accessMode";
import { toast } from "sonner";

export function UnlockFullAccessCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const mode = useAccessModeFromProfile(user?.id);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Only show for demo accounts. Once the user upgrades, the card disappears.
  if (mode !== "demo") return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErr(null);
    if (code.trim() !== FULL_CODE) {
      setErr("Incorrect unlock code.");
      return;
    }
    setBusy(true);
    // The demo guard intentionally exempts the `profiles` table so this update
    // can promote the account to full access.
    const { error } = await supabase
      .from("profiles")
      .update({ access_mode: "full" })
      .eq("user_id", user.id);
    if (error) {
      setBusy(false);
      setErr("Couldn't unlock. Please try again.");
      return;
    }
    setAccessMode("full");
    await qc.invalidateQueries({ queryKey: ["profile", user.id] });
    toast.success("Full access unlocked");
    setBusy(false);
  };

  return (
    <div className="rounded-2xl border border-primary/40 bg-card p-5 shadow-card">
      <div className="flex items-start gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 text-primary">
          <Lock className="h-5 w-5" />
        </div>
        <div>
          <div className="font-semibold">Unlock full access</div>
          <p className="text-sm text-muted-foreground mt-0.5">
            You're in demo mode. Enter your unlock code to enable every feature.
          </p>
        </div>
      </div>
      <form onSubmit={submit} autoComplete="off" className="space-y-3">
        <input type="text" name="prevent_autofill" autoComplete="off" className="hidden" />
        <div>
          <Label htmlFor="unlock-code" className="text-xs text-muted-foreground">
            Unlock code
          </Label>
          <Input
            id="unlock-code"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            name="unlock_code_field"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              if (err) setErr(null);
            }}
            placeholder="••••"
            className="h-12 rounded-xl bg-secondary border-0 text-center tracking-[0.5em] text-lg"
          />
          {err && <p className="text-sm font-medium text-destructive mt-1.5">{err}</p>}
        </div>
        <Button
          type="submit"
          disabled={busy}
          className="w-full h-12 rounded-xl bg-gradient-primary text-primary-foreground font-semibold shadow-elegant"
        >
          <KeyRound className="h-4 w-4 mr-2" />
          {busy ? "Unlocking…" : "Unlock"}
        </Button>
      </form>
    </div>
  );
}