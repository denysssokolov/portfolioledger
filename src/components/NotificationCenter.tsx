import { useEffect, useState } from "react";
import { Bell, Inbox, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  clearNotifications,
  getActiveToastCount,
  getNotifications,
  subscribeActiveToasts,
  subscribeNotifications,
  dismissAllToasts,
  type NotifEntry,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

const fmtAgo = (ts: number) => {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

export function NotificationCenter() {
  const [items, setItems] = useState<NotifEntry[]>(() => getNotifications());
  const [open, setOpen] = useState(false);

  useEffect(() => subscribeNotifications(() => setItems(getNotifications())), []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Notifications"
          title="Notifications"
          className="fixed top-20 right-[68px] z-50 h-11 w-11 rounded-full border border-border shadow-card backdrop-blur bg-card/80 text-muted-foreground hover:text-foreground"
        >
          <Bell className="h-5 w-5" />
          {items.length > 0 && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary" />
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[360px] sm:w-[420px] flex flex-col p-0">
        <SheetHeader className="px-5 py-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4" /> Notifications
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center text-sm text-muted-foreground py-12">
              <Inbox className="h-8 w-8 mb-2 opacity-50" />
              No notifications yet.
            </div>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                className={cn(
                  "rounded-xl border border-border bg-card px-3 py-2.5",
                  n.kind === "error" && "border-destructive/30",
                  n.kind === "success" && "border-emerald-500/30",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium leading-tight">{n.title}</div>
                  <div className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5">
                    {fmtAgo(n.ts)}
                  </div>
                </div>
                {n.description && (
                  <div className="text-xs text-muted-foreground mt-1">{n.description}</div>
                )}
              </div>
            ))
          )}
        </div>
        {items.length > 0 && (
          <div className="border-t border-border p-3">
            <Button
              variant="outline"
              className="w-full h-10 rounded-xl"
              onClick={() => {
                clearNotifications();
                setItems([]);
              }}
            >
              <X className="h-4 w-4 mr-2" /> Clear all
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Floating "Clear all" pill that appears above the bottom-most toast when ≥ 2
 * toasts are currently visible.
 */
export function ClearAllToasts() {
  const [count, setCount] = useState(getActiveToastCount());
  useEffect(() => subscribeActiveToasts(() => setCount(getActiveToastCount())), []);
  if (count < 2) return null;
  return (
    <button
      onClick={dismissAllToasts}
      className="fixed bottom-[300px] right-5 z-[100] h-9 px-3 rounded-full border border-border bg-card text-foreground text-xs font-medium shadow-lg hover:bg-muted transition-colors"
    >
      <X className="h-3.5 w-3.5 inline mr-1" /> Clear all notifications
    </button>
  );
}