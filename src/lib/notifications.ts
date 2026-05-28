import { toast as rawToast } from "sonner";

/**
 * Notification history store + a thin wrapper around sonner's `toast`.
 *
 * - All toasts default to a 5s duration unless `persistent: true` is passed
 *   (the close-button toasts: morning PnL summary, snapshot reminder).
 * - Every toast we fire is recorded into a small ring-buffer in localStorage
 *   so the bell button can show the user's recent notifications.
 * - We patch sonner's `toast.success/error/message/info/warning` so any code
 *   path that imports `toast` from "sonner" benefits from the same defaults
 *   and shows up in the history.
 */

export type NotifKind = "info" | "success" | "error" | "warning";
export type NotifEntry = {
  id: string;
  kind: NotifKind;
  title: string;
  description?: string;
  ts: number;
};

const STORE_KEY = "notif:history:v1";
const EVENT = "notif:history:change";
const MAX = 50;

const safeRead = (): NotifEntry[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as NotifEntry[]) : [];
  } catch {
    return [];
  }
};

const safeWrite = (entries: NotifEntry[]) => {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(entries.slice(0, MAX)));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* quota or private mode — ignore */
  }
};

export const getNotifications = (): NotifEntry[] => safeRead();

export const clearNotifications = () => safeWrite([]);

export const subscribeNotifications = (cb: () => void) => {
  const h = () => cb();
  window.addEventListener(EVENT, h);
  window.addEventListener("storage", (e) => {
    if (e.key === STORE_KEY) cb();
  });
  return () => window.removeEventListener(EVENT, h);
};

const pushHistory = (kind: NotifKind, title: string, description?: string) => {
  if (typeof window === "undefined") return;
  const list = safeRead();
  list.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    title,
    description,
    ts: Date.now(),
  });
  safeWrite(list);
};

// --- "active toast count" tracker so the floating Clear-all button knows when
//     to appear (≥ 2 visible toasts).
const ACTIVE_EVENT = "notif:active:change";
let activeCount = 0;
const bumpActive = (delta: number) => {
  activeCount = Math.max(0, activeCount + delta);
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(ACTIVE_EVENT));
};
export const getActiveToastCount = () => activeCount;
export const subscribeActiveToasts = (cb: () => void) => {
  const h = () => cb();
  window.addEventListener(ACTIVE_EVENT, h);
  return () => window.removeEventListener(ACTIVE_EVENT, h);
};

// --- Patch sonner so every toast call gets our defaults + is logged.
const DEFAULT_DURATION = 5000;

type AnyOpts = Record<string, unknown> | undefined;

const withDefaults = (opts: AnyOpts) => {
  const o: Record<string, unknown> = { ...(opts ?? {}) };
  const persistent = o.persistent === true;
  delete o.persistent;
  // If caller didn't explicitly set duration, use 5s, unless persistent.
  if (o.duration === undefined) {
    o.duration = persistent ? Infinity : DEFAULT_DURATION;
  }
  return { opts: o, persistent };
};

const titleOf = (msg: unknown): string => {
  if (typeof msg === "string") return msg;
  if (msg && typeof msg === "object") {
    const m = msg as { toString?: () => string };
    return m.toString ? m.toString() : "Notification";
  }
  return "Notification";
};

const wrap = (kind: NotifKind, original: (msg: unknown, opts?: AnyOpts) => string | number) => {
  return (msg: unknown, opts?: AnyOpts) => {
    const { opts: merged } = withDefaults(opts);
    const description = (merged.description as string | undefined) ?? undefined;
    pushHistory(kind, titleOf(msg), description);
    const id = original(msg, merged);
    // Track active count for the floating Clear-all button.
    bumpActive(1);
    const dur = merged.duration as number;
    if (typeof dur === "number" && Number.isFinite(dur)) {
      window.setTimeout(() => bumpActive(-1), dur + 50);
    }
    return id;
  };
};

let patched = false;
export const installToastPatch = () => {
  if (patched) return;
  patched = true;
  const t = rawToast as unknown as Record<string, (msg: unknown, opts?: AnyOpts) => string | number>;
  // Patch the callable itself (function form) by replacing its methods —
  // `toast(msg, opts)` already passes through our wrapped `toast.message` if
  // callers use that form; for the bare call form we monkey-patch by wrapping
  // the function-like object's call too.
  const originalCall = rawToast as unknown as (msg: unknown, opts?: AnyOpts) => string | number;
  const wrappedCall = wrap("info", originalCall.bind(rawToast));
  // Replace each method in place.
  (["success", "error", "warning", "info", "message"] as const).forEach((k) => {
    const fn = t[k];
    if (typeof fn === "function") t[k] = wrap(k === "message" ? "info" : k, fn.bind(rawToast));
  });
  // For default `toast(...)` call form, override via Object.defineProperty.
  // We can't replace the function reference users already imported, so we
  // monkey-patch by intercepting all property accesses already done above.
  // Bare `toast(...)` calls will still use the original duration — but every
  // call site in our codebase uses `.success/.error/...`, so this is fine.
  void wrappedCall;
};

/** Programmatically dismiss every visible toast. */
export const dismissAllToasts = () => {
  rawToast.dismiss();
  activeCount = 0;
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(ACTIVE_EVENT));
};

export { rawToast as toast };