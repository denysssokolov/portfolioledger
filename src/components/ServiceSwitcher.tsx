import { useLocation, useNavigate } from "react-router-dom";
import { Briefcase, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function ServiceSwitcher() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isSwing = pathname.startsWith("/swing-trades");

  return (
    <div className="sticky top-0 z-50 glass border-b border-border">
      <div className="mx-auto max-w-2xl flex gap-1 p-2">
        <button
          onClick={() => navigate("/")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors",
            !isSwing
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
        >
          <Briefcase className="h-4 w-4" />
          Investment Portfolio
        </button>
        <button
          onClick={() => navigate("/swing-trades")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors",
            isSwing
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
        >
          <TrendingUp className="h-4 w-4" />
          Swing Trades
        </button>
      </div>
    </div>
  );
}
