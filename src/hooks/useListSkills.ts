import { useQuery } from "@tanstack/react-query";
import { listSkills } from "@/lib/agenticClient";

export function useListSkills() {
  const { data = [], ...rest } = useQuery({
    queryKey: ["agentic_skills"],
    queryFn: listSkills,
    staleTime: 60_000,
  });
  return { skills: data, ...rest };
}
