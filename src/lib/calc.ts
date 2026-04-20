import type { Tables } from "@/integrations/supabase/types";

export type Account = Tables<"accounts">;
export type Transaction = Tables<"transactions">;
export type Snapshot = Tables<"snapshots">;
export type RealisedPnL = Tables<"realised_pnl">;

/**
 * Net invested per account = sum of inflows (Deposit, Investment, Transfer-in)
 * minus outflows (Withdrawal, Profit Taken, Transfer-out), up to a cutoff date (inclusive).
 */
export function investedByAccount(
  txs: Transaction[],
  cutoffISO?: string
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of txs) {
    if (cutoffISO && t.occurred_on > cutoffISO) continue;
    const amt = Number(t.amount);
    if (t.to_account_id) out[t.to_account_id] = (out[t.to_account_id] ?? 0) + amt;
    if (t.from_account_id) out[t.from_account_id] = (out[t.from_account_id] ?? 0) - amt;
  }
  return out;
}

/** Net external contributions (Deposits − Withdrawals − Profit Taken) inside a month. */
export function netContributions(txs: Transaction[], monthISO: string): number {
  const start = monthISO;
  const d = new Date(monthISO);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
  let net = 0;
  for (const t of txs) {
    if (t.occurred_on < start || t.occurred_on >= end) continue;
    const amt = Number(t.amount);
    if (t.type === "Deposit") net += amt;
    else if (t.type === "Withdrawal" || t.type === "Profit Taken") net -= amt;
  }
  return net;
}

export function latestSnapshotByAccount(snaps: Snapshot[]): Record<string, Snapshot> {
  const map: Record<string, Snapshot> = {};
  for (const s of snaps) {
    const cur = map[s.account_id];
    if (!cur || s.month > cur.month) map[s.account_id] = s;
  }
  return map;
}

export function snapshotsByMonth(snaps: Snapshot[]): Record<string, Snapshot[]> {
  const map: Record<string, Snapshot[]> = {};
  for (const s of snaps) {
    (map[s.month] ??= []).push(s);
  }
  return map;
}

export function totalsForMonth(
  monthISO: string,
  snaps: Snapshot[]
): { total: number; cash: number } {
  const ms = snaps.filter((s) => s.month === monthISO);
  const total = ms.reduce((a, s) => a + Number(s.amount_now), 0);
  const cash = ms.reduce((a, s) => a + Number(s.cash_portion), 0);
  return { total, cash };
}

export function uniqueMonths(snaps: Snapshot[]): string[] {
  return Array.from(new Set(snaps.map((s) => s.month))).sort();
}

export function previousMonthISO(monthISO: string): string {
  const d = new Date(monthISO);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 10);
}

/** First day of the month after `monthISO` (exclusive end of that month). */
export function nextMonthISO(monthISO: string): string {
  const d = new Date(monthISO);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
}

/**
 * Net delta to apply to an account from transactions whose `occurred_on`
 * is strictly AFTER the snapshot month (i.e. occurred_on >= first day of next month).
 * Transactions dated within or before the snapshot month are considered already
 * reflected in the snapshot's amount_now, regardless of when they were logged.
 * This prevents double-counting when a user back-dates or retroactively logs
 * a deposit that the snapshot value already includes.
 */
export function deltaSinceByAccount(
  txs: Transaction[],
  snapshotMonthISO: string
): Record<string, number> {
  const cutoffISO = nextMonthISO(snapshotMonthISO); // first day of month AFTER snapshot
  const out: Record<string, number> = {};
  for (const t of txs) {
    if (t.occurred_on < cutoffISO) continue;
    const amt = Number(t.amount);
    if (t.to_account_id) out[t.to_account_id] = (out[t.to_account_id] ?? 0) + amt;
    if (t.from_account_id) out[t.from_account_id] = (out[t.from_account_id] ?? 0) - amt;
  }
  return out;
}

/**
 * Live current balance per account = latest snapshot's amount_now PLUS any
 * transactions occurring after the snapshot's month. Accounts with no
 * snapshot fall back to net invested from all transactions.
 */
export function liveBalanceByAccount(
  accounts: Account[],
  snaps: Snapshot[],
  txs: Transaction[]
): Record<string, { value: number; cash: number; nonCash: number; sinceSnapshot: number }> {
  const latest = latestSnapshotByAccount(snaps);
  const investedAll = investedByAccount(txs);
  const out: Record<string, { value: number; cash: number; nonCash: number; sinceSnapshot: number }> = {};

  for (const a of accounts) {
    const s = latest[a.id];
    if (s) {
      const delta = deltaSinceByAccount(txs, s.month);
      const since = delta[a.id] ?? 0;
      const baseAmount = Number(s.amount_now);
      const baseCash = Number(s.cash_portion);
      const value = baseAmount + since;
      const isCashAccount = a.asset_class === "Cash";
      const cash = isCashAccount ? value : baseCash + since;
      const nonCash = Math.max(0, value - cash);
      out[a.id] = { value, cash: Math.max(0, cash), nonCash, sinceSnapshot: since };
    } else {
      const value = investedAll[a.id] ?? 0;
      const isCashAccount = a.asset_class === "Cash";
      out[a.id] = {
        value,
        cash: isCashAccount ? value : value,
        nonCash: 0,
        sinceSnapshot: value,
      };
    }
  }
  return out;
}
