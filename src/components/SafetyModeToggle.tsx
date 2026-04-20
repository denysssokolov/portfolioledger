import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSafetyMode } from "@/hooks/useSafetyMode";
import { cn } from "@/lib/utils";

export const SafetyModeToggle = () => {
  const { safe, toggle } = useSafetyMode();
  return (
    <Button
      onClick={toggle}
      size="icon"
      variant="ghost"
      aria-label={safe ? "Disable safety mode" : "Enable safety mode"}
      title={safe ? "Safety mode on — tap to reveal" : "Safety mode off — tap to hide"}
      className={cn(
        "fixed top-4 right-4 z-50 h-11 w-11 rounded-full border border-border shadow-card backdrop-blur",
        safe
          ? "bg-primary/15 text-primary hover:bg-primary/25"
          : "bg-card/80 text-muted-foreground hover:text-foreground"
      )}
    >
      {safe ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
    </Button>
  );
};
