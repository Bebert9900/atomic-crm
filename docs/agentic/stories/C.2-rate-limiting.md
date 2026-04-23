# Story C.2 — Rate limiting + durcissement

**Epic**: C. Observability & ops
**Status**: Ready
**Estimation**: 3h
**Depends on**: A.4 (rateLimit.ts existe déjà en pré-flight)
**Blocks**: —

## Contexte business

En l'absence de HITL, un bug côté skill peut générer une cascade de runs (boucle, retry, déclenchement trigger…). Rate limits déjà implémentés en A.4 (préflight), mais cette story les **durcit** (global + tenant + ajoute un circuit breaker auto).

## Contexte technique

- Rate limits actuels : per_minute + per_hour par (user, skill)
- Ajouts :
  - Rate limits **globaux par user** (tous skills confondus)
  - Rate limits **par tenant** (multi-tenant SaaS)
  - **Circuit breaker** : si >5 erreurs consécutives sur un skill dans les 10 dernières minutes → désactivation auto pour 1h
  - Logs + event telemetry sur chaque rate-limit hit

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `supabase/functions/_shared/guardrails/rateLimit.ts` | Étendre |
| `supabase/functions/_shared/guardrails/circuitBreaker.ts` | Créer |
| `supabase/schemas/01_tables.sql` | Ajouter table `agentic_circuit_state` |
| `supabase/schemas/05_policies.sql` | RLS sur nouvelle table |
| `supabase/functions/agent-runtime/executeSkill.ts` | Appeler circuit breaker |

## Spec technique

### Nouvelle table `agentic_circuit_state`

```sql
create table public.agentic_circuit_state (
  skill_id text primary key,
  state text not null default 'closed'
    check (state in ('closed','open','half_open')),
  opened_at timestamptz,
  last_check_at timestamptz not null default now(),
  consecutive_errors int not null default 0
);

alter table public.agentic_circuit_state enable row level security;

create policy agentic_circuit_state_select_admin on public.agentic_circuit_state
  for select to authenticated using (
    exists (select 1 from public.sales where user_id = auth.uid() and administrator)
  );
create policy agentic_circuit_state_update_service on public.agentic_circuit_state
  for all to service_role using (true) with check (true);
```

> Exception : cette table est écrite par le runtime (service side) et lue en dashboard par les admins. Pas d'écriture user direct.

### `rateLimit.ts` étendu

Ajouter en plus de `checkRateLimits` par (user, skill) :

```ts
export async function checkGlobalUserLimits(
  userJwt: string, userId: string,
): Promise<{ ok: true } | { ok: false; retryAfter: number; reason: string }> {
  const supa = makeSupabase(userJwt);
  const minAgo = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supa.from("skill_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId).gte("started_at", minAgo);
  if ((count ?? 0) >= 10) {
    return { ok: false, retryAfter: 60, reason: "user_global_per_minute" };
  }
  return { ok: true };
}

export async function checkTenantLimits(
  userJwt: string, tenantId: string | undefined,
): Promise<{ ok: true } | { ok: false; retryAfter: number; reason: string }> {
  if (!tenantId) return { ok: true };
  const supa = makeSupabase(userJwt);
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await supa.from("skill_runs")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId).gte("started_at", hourAgo);
  if ((count ?? 0) >= 500) {
    return { ok: false, retryAfter: 3600, reason: "tenant_per_hour" };
  }
  return { ok: true };
}
```

### `circuitBreaker.ts`

```ts
import { createClient } from "npm:@supabase/supabase-js@2";

const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE);
}

export async function checkCircuit(skillId: string):
  Promise<{ ok: true } | { ok: false; reason: string }> {
  const supa = admin();
  const { data } = await supa.from("agentic_circuit_state")
    .select("*").eq("skill_id", skillId).single();
  if (!data) return { ok: true };
  if (data.state === "open") {
    const since = data.opened_at ? Date.now() - +new Date(data.opened_at) : 0;
    if (since < 3600_000) {
      return { ok: false, reason: "circuit_open" };
    }
    await supa.from("agentic_circuit_state")
      .update({ state: "half_open", last_check_at: new Date().toISOString() })
      .eq("skill_id", skillId);
  }
  return { ok: true };
}

export async function recordOutcome(skillId: string, success: boolean) {
  const supa = admin();
  const { data } = await supa.from("agentic_circuit_state")
    .select("*").eq("skill_id", skillId).single();
  if (!data) {
    await supa.from("agentic_circuit_state").insert({
      skill_id: skillId,
      consecutive_errors: success ? 0 : 1,
      state: "closed",
    });
    return;
  }
  if (success) {
    await supa.from("agentic_circuit_state").update({
      consecutive_errors: 0,
      state: "closed",
      last_check_at: new Date().toISOString(),
    }).eq("skill_id", skillId);
  } else {
    const next = data.consecutive_errors + 1;
    const shouldOpen = next >= 5;
    await supa.from("agentic_circuit_state").update({
      consecutive_errors: next,
      state: shouldOpen ? "open" : data.state,
      opened_at: shouldOpen ? new Date().toISOString() : data.opened_at,
      last_check_at: new Date().toISOString(),
    }).eq("skill_id", skillId);
  }
}
```

### Intégration dans `executeSkill.ts`

Après `checkKillSwitch`, avant `checkRateLimits` :

```ts
const circuit = await checkCircuit(manifest.id);
if (!circuit.ok) {
  return Response.json({ error: "circuit_open", reason: circuit.reason },
    { status: 503 });
}
// ... existing checks ...
const globalRl = await checkGlobalUserLimits(auth.token, auth.userId);
if (!globalRl.ok) return Response.json({ error: "rate_limit", ...globalRl }, { status: 429 });
const tenantRl = await checkTenantLimits(auth.token, auth.tenantId);
if (!tenantRl.ok) return Response.json({ error: "rate_limit", ...tenantRl }, { status: 429 });
```

Dans le finally du bloc IIFE :
```ts
await recordOutcome(manifest.id, finalStatus === "success");
```

## Critères d'acceptation

- [ ] Dépasser 5 runs/min sur un user → 429
- [ ] Dépasser 10 runs/min sur un user tous skills confondus → 429
- [ ] Dépasser 500 runs/h sur un tenant → 429
- [ ] 5 erreurs consécutives sur un skill → circuit ouvert, tous futurs runs 503
- [ ] Après 1h : circuit passe half_open au prochain run, 1 succès → closed
- [ ] Dashboard C.1 affiche l'état circuit par skill

## Risques / pièges

- Concurrence sur `recordOutcome` : pas critique vu qu'on ne cherche pas la précision, juste un signal
- Un admin peut-il reset manuellement ? Ajouter bouton "Reset circuit" dans le dashboard C.1 (update ligne)
- Ne pas bloquer les dry_runs par le circuit breaker ? Décision : oui, on bloque aussi, pour éviter de masquer un problème réel

## Done

- Commit : `feat(agentic): add circuit breaker and global/tenant rate limits`
- Test manuel : forcer 5 erreurs, vérifier 503, vérifier reset 1h
