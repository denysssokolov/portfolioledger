import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = ["Trades", "PnL", "Settings"] as const;
type Tab = (typeof tabs)[number];

export default function SwingTrades() {
  const [tab, setTab] = useState<Tab>("Trades");
  const navigate = useNavigate();

  return (
    <>
      <ScreenHeader
        title="Swing Trades"
        subtitle="Track your short-term trades"
        right={
          <Button size="icon" variant="ghost" onClick={() => navigate("/")}
            className="h-10 w-10 rounded-xl text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
      />

      {/* Tab bar */}
      <div className="px-5 mt-2">
        <div className="flex gap-1 rounded-xl bg-muted p-1">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-lg transition-colors",
                tab === t
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 mt-5">
        {tab === "Trades" && (
          <div className="rounded-2xl bg-card border border-border p-6 text-center text-sm text-muted-foreground">
            No trades yet. Start tracking your swing trades here.
          </div>
        )}
        {tab === "PnL" && (
          <div className="rounded-2xl bg-card border border-border p-6 text-center text-sm text-muted-foreground">
            Profit &amp; Loss will appear once you record trades.
          </div>
        )}
        {tab === "Settings" && (
          <div className="rounded-2xl bg-card border border-border p-6 text-center text-sm text-muted-foreground">
            Swing trade settings coming soon.
          </div>
        )}
      </div>
    </>
  );
}
