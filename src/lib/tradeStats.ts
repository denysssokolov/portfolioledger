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

export const riskAtStop = (t: Trade): number | null => {
  if (t.stop_loss == null) return null;
  const sh = sharesOf(t);
  return t.direction === "long"
    ? (t.entry_price - t.stop_loss) * sh
    : (t.stop_loss - t.entry_price) * sh;
};

export type Stats = {
  totalPnl: number;
  openPnl: number;
  closedPnl: number;
  avgWin: number;
  avgLoss: number;
  avgWinPct: number;
  avgLossPct: number;
  winRateOpen: number;
  winRateClosed: number;
  rrOpen: number;
  rrClosed: number;
  totalRiskOpen: number;
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
  const openPnl = sum(openPnls);
  const closedPnl = sum(closedPnls);

  const allPnls = [
    ...open.map((t, i) => ({ t, p: openPnls[i] })),
    ...closed.map((t, i) => ({ t, p: closedPnls[i] })),
  ];
  const wins = allPnls.filter((x) => x.p > 0);
  const losses = allPnls.filter((x) => x.p < 0);

  const avgWin = wins.length ? sum(wins.map((x) => x.p)) / wins.length : 0;
  const avgLoss = losses.length ? sum(losses.map((x) => x.p)) / losses.length : 0;
  const avgWinPct = equity > 0 ? (avgWin / equity) * 100 : 0;
  const avgLossPct = equity > 0 ? (avgLoss / equity) * 100 : 0;

  const winRateOpen = open.length
    ? (openPnls.filter((p) => p > 0).length / open.length) * 100
    : 0;
  const winRateClosed = closed.length
    ? (closedPnls.filter((p) => p > 0).length / closed.length) * 100
    : 0;

  const rrFor = (subset: { t: Trade; p: number }[]) => {
    const w = subset.filter((x) => x.p > 0).map((x) => x.p);
    const l = subset.filter((x) => x.p < 0).map((x) => Math.abs(x.p));
    if (!w.length || !l.length) return 0;
    return sum(w) / w.length / (sum(l) / l.length);
  };
  const rrOpen = rrFor(open.map((t, i) => ({ t, p: openPnls[i] })));
  const rrClosed = rrFor(closed.map((t, i) => ({ t, p: closedPnls[i] })));

  const totalRiskOpen = sum(open.map((t) => riskAtStop(t) ?? 0));

  // Sharpe on closed trade returns (pnl / capital)
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
  const winRateAll = allPnls.length
    ? wins.length / allPnls.length
    : 0;
  const expectancy = winRateAll * avgWin + (1 - winRateAll) * avgLoss;
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

  return {
    totalPnl: openPnl + closedPnl,
    openPnl,
    closedPnl,
    avgWin,
    avgLoss,
    avgWinPct,
    avgLossPct,
    winRateOpen,
    winRateClosed,
    rrOpen,
    rrClosed,
    totalRiskOpen,
    numTrades: trades.length,
    numOpen: open.length,
    numClosed: closed.length,
    sharpe,
    expectancy,
    profitFactor,
  };
}
