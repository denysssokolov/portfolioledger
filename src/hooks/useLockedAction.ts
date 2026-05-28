import { useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useAccessModeFromProfile } from "@/hooks/usePortfolioData";
import { LOCKED_MESSAGE } from "@/lib/accessMode";

/**
 * Returns helpers that gate a UI action behind the "full access" mode.
 *
 * Usage:
 *   const { isLocked, guard } = useLockedAction();
 *   <Button onClick={guard(() => doDangerousThing())}>Save</Button>
 *
 * In demo mode `guard(fn)` shows a toast and returns without running `fn`.
 */
export function useLockedAction() {
  const { user } = useAuth();
  const mode = useAccessModeFromProfile(user?.id);
  const isLocked = mode === "demo";

  const notifyLocked = useCallback(() => {
    toast.error("Locked feature", { description: LOCKED_MESSAGE });
  }, []);

  const guard = useCallback(
    <T extends (...args: never[]) => unknown>(fn: T) =>
      ((...args: Parameters<T>) => {
        if (isLocked) {
          notifyLocked();
          return undefined;
        }
        return fn(...args);
      }) as T,
    [isLocked, notifyLocked]
  );

  return { isLocked, guard, notifyLocked };
}