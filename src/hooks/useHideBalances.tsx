import { useEffect, useState, useCallback } from "react";

const KEY = "hideBalances";
const EVENT = "hideBalances:change";

export function useHideBalances() {
  const [hidden, setHidden] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(KEY) === "1";
  });

  useEffect(() => {
    const handler = () => setHidden(window.localStorage.getItem(KEY) === "1");
    window.addEventListener(EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const toggle = useCallback(() => {
    const next = !(window.localStorage.getItem(KEY) === "1");
    window.localStorage.setItem(KEY, next ? "1" : "0");
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { hidden, toggle };
}
