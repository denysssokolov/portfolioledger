import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { TrendingUp } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type Mode = "signin" | "signup" | "forgot";

export default function Auth() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (user) nav("/", { replace: true });
  }, [user, nav]);

  // Clear errors when switching modes or editing fields
  useEffect(() => {
    setEmailError(null);
    setFormError(null);
  }, [mode]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setPassword("");
  };

  const onSubmit = async () => {
    setBusy(true);
    setEmailError(null);
    setFormError(null);
    try {
      if (mode === "signup") {
        if (!name.trim()) {
          setFormError("Please enter your name");
          setBusy(false);
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { display_name: name.trim() },
          },
        });
        if (error) {
          const msg = (error.message || "").toLowerCase();
          if (
            msg.includes("already registered") ||
            msg.includes("already been registered") ||
            msg.includes("user already") ||
            msg.includes("already exists")
          ) {
            setEmailError("This email is already in use. Try signing in instead.");
          } else {
            setFormError(error.message);
          }
          return;
        }
        // Supabase returns 200 with an empty identities array when the email
        // already exists (to prevent enumeration). Detect that case.
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setEmailError("This email is already in use. Try signing in instead.");
          return;
        }
        toast.success("Account created — check your email to verify, then sign in.");
        switchMode("signin");
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          const msg = (error.message || "").toLowerCase();
          if (msg.includes("invalid login")) {
            setFormError("Incorrect email or password.");
          } else if (msg.includes("email not confirmed")) {
            setFormError("Please verify your email before signing in.");
          } else {
            setFormError(error.message);
          }
          return;
        }
      } else {
        // forgot
        if (!email.trim()) {
          setEmailError("Please enter your email");
          return;
        }
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) {
          setFormError(error.message);
          return;
        }
        toast.success("Password reset link sent — check your inbox.");
        switchMode("signin");
      }
    } catch (err: any) {
      setFormError(err.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password";
  const subtitle =
    mode === "signin"
      ? "Sign in to track your portfolio."
      : mode === "signup"
      ? "Start tracking in under a minute."
      : "We'll email you a link to set a new password.";

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
          <h1 className="font-display text-2xl font-bold mb-1">{title}</h1>
          <p className="text-sm text-muted-foreground mb-6">{subtitle}</p>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) onSubmit();
            }}
          >
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="name">Your name</Label>
                <Input
                  id="name"
                  type="text"
                  autoComplete="given-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex"
                  className="h-12 rounded-xl bg-secondary border-0"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(null);
                }}
                aria-invalid={!!emailError}
                className={`h-12 rounded-xl bg-secondary border-0 ${
                  emailError ? "ring-2 ring-destructive" : ""
                }`}
              />
              {emailError && (
                <p className="text-sm font-medium text-destructive">{emailError}</p>
              )}
            </div>
            {mode !== "forgot" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => switchMode("forgot")}
                      className="text-xs text-primary font-medium hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 rounded-xl bg-secondary border-0"
                />
              </div>
            )}

            {formError && (
              <p className="text-sm font-medium text-destructive">{formError}</p>
            )}

            <Button
              type="submit"
              disabled={busy}
              className="w-full h-12 rounded-xl bg-gradient-primary text-primary-foreground hover:opacity-90 font-semibold shadow-elegant"
            >
              {busy
                ? "Please wait…"
                : mode === "signin"
                ? "Sign in"
                : mode === "signup"
                ? "Create account"
                : "Send reset link"}
            </Button>
          </form>

          <button
            type="button"
            onClick={() =>
              switchMode(
                mode === "signin" ? "signup" : mode === "signup" ? "signin" : "signin",
              )
            }
            className="w-full mt-5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {mode === "signin" ? (
              <>Don't have an account? <span className="text-primary font-medium">Sign up</span></>
            ) : mode === "signup" ? (
              <>Already have an account? <span className="text-primary font-medium">Sign in</span></>
            ) : (
              <>Remembered it? <span className="text-primary font-medium">Back to sign in</span></>
            )}
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          By continuing you agree to our terms.{" "}
          <Link to="/" className="underline hover:text-foreground">Back</Link>
        </p>
      </div>
    </div>
  );
}
