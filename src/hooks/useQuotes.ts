import { createContext, useContext, useEffect, useState, useRef, ReactNode, createElement } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Quote } from "@/lib/tradeStats";

const QuotesContext = createContext<Record<string, Quote>>({});

const REFRESH_MS = 15 * 60 * 1000;

export function QuotesProvider({ children }: { children: ReactNode }) {
  const { user, session } = useAuth();
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const quotesRef = useRef<Record<string, Quote>>({});

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
        quotesRef.current = { ...quotesRef.current, ...data.quotes };
        setQuotes({ ...quotesRef.current });
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