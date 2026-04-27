---
name: Agentic CRM — known code quality issues
description: Liste honnête des smells identifiés en review du code agentique, par priorité, pour reprise future.
type: project
originSessionId: f2852700-d871-4a21-8b78-0046a73b7ba3
---
Review honnête donnée à l'utilisateur après implémentation complète. Note globale donnée : 6.5/10 — architecture solide, pas prod-ready.

## Priorité haute (à fix avant prod)

1. **Race condition sur trace.** `append_skill_run_trace` fait `trace = trace || jsonb_build_array(p_step)`. Si Claude appelle 3 tools en parallèle dans un même tour, les 3 updates se marchent dessus. **Fix** : passer à une table normalisée `skill_run_steps(run_id, seq, ...)` avec seq auto-incrémenté, ou lock la ligne avec SELECT FOR UPDATE.

2. **Pas de retry ni timeout sur les LLM API calls.** Si l'API renvoie 429 ou met 60s, le SSE hang. **Fix** : wrap `createCompletion` de chaque provider avec `p-retry` + `AbortSignal.timeout(60_000)`.

3. **Pas de tests unitaires.** Zéro. Pour un agent no-HITL c'est pas optionnel. **Fix** : `deno test` sur chaque tool write + son undo + chaque guardrail.

## Priorité moyenne (refacto)

4. **Violation layering shared → app.** `_shared/skills/types.ts` et `_shared/llm/toolLoop.ts` importent `AuthInfo` depuis `../../agent-runtime/auth.ts`. Devrait être dans `_shared/auth/`.

5. **`executeSkill.ts` fait 170+ lignes de preflight inline.** 7 guardrails chaînés. **Fix** : extraire `preflight(auth, manifest) → ok | Response`.

6. **`SkillManifest<any, any>` dans le registry.** Perte de validation cohérence input/output au site d'appel.

7. **Double source de vérité migrations.** Schémas `supabase/schemas/` + migrations manuellement écrites. Pas géré par `supabase db diff`. Standard du repo selon AGENTS.md mais pas documenté dans mes commits.

## Priorité basse (polish)

8. **`deno-lint-ignore no-explicit-any` sprinkled partout.** Pragmatique mais à nettoyer.

9. **`as unknown as MetricsRowExt` dans AgenticPage.tsx** — double cast smell.

10. **Code mort dans `tools/registry.ts` :** `zodToJsonSchemaNaive` inutilisé depuis que toolLoop.ts utilise le vrai `zod-to-json-schema` npm.

11. **Pas de pagination dans `SkillRunsTable`** — hardcoded `limit(50)`.

12. **Français/anglais mélangés** dans les system prompts (morning_brief en FR, le reste en EN).

## Risques possibles au premier run

- `zod-to-json-schema` peut produire du JSON Schema que Claude/DeepSeek mal interprètent — à vérifier au 1er run, fix = retirer `.refine()` des tools.
- SDK `@anthropic-ai/sdk` en Deno via npm : généralement OK, parfois nécessite polyfill. Si crash → fallback fetch manuel.
- DeepSeek `prompt_cache_hit_tokens` : le nom du champ peut changer côté API, à vérifier.

**Why:** l'utilisateur est entrepreneur pragmatique, préfère qu'on lui dise la vérité du code plutôt que vendre notre taf. A explicitement demandé "c'est bien organisé ?" en test honnêteté.

**How to apply:** quand on reprend le projet, si l'utilisateur veut aller en prod, référer ces points. Les priorités hautes (1-3) sont non-négociables ; les moyennes à faire pendant le shadow mode ; les basses au fur et à mesure.
