import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEMO_CODE,
  FULL_CODE,
  installDemoGuard,
  setAccessMode,
  useAccessMode,
} from "@/lib/accessMode";

export const AccessGate = ({ children }: { children: React.ReactNode }) => {
  const mode = useAccessMode();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // Install the demo guard exactly once, as soon as we have any access mode.
  useEffect(() => {
    if (mode) installDemoGuard();
  }, [mode]);

  if (mode) return <>{children}</>;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code === DEMO_CODE) setAccessMode("demo");
    else if (code === FULL_CODE) setAccessMode("full");
    else setErr("Incorrect code. Try again.");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-5">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-card space-y-5"
      >
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-primary/15 text-primary flex items-center justify-center">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <div className="font-display text-xl font-bold">Enter access code</div>
            <div className="text-xs text-muted-foreground">Required to continue</div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="code">Code</Label>
          <Input
            id="code"
            type="password"
            inputMode="numeric"
            autoFocus
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              if (err) setErr(null);
            }}
            placeholder="••••"
            className="h-12 rounded-xl bg-secondary border-0 text-center tracking-[0.6em] text-lg"
          />
          {err && <p className="text-sm font-medium text-destructive">{err}</p>}
        </div>

        <Button
          type="submit"
          className="w-full h-12 rounded-xl bg-gradient-primary text-primary-foreground font-semibold shadow-elegant"
        >
          Unlock
        </Button>
      </form>
    </div>
  );
};
