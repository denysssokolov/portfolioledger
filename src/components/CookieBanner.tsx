import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const KEY = "cookieConsent";

export function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.localStorage.getItem(KEY)) setShow(true);
  }, []);

  if (!show) return null;

  const accept = (value: "accepted" | "declined") => {
    window.localStorage.setItem(KEY, value);
    setShow(false);
  };

  return (
    <div className="fixed bottom-4 inset-x-4 z-[60] mx-auto max-w-2xl rounded-2xl border border-border bg-card/95 backdrop-blur p-4 shadow-elegant animate-slide-up">
      <div className="text-sm text-foreground font-medium mb-1">Cookies & local storage</div>
      <p className="text-xs text-muted-foreground mb-3">
        We store small amounts of data on your device (such as your sign-in
        session and preferences) so the app works correctly. We don't use
        third-party tracking cookies.
      </p>
      <div className="flex gap-2 justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="rounded-xl text-xs"
          onClick={() => accept("declined")}
        >
          Decline
        </Button>
        <Button
          size="sm"
          className="rounded-xl text-xs"
          onClick={() => accept("accepted")}
        >
          Accept
        </Button>
      </div>
    </div>
  );
}
