import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode, createElement } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Quote } from "@/lib/tradeStats";

const STORAGE_KEY = "swing_quotes_cache";
const REFRESH_MS = 15 * 60 * 1000;

const QuotesContext = createContext<Record<string, Quote>>({});
const QuotesRefreshContext = createContext<() => void>(() => {});

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
  const fetchRef = useRef<() => void>(() => {});

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
        const incoming = data.quotes as Record<string, { c: number; dp: number; d: number } | null>;
        const merged = { ...quotesRef.current };
        for (const ticker of Object.keys(incoming)) {
          const q = incoming[ticker];
          if (q && q.c > 0) {
            merged[ticker] = q;
          }
        }
        quotesRef.current = merged;
        saveCache(merged);
        setQuotes({ ...merged });
      }
    };

    fetchRef.current = fetchQuotes;
    fetchQuotes();
    const i = setInterval(fetchQuotes, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") fetchQuotes(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(i);
      document.removeEventListener("visibilitychange", onVisible);
      fetchRef.current = () => {};
    };
  }, [user, session]);

  const refresh = useCallback(() => fetchRef.current(), []);

  return createElement(
    QuotesContext.Provider,
    { value: quotes },
    createElement(QuotesRefreshContext.Provider, { value: refresh }, children)
  );
}

export function useQuotes() {
  return useContext(QuotesContext);
}

export function useQuotesRefresh() {
  return useContext(QuotesRefreshContext);
}