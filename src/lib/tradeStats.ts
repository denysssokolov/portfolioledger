export type Trade = {
  id: string;
  status: string;
  ticker: string;
  direction: string;
  capital_invested: number;
  entry_price: number;
  exit_price: number | null;
  entry_date: string;
  exit_date: string | null;
  stop_loss: number | null;
};

export type Quote = { c: number; dp?: number; d?: number } | null;

export const sharesOf = (t: Trade) => t.capital_invested / t.entry_price;

export const currentPrice = (t: Trade, q: Quote): number | null => {
  if (t.status === "closed") return t.exit_price ?? null;
  return q?.c ?? null;
};

export const pnlOf = (t: Trade, q: Quote): number | null => {
  const cp = currentPrice(t, q);
  if (cp == null) return null;
  const sh = sharesOf(t);
  return t.direction === "long"
    ? (cp - t.entry_price) * sh
    : (t.entry_price - cp) * sh;
};

export const pnlPctOf = (t: Trade, q: Quote): number | null => {
  const p = pnlOf(t, q);
  if (p == null) return null;
  return (p / t.capital_invested) * 100;
};

/**
 * Signed P&L if the stop-loss were hit.
 * If SL is on the profitable side of entry (e.g. trailing stop above entry on a long),
 * this returns a POSITIVE number — i.e. SL acts as a take-profit.
 */
export const pnlAtStop = (t: Trade): number | null => {
  if (t.stop_loss == null) return null;
  const sh = sharesOf(t);
  return t.direction === "long"
    ? (t.stop_loss - t.entry_price) * sh
    : (t.entry_price - t.stop_loss) * sh;
};

/** Back-compat alias — returns signed P&L at SL */
export const riskAtStop = pnlAtStop;

export type Stats = {
  totalPnl: number;
  openPnl: number;
  closedPnl: number;
  avgWin: number;
  avgLoss: number;
  avgWinPct: number;
  avgLossPct: number;
  avgPositionSize: number;
  avgWinPositionSize: number;
  avgLossPositionSize: number;
  avgWinOpen: number;
  avgLossOpen: number;
  avgWinClosed: number;
  avgLossClosed: number;
  winRateOpen: number;
  winRateClosed: number;
  rrOpen: number;
  rrClosed: number;
  netIfAllSlHit: number;
  numTrades: number;
  numOpen: number;
  numClosed: number;
  sharpe: number;
  expectancy: number;
  profitFactor: number;
};

export function computeStats(
  trades: Trade[],
  quotes: Record<string, Quote>,
  equity: number
): Stats {
  const open = trades.filter((t) => t.status === "active");
  const closed = trades.filter((t) => t.status === "closed");

  const openPnls = open.map((t) => pnlOf(t, quotes[t.ticker] ?? null) ?? 0);
  const closedPnls = closed.map((t) => pnlOf(t, null) ?? 0);

  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  const avg = (a: number[]) => (a.length ? sum(a) / a.length : 0);
  const openPnl = sum(openPnls);
  const closedPnl = sum(closedPnls);

  const openPairs = open.map((t, i) => ({ t, p: openPnls[i] }));
  const closedPairs = closed.map((t, i) => ({ t, p: closedPnls[i] }));
  const allPairs = [...openPairs, ...closedPairs];

  const wins = allPairs.filter((x) => x.p > 0);
  const losses = allPairs.filter((x) => x.p < 0);

  const avgWin = avg(wins.map((x) => x.p));
  const avgLoss = avg(losses.map((x) => x.p));
  const avgWinPct = equity > 0 ? (avgWin / equity) * 100 : 0;
  const avgLossPct = equity > 0 ? (avgLoss / equity) * 100 : 0;

  const avgPositionSize = avg(trades.map((t) => t.capital_invested));
  const avgWinPositionSize = avg(wins.map((x) => x.t.capital_invested));
  const avgLossPositionSize = avg(losses.map((x) => x.t.capital_invested));

  const winRateOpen = open.length
    ? (openPnls.filter((p) => p > 0).length / open.length) * 100
    : 0;
  const winRateClosed = closed.length
    ? (closedPnls.filter((p) => p > 0).length / closed.length) * 100
    : 0;

  const avgWinOpen = avg(openPairs.filter((x) => x.p > 0).map((x) => x.p));
  const avgLossOpen = avg(openPairs.filter((x) => x.p < 0).map((x) => x.p));
  const avgWinClosed = avg(closedPairs.filter((x) => x.p > 0).map((x) => x.p));
  const avgLossClosed = avg(closedPairs.filter((x) => x.p < 0).map((x) => x.p));

  const rrFor = (subset: { t: Trade; p: number }[]) => {
    const w = subset.filter((x) => x.p > 0).map((x) => x.p);
    const l = subset.filter((x) => x.p < 0).map((x) => Math.abs(x.p));
    if (!w.length || !l.length) return 0;
    return sum(w) / w.length / (sum(l) / l.length);
  };
  const rrOpen = rrFor(openPairs);
  const rrClosed = rrFor(closedPairs);

  // Signed net result if every open stop-loss were hit (SL above entry on longs adds profit)
  const netIfAllSlHit = sum(open.map((t) => pnlAtStop(t) ?? 0));

  // Sharpe on closed trade returns
  const returns = closed.map((t, i) => closedPnls[i] / t.capital_invested);
  let sharpe = 0;
  if (returns.length > 1) {
    const mean = sum(returns) / returns.length;
    const variance =
      sum(returns.map((r) => (r - mean) ** 2)) / (returns.length - 1);
    const sd = Math.sqrt(variance);
    sharpe = sd > 0 ? (mean / sd) * Math.sqrt(returns.length) : 0;
  }

  const totalWins = sum(wins.map((x) => x.p));
  const totalLosses = Math.abs(sum(losses.map((x) => x.p)));
  const winRateAll = allPairs.length ? wins.length / allPairs.length : 0;
  const expectancy = winRateAll * avgWin + (1 - winRateAll) * avgLoss;
  const profitFactor =
    totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

  return {
    totalPnl: openPnl + closedPnl,
    openPnl,
    closedPnl,
    avgWin,
    avgLoss,
    avgWinPct,
    avgLossPct,
    avgPositionSize,
    avgWinPositionSize,
    avgLossPositionSize,
    avgWinOpen,
    avgLossOpen,
    avgWinClosed,
    avgLossClosed,
    winRateOpen,
    winRateClosed,
    rrOpen,
    rrClosed,
    netIfAllSlHit,
    numTrades: trades.length,
    numOpen: open.length,
    numClosed: closed.length,
    sharpe,
    expectancy,
    profitFactor,
  };
}
