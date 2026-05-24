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


const MASK = "••••";

const isHidden = () => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("safetyMode") === "1";
};

export const fmtMoney = (n: number) => {
  if (isHidden()) return MASK;
  return Math.abs(n) >= 1000 ? GBP.format(n) : GBP2.format(n);
};

export const fmtSigned = (n: number) => {
  if (isHidden()) return MASK;
  return (n >= 0 ? "+" : "−") + (Math.abs(n) >= 1000 ? GBP.format(Math.abs(n)) : GBP2.format(Math.abs(n)));
};

export const fmtPct = (n: number, digits = 1) => {
  if (isHidden()) return MASK;
  return (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(digits) + "%";
};

// USD helpers for swing trades — also respect safety mode
export const fmtUsd = (n: number, digits = 2) => {
  if (isHidden()) return MASK;
  return `$${n.toFixed(digits)}`;
};

export const fmtUsdSigned = (n: number, digits = 2) => {
  if (isHidden()) return MASK;
  return `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(digits)}`;
};

export const monthKey = (d: Date) =>
  new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10);

export const monthLabel = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
};
