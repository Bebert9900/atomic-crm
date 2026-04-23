# Agentic — Rollout & next steps

Cet outil a été implémenté sur la branche `feat/agentic-foundation`.

## État

| Story | Statut | Commit (short) |
|-------|--------|----------------|
| A.1 skill_runs foundation | ✅ | 49c1dbb |
| A.2 agent-runtime skeleton | ✅ | 7417130 |
| A.3 tool registry (25+ tools) | ✅ | e30e9cd |
| A.4 Claude tool_use loop + guardrails | ✅ | 2d7a2a2 |
| A.5 frontend SkillLauncher + SSE | ✅ | cf98aa9 |
| B.1 process_call_recording | ✅ | 43027ee |
| B.2 handle_incoming_email | ✅ | 43027ee |
| B.3 morning_brief | ✅ | 43027ee |
| B.4 next_best_action_on_deal | ✅ | 43027ee |
| B.5 qualify_inbound_contact | ✅ | 43027ee |
| C.1 ops dashboard | ✅ | 601b997 |
| C.2 rate limiting + circuit breaker | ✅ | 601b997 |
| C.3 kill switch UI | ✅ | 601b997 |
| D.1 tenant_settings | ✅ | 601b997 |
| D.2 tenant activation UI | ✅ | 601b997 |
| D.3 usage metering | ✅ | 601b997 |

## Pour tester

### 1. Installer et démarrer Supabase local

```bash
cd /home/marieangelette/atomic-crm-agentic
npm install
npx supabase start
npx supabase migration up --local
```

### 2. Configurer la clé API Anthropic

```bash
# Au moins une des deux clés (selon les skills que tu veux tester) :
echo 'ANTHROPIC_API_KEY=sk-ant-...' >> supabase/functions/.env
echo 'DEEPSEEK_API_KEY=sk-...'      >> supabase/functions/.env
# Optionnel, override base URL DeepSeek si proxy interne :
# echo 'DEEPSEEK_BASE_URL=https://api.deepseek.com' >> supabase/functions/.env
```

### Fournisseurs LLM supportés

Le runtime route automatiquement selon le préfixe `model` du manifest :

| Préfixe | Provider | Env var | Modèles testés |
|---------|----------|---------|----------------|
| `claude-*` | Anthropic | `ANTHROPIC_API_KEY` | `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001` |
| `deepseek-*` | DeepSeek | `DEEPSEEK_API_KEY` | `deepseek-chat` (V3), `deepseek-reasoner` (R1) |

Ajouter un provider : créer un fichier dans `supabase/functions/_shared/llm/` qui implémente `LLMProvider` (cf. `types.ts`), l'enregistrer dans `llm/registry.ts`.

**Skill comparison** : `morning_brief` (Claude Sonnet) et `morning_brief_ds` (DeepSeek V3) ont le même contrat. Lance les deux en parallèle pour comparer coût/latence/qualité dans le dashboard.

### 3. Servir l'edge function

```bash
npx supabase functions serve agent-runtime --env-file supabase/functions/.env
```

### 4. Tester hello_world (sans Claude)

```bash
TOKEN=$(curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \
  -H "apikey: <anon_key>" -H "Content-Type: application/json" \
  -d '{"email":"...","password":"..."}' | jq -r .access_token)

curl -N -X POST http://127.0.0.1:54321/functions/v1/agent-runtime/run \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"skill_id":"hello_world","input":{"name":"Alice"}}'
```

### 5. Tester un vrai skill (Claude)

```bash
curl -N -X POST http://127.0.0.1:54321/functions/v1/agent-runtime/run \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"skill_id":"morning_brief","input":{}}'
```

### 6. Démarrer le frontend et voir le dashboard

```bash
npm run dev
# → http://localhost:5173
# Router à brancher pour /settings/agentic (voir "À brancher" ci-dessous)
```

## À brancher côté App (pas fait dans l'implémentation auto)

Ces pages existent mais ne sont pas encore accessibles via la nav car l'ajout d'une route dépend du style du router utilisé dans `src/App.tsx`. Trois ajouts à faire à la main :

1. **Route `/settings/agentic`** → `AgenticPage.tsx`
2. **Route `/settings/agentic/tenants`** → `TenantSettingsPage.tsx`
3. **Route `/settings/agentic/usage`** → `TenantUsagePage.tsx`
4. **Entrée nav dans SettingsPage** (visible si `sales.administrator`)

Exemple si tu utilises le pattern shadcn-admin-kit `<Resource>` / `<CustomRoutes>` :

```tsx
import AgenticPage from "./settings/AgenticPage";
import TenantSettingsPage from "./settings/TenantSettingsPage";
import TenantUsagePage from "./settings/TenantUsagePage";

<CustomRoutes>
  <Route path="/settings/agentic" element={<AgenticPage />} />
  <Route path="/settings/agentic/tenants" element={<TenantSettingsPage />} />
  <Route path="/settings/agentic/usage" element={<TenantUsagePage />} />
</CustomRoutes>
```

## Points d'intégration UI (exemples)

Placer des `<SkillLauncher>` dans :
- `src/components/atomic-crm/recordings/ContactRecordingsList.tsx` → skill `process_call_recording`
- `src/components/atomic-crm/dashboard/UnreadEmailsList.tsx` → skill `handle_incoming_email`
- `src/components/atomic-crm/dashboard/Dashboard.tsx` (tête) → skill `morning_brief`
- `src/components/atomic-crm/deals/DealShow.tsx` → skill `next_best_action_on_deal`
- `src/components/atomic-crm/contacts/ContactShow.tsx` (si lead_source != manual) → `qualify_inbound_contact`

## Sécurité — Cheklist avant prod

- [ ] `ANTHROPIC_API_KEY` configurée via secret Supabase, pas commitée
- [ ] Shadow mode activé par défaut sur les 5 skills (toggle via AgenticControlsPanel)
- [ ] Test RLS multi-user sur `skill_runs` (A ne voit pas B)
- [ ] Test rate limits (429 au 11e run/min user global)
- [ ] Test circuit breaker (5 erreurs forcées → 503 sur 1h)
- [ ] Test kill switch global
- [ ] Vérifier que `supabase/functions/.env` est bien dans `.gitignore`
- [ ] Prompt caching effectivement actif (cache_read_tokens > 0 sur 2e run)

## Limites connues / v1.1

- Les tools créés n'ont pas de tests unitaires Deno (à ajouter)
- `tenant_id` n'est pas encore injecté depuis `sales` → `auth.users` (modèle multi-tenant complet à poser en v1.1)
- Pas de sharding des usages multi-tenant dans la facturation Stripe auto
- Pas d'eval set automatisé — à construire quand le volume de traces le permettra
- `zod-to-json-schema` : vérifier que les `z.refine()` ne cassent pas la conversion ; fallback possible en retirant les refines pour Claude
