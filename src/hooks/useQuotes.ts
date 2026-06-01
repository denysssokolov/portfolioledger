import { createContext, useContext, useEffect, useState, useRef, ReactNode, createElement } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Quote } from "@/lib/tradeStats";

const STORAGE_KEY = "swing_quotes_cache";
const REFRESH_MS = 60 * 1000;

const QuotesContext = createContext<Record<string, Quote>>({});

function loadCache(): Record<string, Quote> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveCache(q: Record<string, Quote>) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(q)); } catch {}
}

export function QuotesProvider({ children }: { children: ReactNode }) {
  const { user, session } = useAuth();
  const [quotes, setQuotes] = useState<Record<string, Quote>>(loadCache);
  const quotesRef = useRef<Record<string, Quote>>(loadCache());

  useEffect(() => {
    if (!user || !session) return;

    const fetchQuotes = async () => {
      const { data: trades } = await supabase
        .from("swing_trades")
        .select("ticker")
        .eq("user_id", user.id)
        .eq("status", "active");
      const tickers = [...new Set((trades ?? []).map((t: { ticker: string }) => t.ticker))];
      if (!tickers.length) return;
      const { data } = await supabase.functions.invoke("finnhub-quotes", { body: { tickers } });
      if (data?.quotes) {
        const incoming = data.quotes as Record<string, { c: number; dp: number; d: number; pc?: number } | null>;
        const merged = { ...quotesRef.current };
        for (const ticker of Object.keys(incoming)) {
          const q = incoming[ticker];
          if (q && q.c > 0) {
            merged[ticker] = q;
          } else if (q && !merged[ticker] && typeof q.pc === "number" && q.pc > 0) {
            merged[ticker] = { c: q.pc, dp: 0, d: 0 };
          }
          // else: keep last recorded price (market closed)
        }
        quotesRef.current = merged;
        saveCache(merged);
        setQuotes({ ...merged });
      }
    };

    fetchQuotes();
    const i = setInterval(fetchQuotes, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") fetchQuotes(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(i); document.removeEventListener("visibilitychange", onVisible); };
  }, [user, session]);

  return createElement(QuotesContext.Provider, { value: quotes }, children);
}

export function useQuotes() {
  return useContext(QuotesContext);
}