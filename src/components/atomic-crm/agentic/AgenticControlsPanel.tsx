import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import { useListSkills } from "@/hooks/useListSkills";
import { useCircuitStates } from "@/hooks/useCircuitStates";

type Config = {
  agentic_kill_switch?: boolean;
  agentic_disabled_skills?: string[];
  agentic_shadow_skills?: string[];
  [k: string]: unknown;
};

export function AgenticControlsPanel() {
  const qc = useQueryClient();
  const { skills } = useListSkills();
  const circuits = useCircuitStates();

  const { data: configRow } = useQuery({
    queryKey: ["configuration"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("configuration")
        .select("config")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // deno-lint-ignore no-explicit-any
  const config: Config = ((configRow as any)?.config ?? {}) as Config;
  const global = Boolean(config.agentic_kill_switch);
  const disabled = config.agentic_disabled_skills ?? [];
  const shadow = config.agentic_shadow_skills ?? [];

  const saveConfig = async (patch: Partial<Config>) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("configuration")
      .update({ config: { ...config, ...patch } })
      .eq("id", 1);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["configuration"] });
  };

  const toggleGlobal = (v: boolean) => saveConfig({ agentic_kill_switch: v });
  const toggleDisabled = (id: string, v: boolean) =>
    saveConfig({
      agentic_disabled_skills: v
        ? [...disabled, id]
        : disabled.filter((x) => x !== id),
    });
  const toggleShadow = (id: string, v: boolean) =>
    saveConfig({
      agentic_shadow_skills: v
        ? [...shadow, id]
        : shadow.filter((x) => x !== id),
    });

  const resetCircuit = async (id: string) => {
    const supabase = getSupabaseClient();
    await supabase
      .from("agentic_circuit_state")
      .update({ state: "closed", consecutive_errors: 0, opened_at: null })
      .eq("skill_id", id);
    circuits.refresh();
  };

  return (
    <div className="space-y-6">
      <div
        className={
          global
            ? "p-4 rounded border-2 border-destructive bg-destructive/10"
            : "p-4 rounded border"
        }
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Global kill switch</h3>
            <p className="text-sm text-muted-foreground">
              Disables all skill executions immediately.
            </p>
          </div>
          <Switch checked={global} onCheckedChange={toggleGlobal} />
        </div>
      </div>

      <div className="border rounded divide-y">
        {skills.map((s) => {
          const isDisabled = disabled.includes(s.id);
          const isShadow = shadow.includes(s.id);
          const circ = circuits.byId[s.id];
          return (
            <div
              key={s.id}
              className="p-3 flex items-center justify-between gap-4"
            >
              <div>
                <div className="font-medium">{s.id}</div>
                <div className="text-xs text-muted-foreground">
                  {s.description}
                </div>
                <div className="mt-1 flex gap-2 items-center">
                  <Badge
                    variant={
                      circ?.state === "open" ? "destructive" : "secondary"
                    }
                  >
                    circuit: {circ?.state ?? "closed"}
                  </Badge>
                  {isShadow && <Badge variant="outline">shadow</Badge>}
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  shadow
                  <Switch
                    checked={isShadow}
                    onCheckedChange={(v) => toggleShadow(s.id, v)}
                  />
                </label>
                <label className="flex items-center gap-2">
                  enabled
                  <Switch
                    checked={!isDisabled}
                    onCheckedChange={(v) => toggleDisabled(s.id, !v)}
                  />
                </label>
                {circ?.state === "open" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => resetCircuit(s.id)}
                  >
                    Reset circuit
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
