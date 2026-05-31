import { createContext, useContext, useEffect, useState, useCallback, ReactNode, createElement } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Quote } from "@/lib/tradeStats";

const QuotesContext = createContext<Record<string, Quote>>({});

const REFRESH_MS = 15 * 60 * 1000;

export function QuotesProvider({ children }: { children: ReactNode }) {
  const { user, session } = useAuth();
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});

  const fetchQuotes = useCallback(async () => {
    if (!user || !session) return;
    const { data: trades } = await supabase
      .from("swing_trades")
      .select("ticker")
      .eq("user_id", user.id)
      .eq("status", "active");
    const tickers = [...new Set((trades ?? []).map((t: { ticker: string }) => t.ticker))];
    if (!tickers.length) return;
    const { data } = await supabase.functions.invoke("finnhub-quotes", { body: { tickers } });
    if (data?.quotes) setQuotes(data.quotes);
  }, [user, session]);

  useEffect(() => {
    if (!user || !session) return;
    fetchQuotes();
    const i = setInterval(fetchQuotes, REFRESH_MS);
    document.addEventListener("visibilitychange", fetchQuotes);
    return () => { clearInterval(i); document.removeEventListener("visibilitychange", fetchQuotes); };
  }, [user, session, fetchQuotes]);

  return createElement(QuotesContext.Provider, { value: quotes }, children);
}

export function useQuotes() {
  return useContext(QuotesContext);
}