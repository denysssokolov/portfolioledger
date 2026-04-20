import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const ScreenHeader = ({
  title,
  subtitle,
  right,
  className,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  className?: string;
}) => (
  <header
    className={cn(
      "px-5 pt-8 pb-4 flex items-end justify-between gap-3",
      className
    )}
  >
    <div className="min-w-0">
      <h1 className="font-display text-3xl font-bold tracking-tight truncate">
        {title}
      </h1>
      {subtitle && (
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      )}
    </div>
    {right && <div className="shrink-0">{right}</div>}
  </header>
);
