export const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

export const GBP2 = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 2,
});

export let HIDE_NUMBERS = false;
export const setHideNumbers = (v: boolean) => { HIDE_NUMBERS = v; };

const MASK = "••••";

export const fmtMoney = (n: number) => {
  if (HIDE_NUMBERS) return MASK;
  return Math.abs(n) >= 1000 ? GBP.format(n) : GBP2.format(n);
};

export const fmtSigned = (n: number) => {
  if (HIDE_NUMBERS) return MASK;
  return (n >= 0 ? "+" : "−") + fmtMoney(Math.abs(n));
};

export const fmtPct = (n: number, digits = 1) => {
  if (HIDE_NUMBERS) return MASK;
  return (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(digits) + "%";
};

export const monthKey = (d: Date) =>
  new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10);

export const monthLabel = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
};
