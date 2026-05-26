import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type AccessMode = "demo" | "full" | null;

const KEY = "accessMode";
const EVENT = "accessMode:change";

export const DEMO_CODE = "1234";
export const FULL_CODE = "0912";

export const getAccessMode = (): AccessMode => {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(KEY);
  return v === "demo" || v === "full" ? v : null;
};

export const setAccessMode = (mode: AccessMode) => {
  if (mode === null) window.localStorage.removeItem(KEY);
  else window.localStorage.setItem(KEY, mode);
  window.dispatchEvent(new Event(EVENT));
};

export const isDemo = () => getAccessMode() === "demo";

export function useAccessMode() {
  const [mode, setMode] = useState<AccessMode>(getAccessMode());
  useEffect(() => {
    const h = () => setMode(getAccessMode());
    window.addEventListener(EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(EVENT, h);
      window.removeEventListener("storage", h);
    };
  }, []);
  return mode;
}

// --- Demo write guard: short-circuits supabase mutations in demo mode ---
let installed = false;
let demoToastAt = 0;

const demoStub: any = new Proxy(
  Promise.resolve({ data: null, error: { message: "Demo mode: actions disabled" } }),
  {
    get(target, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") {
        return (target as any)[prop].bind(target);
      }
      // Any chained method (.eq, .select, .single, .maybeSingle, etc) returns the same stub.
      return () => demoStub;
    },
  }
);

const notifyDemo = () => {
  const now = Date.now();
  if (now - demoToastAt < 1500) return;
  demoToastAt = now;
  toast.error("Demo mode", {
    description: "Saving, editing and deleting are disabled in the demo.",
  });
};

export const installDemoGuard = () => {
  if (installed) return;
  installed = true;
  const original = supabase.from.bind(supabase);
  (supabase as any).from = (table: string) => {
    const builder: any = original(table as any);
    (["insert", "update", "delete", "upsert"] as const).forEach((m) => {
      const orig = builder[m]?.bind(builder);
      if (!orig) return;
      builder[m] = (...args: any[]) => {
        if (isDemo()) {
          notifyDemo();
          return demoStub;
        }
        return orig(...args);
      };
    });
    return builder;
  };
};
