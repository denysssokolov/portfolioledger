import { useState, useEffect } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

export default function SwingSettings() {
  const { user } = useAuth();
  const [accountSize, setAccountSize] = useState("");
  const [riskPct, setRiskPct] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("swing_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setAccountSize(data.account_size?.toString() ?? "");
          setRiskPct(data.risk_percentage?.toString() ?? "1");
          setApiKey(data.finhub_api_key ?? "");
        }
        setLoaded(true);
      });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const payload = {
      user_id: user.id,
      account_size: accountSize ? Number(accountSize) : null,
      risk_percentage: riskPct ? Number(riskPct) : 1,
      finhub_api_key: apiKey || null,
    };

    // upsert
    const { error } = await supabase
      .from("swing_settings")
      .upsert(payload, { onConflict: "user_id" });

    setSaving(false);
    if (error) {
      console.error("swing_settings upsert error:", error);
      toast.error("Couldn't save settings. Please try again.");
    } else toast.success("Settings saved");
  };

  if (!loaded) return null;

  return (
    <>
      <ScreenHeader title="Settings" subtitle="Swing trade preferences" />
      <div className="px-5 mt-5 space-y-6 pb-28">
        <form autoComplete="off" onSubmit={(e) => e.preventDefault()}>
        {/* Hidden decoy fields to suppress browser password-save prompts triggered
            by the API-key password field below */}
        <input type="text" name="prevent_autofill" autoComplete="off" className="hidden" />
        <input type="password" name="prevent_autofill_pw" autoComplete="new-password" className="hidden" />

        {/* Account size */}
        <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Account & Risk</h3>

          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Account Size ($)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={accountSize}
              onChange={(e) => setAccountSize(e.target.value)}
              placeholder="10000"
              autoComplete="off"
              name="account_size_field"
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">
              Preferred Risk per Trade (%)
            </Label>
            <Input
              type="number"
              inputMode="decimal"
              value={riskPct}
              onChange={(e) => setRiskPct(e.target.value)}
              placeholder="1"
              autoComplete="off"
              name="risk_pct_field"
            />
          </div>
        </div>
              type="number"
              value={accountSize}
              onChange={(e) => setAccountSize(e.target.value)}
              placeholder="10000"
            />
        </div>

        {/* Finnhub API key */}
        <div className="rounded-2xl bg-card border border-border p-5 space-y-4 mt-6">
          <h3 className="text-sm font-semibold text-foreground">Finnhub API</h3>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">API Key</Label>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Your Finnhub API key"
                className="pr-10"
                autoComplete="new-password"
                name="finnhub_api_key_field"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Get a free key at{" "}
              <a
                href="https://finnhub.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                finnhub.io
              </a>
            </p>
          </div>
        </div>

        <Button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-xl mt-6"
        >
          {saving ? "Saving…" : "Save Settings"}
        </Button>
        </form>
      </div>
    </>
  );
}

