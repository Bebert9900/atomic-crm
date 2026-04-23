# Story B.3 — Skill `morning_brief`

**Epic**: B. Skills v1
**Status**: Ready
**Estimation**: 5h
**Depends on**: A.1..A.5
**Blocks**: —

## Contexte business

Version conversationnelle de MyDayPage. Produit un message texte priorisé : tâches du jour, hot contacts, emails urgents non lus, deals à relancer. Déclenché manuellement via bouton dashboard ou automatiquement à la première ouverture du jour (v1.1).

## Contexte technique

- Skill essentiellement **lecture seule** — aucun write. C'est pourquoi rate_limit=1/jour suffit.
- Utilise Sonnet (moins cher, largement suffisant pour synthèse).
- Output = texte markdown structuré pour affichage direct.

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `supabase/functions/_shared/skills/morningBrief.ts` | Créer |
| `supabase/functions/_shared/skills/index.ts` | Register |
| `src/components/atomic-crm/dashboard/Dashboard.tsx` | Ajouter carte Brief |
| `src/components/atomic-crm/agentic/MorningBriefCard.tsx` | Créer wrapper dédié |

## Manifest

```ts
import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";

const Input = z.object({
  date: z.string().datetime().optional(), // default: now
  focus: z.enum(["all","tasks","deals","emails"]).default("all"),
});
const Output = z.object({
  markdown: z.string(),
  counts: z.object({
    tasks_due_today: z.number(),
    tasks_overdue: z.number(),
    hot_contacts: z.number(),
    unread_emails: z.number(),
    stale_deals: z.number(),
  }),
  top_actions: z.array(z.object({
    action: z.string(),
    reason: z.string(),
    entity_type: z.enum(["task","contact","deal","email"]),
    entity_id: z.number(),
  })).max(5),
});

export const morningBriefSkill: SkillManifest<
  z.infer<typeof Input>, z.infer<typeof Output>
> = {
  id: "morning_brief",
  version: "1.0.0",
  model: "claude-sonnet-4-6",
  description: "Produces a prioritized morning briefing for the authenticated user.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: [
    "search_tasks", "search_deals", "search_contacts",
    "get_recent_activity",
    "list_contact_emails",
  ],
  max_iterations: 6,
  max_writes: 0,
  rate_limit: { per_minute: 2, per_hour: 5 }, // implicitement limité à 1/jour par logique UI
  system_prompt: `You are a CRM assistant that writes a concise morning brief for the user.

Fetch:
- Tasks due today and overdue (search_tasks with filter done=false, overdue separately)
- Recent deal activity (get_recent_activity window 7 days)
- Stale active deals (search_deals where updated_since >14 days ago, stage not won/lost)
- Unread emails count via a targeted search on recent emails

Produce:
1. A short markdown message (max 200 words) with sections: "À faire aujourd'hui", "Deals à relancer", "Messages en attente", "Recommandations".
2. A list of up to 5 top_actions, ordered by priority.
3. Count breakdown.

Style:
- French by default (team preference)
- Direct, factual, no emoji
- Mention specific entities by their name (not "deal 42" — use the actual deal name)
- If the user has nothing urgent, say so explicitly

Return JSON wrapped in a \`\`\`json block.`,
};
```

## Intégration UI

`src/components/atomic-crm/agentic/MorningBriefCard.tsx` :
```tsx
import { useEffect } from "react";
import { useSkillRun } from "@/hooks/useSkillRun";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown"; // add dep if absent

export function MorningBriefCard() {
  const { status, output, run } = useSkillRun();
  useEffect(() => { run("morning_brief", {}); /* auto */ }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> Brief du jour
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={() => run("morning_brief", {})}>
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {status === "running" && <p className="text-sm text-muted-foreground">Préparation…</p>}
        {status === "success" && output && (
          <ReactMarkdown className="prose prose-sm">
            {(output as any).markdown}
          </ReactMarkdown>
        )}
      </CardContent>
    </Card>
  );
}
```

Ajouter dans `Dashboard.tsx` en tête.

## Tests

- User avec 3 tâches due, 2 overdue → brief mentionne correctement les counts
- User sans tâche ni deal chaud → brief court "rien d'urgent"
- User avec 20+ tâches → brief reste court, top 5 extractées correctement
- Deux refreshs consécutifs → rate limit OK (limit per_minute=2)
- Output markdown rendu correctement dans la Card

## Critères d'acceptation

- [ ] Rendu dans le dashboard, auto-play au premier load
- [ ] Contenu jamais vide
- [ ] Coût médian < 0.01 USD (sonnet, short output)
- [ ] Latence P95 < 8s
- [ ] Aucun write effectué (vérif trace : que des tools read)
- [ ] `top_actions[0].entity_id` correspond bien à une entité réelle

## Risques / pièges

- Si aucun tool ne renvoie rien (utilisateur nouveau), l'agent peut halluciner. Durcir prompt : "If all tool results are empty, return markdown='Pas de données à afficher.' and empty arrays."
- Le prompt français vs anglais : fixer dans le system prompt, ne pas laisser l'agent choisir
- `ReactMarkdown` dépendance : ajouter à `package.json` si absente

## Done

- Commit : `feat(agentic): add morning_brief skill + dashboard card`
- Test manuel sur 3 users avec données différentes
