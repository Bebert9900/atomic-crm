import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";

export type CircuitState = {
  skill_id: string;
  state: "closed" | "open" | "half_open";
  opened_at: string | null;
  last_check_at: string;
  consecutive_errors: number;
};

export function useCircuitStates() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["agentic_circuit_state"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("agentic_circuit_state")
        .select("*");
      if (error) throw error;
      return (data ?? []) as CircuitState[];
    },
    refetchInterval: 30_000,
  });
  const byId: Record<string, CircuitState> = {};
  for (const r of data) byId[r.skill_id] = r;
  return {
    byId,
    all: data,
    refresh: () =>
      qc.invalidateQueries({ queryKey: ["agentic_circuit_state"] }),
  };
}
