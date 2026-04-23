# Story C.3 — Kill-switch global + par skill + UI admin

**Epic**: C. Observability & ops
**Status**: Ready
**Estimation**: 3h
**Depends on**: A.4 (`killSwitch.ts` existe), C.1 (page admin)
**Blocks**: —

## Contexte business

Dernière ligne de défense. Un admin doit pouvoir désactiver tout l'agentique en 1 clic (incident), ou désactiver sélectivement un skill qui déraille. Sans HITL, c'est critique.

## Contexte technique

- `checkKillSwitch` déjà implémenté en A.4 (lit `configuration.agentic_kill_switch` et `agentic_disabled_skills`)
- Cette story ajoute l'UI admin et l'export via dataProvider
- Également : reset circuit breaker (exception à C.2)

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `src/components/atomic-crm/settings/AgenticControlsPanel.tsx` | Créer |
| `src/components/atomic-crm/settings/AgenticPage.tsx` | Intégrer panel |
| `src/components/atomic-crm/providers/supabase/dataProvider.ts` | Méthodes getConfig/setConfig existent déjà |

## Spec UI

Panel placé en tête de `AgenticPage` :

### Section "Global controls"
- Switch "Kill switch global" → lit/écrit `configuration.agentic_kill_switch`
- Si ON → bandeau rouge "AGENTIC DISABLED" sur toute l'app (via context config)

### Section "Per-skill controls"
Pour chaque skill enregistré (liste chargée via `GET /agent-runtime/skills`) :
- Switch "Enabled" → toggle dans `agentic_disabled_skills[]`
- Badge état circuit (closed/half/open)
- Bouton "Reset circuit" si open → update `agentic_circuit_state`
- Bouton "Shadow mode" → toggle dans `agentic_shadow_skills[]`

### Composant

```tsx
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConfigurationContext } from "@/components/atomic-crm/root/ConfigurationContext";
import { useListSkills } from "@/hooks/useListSkills";
import { useCircuitStates } from "@/hooks/useCircuitStates";
import { supabase } from "@/components/atomic-crm/providers/supabase/supabase";

export function AgenticControlsPanel() {
  const { config, refresh } = useConfigurationContext();
  const skills = useListSkills();
  const circuits = useCircuitStates();

  const global = Boolean(config.agentic_kill_switch);
  const disabled: string[] = config.agentic_disabled_skills ?? [];
  const shadow: string[] = config.agentic_shadow_skills ?? [];

  const toggleGlobal = async (v: boolean) => {
    await updateConfig({ agentic_kill_switch: v });
  };
  const toggleDisabled = async (id: string, v: boolean) => {
    const next = v ? [...disabled, id] : disabled.filter(x => x !== id);
    await updateConfig({ agentic_disabled_skills: next });
  };
  const toggleShadow = async (id: string, v: boolean) => {
    const next = v ? [...shadow, id] : shadow.filter(x => x !== id);
    await updateConfig({ agentic_shadow_skills: next });
  };
  const resetCircuit = async (id: string) => {
    await supabase.from("agentic_circuit_state")
      .update({ state: "closed", consecutive_errors: 0, opened_at: null })
      .eq("skill_id", id);
    circuits.refresh();
  };

  const updateConfig = async (patch: Record<string, unknown>) => {
    await supabase.from("configuration")
      .update({ config: { ...config, ...patch } })
      .eq("id", 1);
    refresh();
  };

  return (
    <div className="space-y-6">
      <div className={global
        ? "p-4 rounded border-2 border-destructive bg-destructive/10"
        : "p-4 rounded border"}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Global kill switch</h3>
            <p className="text-sm text-muted-foreground">
              Disables every skill invocation across all users and tenants.
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
            <div key={s.id} className="p-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{s.id}</div>
                <div className="text-xs text-muted-foreground">{s.description}</div>
                <div className="mt-1 flex gap-2 items-center">
                  <Badge variant={circ?.state === "open" ? "destructive" : "secondary"}>
                    circuit: {circ?.state ?? "closed"}
                  </Badge>
                  {isShadow && <Badge variant="outline">shadow</Badge>}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  shadow
                  <Switch checked={isShadow}
                    onCheckedChange={(v) => toggleShadow(s.id, v)} />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  enabled
                  <Switch checked={!isDisabled}
                    onCheckedChange={(v) => toggleDisabled(s.id, !v)} />
                </label>
                {circ?.state === "open" && (
                  <Button size="sm" variant="outline"
                    onClick={() => resetCircuit(s.id)}>
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
```

### Hooks

`useListSkills.ts` :
```ts
import { useQuery } from "@tanstack/react-query";
import { listSkills } from "@/lib/agenticClient";

export function useListSkills() {
  const { data = [] } = useQuery({
    queryKey: ["agentic_skills"],
    queryFn: listSkills,
    staleTime: 60_000,
  });
  return data;
}
```

`useCircuitStates.ts` :
```ts
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/components/atomic-crm/providers/supabase/supabase";

export function useCircuitStates() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["agentic_circuit_state"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agentic_circuit_state").select("*");
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });
  const byId: Record<string, any> = {};
  for (const r of data) byId[r.skill_id] = r;
  return { byId, refresh: () => qc.invalidateQueries({ queryKey: ["agentic_circuit_state"] }) };
}
```

### Intégration shadow mode côté runtime

Dans `executeSkill.ts`, après résolution du manifest :
```ts
const config = await fetchConfig(auth.token);
const shadowList = (config.agentic_shadow_skills ?? []) as string[];
const effectiveDryRun = dry_run || shadowList.includes(manifest.id);
```

## Critères d'acceptation

- [ ] Toggle global → tous les skills renvoient 503 dans les 30s (max cache config)
- [ ] Toggle skill spécifique → seul ce skill renvoie 503
- [ ] Shadow mode ON → runs tournent mais `status='shadow'`, aucune écriture réelle en DB
- [ ] Reset circuit remet le skill en état "closed", runs repartent
- [ ] Seul un admin voit le panel
- [ ] Badge circuit se met à jour auto (30s polling)

## Risques / pièges

- La `configuration` table est un singleton — attention à ne pas écraser d'autres clés en update. Utiliser `update({ config: {...current, ...patch} })`.
- Le runtime pourrait cacher la config 30s pour perf → ok, mais documenter le délai d'effet
- Shadow mode ne bloque pas les tool_use reads, seulement les writes : vérifier que les writes en dryRun retournent des IDs sentinels propres

## Done

- Commit : `feat(agentic): add kill switch UI and shadow mode toggle`
- Test : toggle global, refaire un run, vérifier 503
- Test : toggle shadow sur un skill, relancer, vérifier status='shadow' et aucune écriture réelle
