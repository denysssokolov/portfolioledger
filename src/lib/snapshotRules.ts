import { monthKey } from "@/lib/format";

/** Returns true if today is one of the last 3 days of the given month (inclusive),
 *  OR the month is in the past. Future months and earlier days of current month are locked. */
export function isMonthEditable(monthISO: string): boolean {
  if (!monthISO) return false;
  const today = new Date();
  const todayMonth = monthKey(today);
  if (monthISO < todayMonth) return true; // past months always editable
  if (monthISO > todayMonth) return false; // future months locked

  // current month: only last 3 calendar days
  const d = new Date(monthISO);
  const daysInMonth = new Date(d.getUTCFullYear(), d.getUTCMonth() + 1, 0).getDate();
  const todayDay = today.getDate();
  return todayDay >= daysInMonth - 2;
}

/** Whole days remaining until the snapshot for monthISO becomes editable.
 *  Returns 0 if already editable. */
export function daysLeftUntilEditable(monthISO: string): number {
  if (!monthISO) return 0;
  if (isMonthEditable(monthISO)) return 0;
  const d = new Date(monthISO);
  const daysInMonth = new Date(d.getUTCFullYear(), d.getUTCMonth() + 1, 0).getDate();
  const eligible = new Date(d.getUTCFullYear(), d.getUTCMonth(), daysInMonth - 2);
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const ms = eligible.getTime() - t0.getTime();
  return Math.max(0, Math.ceil(ms / 86400000));
}
