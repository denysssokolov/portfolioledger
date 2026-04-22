import { ScreenHeader } from "@/components/ScreenHeader";

export default function SwingPnL() {
  return (
    <>
      <ScreenHeader
        title="PnL"
        subtitle="Profit & Loss overview"
      />
      <div className="px-5 mt-5">
        <div className="rounded-2xl bg-card border border-border p-6 text-center text-sm text-muted-foreground">
          Profit &amp; Loss will appear once you record trades.
        </div>
      </div>
    </>
  );
}
