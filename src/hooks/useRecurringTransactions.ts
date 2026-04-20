import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Recurring = {
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
  created_at: string;
  updated_at: string;
};

export function useRecurringTransactions() {
  return useQuery({
    queryKey: ["recurring_transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_transactions")
        .select("*")
        .order("day_of_month", { ascending: true });
      if (error) throw error;
      return data as Recurring[];
    },
  });
}
