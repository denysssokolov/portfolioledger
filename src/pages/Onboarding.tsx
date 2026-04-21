import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Wallet, ArrowRight, ArrowLeft, CheckCircle2, TrendingUp, TrendingDown, Clock } from "lucide-react";
import { toast } from "sonner";
import { monthKey } from "@/lib/format";
import { cn } from "@/lib/utils";

type AssetClass = "Cash" | "Crypto" | "Shares";
type Draft = { name: string; asset_class: AssetClass };
type SeedValues = { invested: string; amount_now: string; cash_portion: string };
type PastEntry = {
  occurred_on: string;
  account_idx: string; // index in drafts, as string for the Select
  amount: string; // negative allowed for losses
  notes: string;
};

const PRESETS: Draft[] = [
  { name: "Cash", asset_class: "Cash" },
  { name: "ISA", asset_class: "Shares" },
  { name: "Crypto", asset_class: "Crypto" },
];

export default function Onboarding() {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [drafts, setDrafts] = useState<Draft[]>(PRESETS);
  const [seeds, setSeeds] = useState<Record<number, SeedValues>>({});
  const [pastEntries, setPastEntries] = useState<PastEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const update = (i: number, patch: Partial<Draft>) =>
    setDrafts((d) => d.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const remove = (i: number) => setDrafts((d) => d.filter((_, idx) => idx !== i));
  const add = () => setDrafts((d) => [...d, { name: "", asset_class: "Cash" }]);

  const updateSeed = (i: number, patch: Partial<SeedValues>) =>
    setSeeds((s) => ({ ...s, [i]: { invested: "", amount_now: "", cash_portion: "", ...s[i], ...patch } }));

  const addPast = () =>
    setPastEntries((p) => [
      ...p,
      { occurred_on: new Date().toISOString().slice(0, 10), account_idx: "0", amount: "", notes: "" },
    ]);
  const updatePast = (i: number, patch: Partial<PastEntry>) =>
    setPastEntries((p) => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removePast = (i: number) => setPastEntries((p) => p.filter((_, idx) => idx !== i));
  const skipOnboarding = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const metaName = user.user_metadata?.full_name || user.user_metadata?.name;
      const profilePayload: Record<string, unknown> = {
        user_id: user.id,
        onboarded: true,
        ...(metaName && metaName.trim() ? { display_name: metaName.trim() } : {}),
      };
      const { error } = await supabase
        .from("profiles")
        .upsert(profilePayload, { onConflict: "user_id" });
      if (error) throw error;
      qc.setQueryData(["profile", user.id], (current: Record<string, unknown> | null) => ({
        ...(current ?? {}),
        ...profilePayload,
      }));
      await qc.invalidateQueries();
      toast.success("Welcome! You can set up accounts anytime from Settings.");
      nav("/", { replace: true });
    } catch (e: any) {
      console.error("Skip onboarding failed:", e);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };


    const valid = drafts.filter((d) => d.name.trim().length > 0);
    if (valid.length === 0) {
      toast.error("Add at least one account");
      return;
    }
    setDrafts(valid.map((d) => ({ ...d, name: d.name.trim() })));
    // initialise seed defaults: cash accounts default cash_portion = amount_now
    const initial: Record<number, SeedValues> = {};
    valid.forEach((d, i) => {
      initial[i] = seeds[i] ?? {
        invested: "",
        amount_now: "",
        cash_portion: "",
      };
    });
    setSeeds(initial);
    setStep(2);
  };

  const finish = async () => {
    if (!user) return;
    setBusy(true);
    try {
      // 1. Insert accounts and get IDs back
      const { data: insertedAccounts, error: accErr } = await supabase
        .from("accounts")
        .insert(drafts.map((d) => ({ ...d, user_id: user.id })))
        .select();
      if (accErr) throw accErr;
      if (!insertedAccounts) throw new Error("No accounts returned");

      const month = monthKey(new Date());
      const today = new Date().toISOString().slice(0, 10);

      // 2. Build seed transactions (Deposit) so invested totals reconcile
      const txRows = insertedAccounts
        .map((a, i) => {
          const seed = seeds[i];
          const invested = Number(seed?.invested || 0);
          if (invested <= 0) return null;
          return {
            user_id: user.id,
            occurred_on: today,
            to_account_id: a.id,
            from_account_id: null,
            amount: invested,
            type: "Deposit",
            asset_class: a.asset_class,
            notes: "Initial balance",
          };
        })
        .filter(Boolean) as any[];

      if (txRows.length > 0) {
        const { error: txErr } = await supabase.from("transactions").insert(txRows);
        if (txErr) throw txErr;
      }

      // 2b. Build past realised profit/loss into realised_pnl only.
      // These are historical P&L entries and should NOT create transactions
      // that would affect account balances.

      // 2c. Mirror past entries into realised_pnl so they count toward lifetime realised P&L.
      const rpnlRows = pastEntries
        .map((e) => {
          const amt = Number(e.amount);
          if (!amt) return null;
          const isExternal = e.account_idx === "external";
          const idx = Number(e.account_idx);
          const acc = isExternal ? null : insertedAccounts[idx];
          if (!isExternal && !acc) return null;
          return {
            user_id: user.id,
            occurred_on: e.occurred_on,
            account_id: acc?.id ?? null,
            amount: amt,
            notes: e.notes.trim() || null,
          };
        })
        .filter(Boolean) as any[];

      if (rpnlRows.length > 0) {
        const { error: rpnlErr } = await supabase.from("realised_pnl").insert(rpnlRows);
        if (rpnlErr) throw rpnlErr;
      }

      // 3. Build first snapshot rows
      const snapRows = insertedAccounts
        .map((a, i) => {
          const seed = seeds[i];
          if (!seed || seed.amount_now === "") return null;
          return {
            user_id: user.id,
            account_id: a.id,
            month,
            amount_now: Number(seed.amount_now || 0),
            cash_portion: Number(seed.cash_portion || (a.asset_class === "Cash" ? seed.amount_now : 0)),
          };
        })
        .filter(Boolean) as any[];

      if (snapRows.length > 0) {
        const { error: snapErr } = await supabase
          .from("snapshots")
          .upsert(snapRows, { onConflict: "user_id,account_id,month" });
        if (snapErr) throw snapErr;
      }

      // 4. Mark profile onboarded (upsert in case the trigger didn't create it)
      const metaName = (user.user_metadata as any)?.display_name as string | undefined;
      const profilePayload = {
        user_id: user.id,
        onboarded: true,
        ...(metaName && metaName.trim() ? { display_name: metaName.trim() } : {}),
      };
      const { error: pe } = await supabase
        .from("profiles")
        .upsert(profilePayload, { onConflict: "user_id" });
      if (pe) throw pe;

      qc.setQueryData(["profile", user.id], (current: Record<string, unknown> | null) => ({
        ...(current ?? {}),
        ...profilePayload,
      }));
      await qc.invalidateQueries();
      toast.success("You're all set");
      nav("/", { replace: true });
    } catch (e: any) {
      console.error("Onboarding save failed:", e);
      // Stale session: the auth user was deleted on the server but the JWT is still cached.
      if (e?.code === "23503" && String(e?.message ?? "").includes("user_id")) {
        toast.error("Your session is out of date. Please sign in again.");
        await supabase.auth.signOut();
        nav("/auth", { replace: true });
        return;
      }
      toast.error("Couldn't save your setup. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative">
      <div className="absolute inset-0 bg-gradient-hero pointer-events-none" />
      <div className="relative mx-auto max-w-2xl px-5 py-10">
        {step === 0 && (
          <div className="animate-slide-up">
            <div className="flex items-center gap-3 mb-8">
              <div className="h-11 w-11 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-elegant">
                <Wallet className="h-5 w-5 text-primary-foreground" strokeWidth={2.6} />
              </div>
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight">
                  Welcome to your portfolio
                </h1>
                <p className="text-sm text-muted-foreground">
                  Would you like to set up your investment accounts now?
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <Button
                onClick={() => setStep(1)}
                className="w-full h-14 rounded-2xl bg-gradient-primary text-primary-foreground font-semibold shadow-elegant text-base"
              >
                <Wallet className="h-5 w-5 mr-2" /> Set up accounts now
              </Button>
              <Button
                variant="outline"
                onClick={skipOnboarding}
                disabled={busy}
                className="w-full h-14 rounded-2xl text-base"
              >
                <Clock className="h-5 w-5 mr-2" /> Do it later
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center mt-4">
              You can always add accounts from the Settings page.
            </p>
          </div>
        )}

        {step >= 1 && (
          <div className="flex items-center gap-3 mb-8">
            <div className="h-11 w-11 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-elegant">
              <Wallet className="h-5 w-5 text-primary-foreground" strokeWidth={2.6} />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">
                {step === 1
                  ? "Set up your accounts"
                  : step === 2
                  ? "Starting balances"
                  : "Past profits & losses"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {step === 1
                  ? "Add the accounts you want to track."
                  : step === 2
                  ? "We'll save these as your first snapshot."
                  : "Log any profits or losses you've already secured."}
              </p>
            </div>
          </div>
        )}

        {step >= 1 && (
          <div className="flex items-center gap-2 mb-6">
            <div className={`h-1.5 flex-1 rounded-full ${step >= 1 ? "bg-primary" : "bg-secondary"}`} />
            <div className={`h-1.5 flex-1 rounded-full ${step >= 2 ? "bg-primary" : "bg-secondary"}`} />
            <div className={`h-1.5 flex-1 rounded-full ${step >= 3 ? "bg-primary" : "bg-secondary"}`} />
          </div>
        )}

        {step === 1 && (
          <>
            <div className="space-y-3 animate-slide-up">
              {drafts.map((d, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-border bg-card p-3 flex items-center gap-2 shadow-card"
                >
                  <Input
                    value={d.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    placeholder="Account name"
                    className="flex-1 h-11 rounded-xl bg-secondary border-0"
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                  />
                  <Select
                    value={d.asset_class}
                    onValueChange={(v) => update(i, { asset_class: v as AssetClass })}
                  >
                    <SelectTrigger className="w-32 h-11 rounded-xl bg-secondary border-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Shares">Shares</SelectItem>
                      <SelectItem value="Crypto">Crypto</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(i)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={add}
              className="w-full mt-3 h-12 rounded-2xl border-dashed bg-transparent"
            >
              <Plus className="h-4 w-4 mr-2" /> Add account
            </Button>

            <Button
              onClick={goToStep2}
              className="w-full mt-8 h-13 py-3.5 rounded-2xl bg-gradient-primary text-primary-foreground font-semibold shadow-elegant"
            >
              Continue <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="space-y-3 animate-slide-up">
              {drafts.map((d, i) => {
                const v = seeds[i] ?? { invested: "", amount_now: "", cash_portion: "" };
                return (
                  <div
                    key={i}
                    className="rounded-2xl border border-border bg-card p-4 shadow-card"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="font-semibold">{d.name}</div>
                        <div className="text-xs text-muted-foreground">{d.asset_class}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Invested
                        </label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          value={v.invested}
                          onChange={(e) => updateSeed(i, { invested: e.target.value })}
                          placeholder="0.00"
                          className="h-12 rounded-xl bg-secondary border-0 font-display text-lg font-bold tabular"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Value now
                        </label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          value={v.amount_now}
                          onChange={(e) => updateSeed(i, { amount_now: e.target.value })}
                          placeholder="0.00"
                          className="h-12 rounded-xl bg-secondary border-0 font-display text-lg font-bold tabular"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Cash portion
                        </label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          value={v.cash_portion}
                          onChange={(e) => updateSeed(i, { cash_portion: e.target.value })}
                          placeholder="0.00"
                          className="h-12 rounded-xl bg-secondary border-0 font-display text-lg font-bold tabular"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 mt-8">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                className="h-13 py-3.5 rounded-2xl"
              >
                <ArrowLeft className="h-5 w-5 mr-2" /> Back
              </Button>
              <Button
                onClick={() => setStep(3)}
                className="flex-1 h-13 py-3.5 rounded-2xl bg-gradient-primary text-primary-foreground font-semibold shadow-elegant"
              >
                Continue <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="space-y-3 animate-slide-up">
              {pastEntries.length === 0 && (
                <div className="rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center">
                  <div className="text-sm text-muted-foreground">
                    No past profits or losses to log? Skip this step — you can still log them as transactions later.
                  </div>
                </div>
              )}

              {pastEntries.map((e, i) => {
                const amt = Number(e.amount);
                const positive = amt >= 0;
                return (
                  <div
                    key={i}
                    className="rounded-2xl border border-border bg-card p-4 shadow-card space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "h-9 w-9 rounded-xl flex items-center justify-center shrink-0",
                          amt === 0
                            ? "bg-muted text-muted-foreground"
                            : positive
                            ? "bg-success/10 text-success"
                            : "bg-loss/10 text-loss"
                        )}
                      >
                        {positive ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                      </div>
                      <div className="text-xs text-muted-foreground flex-1">
                        Entry {i + 1} · use a negative amount for a loss
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removePast(i)}
                        className="text-muted-foreground hover:text-destructive h-8 w-8"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Date
                        </label>
                        <Input
                          type="date"
                          value={e.occurred_on}
                          onChange={(ev) => updatePast(i, { occurred_on: ev.target.value })}
                          className="h-11 rounded-xl bg-secondary border-0"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Account
                        </label>
                        <Select
                          value={e.account_idx}
                          onValueChange={(v) => updatePast(i, { account_idx: v })}
                        >
                          <SelectTrigger className="h-11 rounded-xl bg-secondary border-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="external">External / —</SelectItem>
                            {drafts.map((d, idx) => (
                              <SelectItem key={idx} value={String(idx)}>
                                {d.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Amount (£) — negative for loss
                      </label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        value={e.amount}
                        onChange={(ev) => updatePast(i, { amount: ev.target.value })}
                        placeholder="0.00"
                        className="h-12 rounded-xl bg-secondary border-0 font-display text-lg font-bold tabular"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Notes (optional)
                      </label>
                      <Textarea
                        value={e.notes}
                        onChange={(ev) => updatePast(i, { notes: ev.target.value })}
                        maxLength={500}
                        className="rounded-xl bg-secondary border-0 min-h-[60px]"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={addPast}
              className="w-full mt-3 h-12 rounded-2xl border-dashed bg-transparent"
            >
              <Plus className="h-4 w-4 mr-2" /> Add past entry
            </Button>

            <div className="flex gap-2 mt-8">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(2)}
                className="h-13 py-3.5 rounded-2xl"
              >
                <ArrowLeft className="h-5 w-5 mr-2" /> Back
              </Button>
              <Button
                onClick={finish}
                disabled={busy}
                className="flex-1 h-13 py-3.5 rounded-2xl bg-gradient-primary text-primary-foreground font-semibold shadow-elegant"
              >
                <CheckCircle2 className="h-5 w-5 mr-2" />
                {busy ? "Saving…" : "Finish setup"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
