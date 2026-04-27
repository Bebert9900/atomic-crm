import { useQuery } from "@tanstack/react-query";

import { getSupabaseClient } from "../providers/supabase/supabase";
import type { StripeTreasury } from "../types";

export const useStripeTreasury = (enabled = true) =>
  useQuery<StripeTreasury>({
    queryKey: ["stripe_treasury"],
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().functions.invoke(
        "get_stripe_treasury",
        { body: {} },
      );
      if (error) throw error;
      return data as StripeTreasury;
    },
  });
