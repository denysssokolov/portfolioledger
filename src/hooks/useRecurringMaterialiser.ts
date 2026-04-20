import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Returns YYYY-MM-DD for the recurring's day-of-month within a given year/month.
// If the month has fewer days than day_of_month (e.g. day 31 in February),
// clamps to the last day of that month.
function dateForMonth(year: number, monthIdx: number, dom: number): string {
  const lastDay = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  const day = Math.min(dom, lastDay);
  return new Date(Date.UTC(year, monthIdx, day)).toISOString().slice(0, 10);
}

type Recurring = {
  id: string;
  user_id: string;
  type: string;
  asset_class: string;
  amount: number;
  from_account_id: string | null;
  to_account_id: string | null;
  notes: string | null;
  day_of_month: number;
  start_date: string;
  last_run_on: string | null;
  active: boolean;
};

/**
 * Materialises any due occurrences of the user's active recurring transactions
 * into the `transactions` table. Runs once per session per user.
 */
export function useRecurringMaterialiser() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const ranFor = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (ranFor.current === user.id) return;
    ranFor.current = user.id;

    (async () => {
      const { data: recs, error } = await supabase
        .from("recurring_transactions")
        .select("*")
        .eq("active", true);
      if (error) {
        console.error("Load recurring failed:", error);
        return;
      }
      if (!recs || recs.length === 0) return;

      const today = new Date();
      const todayISO = today.toISOString().slice(0, 10);
      const inserts: any[] = [];
      const updates: { id: string; last_run_on: string }[] = [];

      for (const r of recs as Recurring[]) {
        // Iterate each candidate occurrence from (last_run_on || start_date) up to today.
        // Start at the month following last_run_on, or the start_date's month.
        const start = new Date(r.last_run_on ?? r.start_date);
        let y = start.getUTCFullYear();
        let m = start.getUTCMonth();

        // If we've already run for that month, advance to the next month.
        if (r.last_run_on) {
          m += 1;
          if (m > 11) { m = 0; y += 1; }
        }

        let lastGenerated: string | null = null;

        while (true) {
          const occISO = dateForMonth(y, m, r.day_of_month);
          if (occISO > todayISO) break;
          if (occISO >= r.start_date) {
            inserts.push({
              user_id: r.user_id,
              occurred_on: occISO,
              type: r.type,
              asset_class: r.asset_class,
              amount: r.amount,
              from_account_id: r.from_account_id,
              to_account_id: r.to_account_id,
              notes: r.notes ? `${r.notes} (recurring)` : "Recurring",
            });
            lastGenerated = occISO;
          }
          m += 1;
          if (m > 11) { m = 0; y += 1; }
        }

        if (lastGenerated) updates.push({ id: r.id, last_run_on: lastGenerated });
      }

      if (inserts.length === 0) return;

      const { error: insErr } = await supabase.from("transactions").insert(inserts);
      if (insErr) {
        console.error("Recurring insert failed:", insErr);
        return;
      }
      // Update last_run_on per recurring (sequential is fine — usually a handful).
      for (const u of updates) {
        await supabase
          .from("recurring_transactions")
          .update({ last_run_on: u.last_run_on })
          .eq("id", u.id);
      }
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["recurring_transactions"] });
    })();
  }, [user, qc]);
}
