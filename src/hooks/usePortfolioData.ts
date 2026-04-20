import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Account, Transaction, Snapshot, RealisedPnL } from "@/lib/calc";

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("archived", false)
        .order("created_at");
      if (error) throw error;
      return data as Account[];
    },
  });
}

export function useTransactions() {
  return useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Transaction[];
    },
  });
}

export function useSnapshots() {
  return useQuery({
    queryKey: ["snapshots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("snapshots")
        .select("*")
        .order("month", { ascending: true });
      if (error) throw error;
      return data as Snapshot[];
    },
  });
}

export function useRealisedPnL() {
  return useQuery({
    queryKey: ["realised_pnl"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("realised_pnl")
        .select("*")
        .order("occurred_on", { ascending: false });
      if (error) throw error;
      return data as RealisedPnL[];
    },
  });
}

export function useProfile(userId?: string) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase.from("profiles").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
