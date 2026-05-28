import { useEffect } from "react";
import { installDemoGuard } from "@/lib/accessMode";

/**
 * Used to wrap the app and install the demo write-guard exactly once.
 * Access mode is now decided at registration (see Auth.tsx) and stored on
 * `profiles.access_mode`; there's no launch-time code prompt anymore.
 */
export const AccessGate = ({ children }: { children: React.ReactNode }) => {
  useEffect(() => {
    installDemoGuard();
  }, []);
  return <>{children}</>;
};
