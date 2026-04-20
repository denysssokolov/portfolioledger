import { useEffect, useState, useCallback } from "react";

const KEY = "safetyMode";
const EVENT = "safetyMode:change";

const read = () =>
  typeof window !== "undefined" && window.localStorage.getItem(KEY) === "1";

export function useSafetyMode() {
  const [safe, setSafe] = useState<boolean>(read);

  useEffect(() => {
    const handler = () => setSafe(read());
    window.addEventListener(EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const toggle = useCallback(() => {
    const next = !read();
    window.localStorage.setItem(KEY, next ? "1" : "0");
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { safe, toggle };
}
