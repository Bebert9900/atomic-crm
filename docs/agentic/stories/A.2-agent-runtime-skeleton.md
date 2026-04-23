# Story A.2 — Squelette `agent-runtime` edge function

**Epic**: A. Foundation
**Status**: Ready
**Estimation**: 4h
**Depends on**: A.1
**Blocks**: B.1 à B.5

## Contexte business

Point d'entrée unique pour tous les skills. Cette story crée l'edge function sans logique LLM (vient en A.4) : auth, routing, persistence de runs, SSE streaming, validation d'inputs. À la fin de la story, on peut déclencher un "hello world skill" qui insère juste une ligne dans `skill_runs`.

## Contexte technique

- Stack edge function Deno (cf. `supabase/functions/mcp/index.ts` comme référence pour auth JWKS + CORS + SSE)
- Pattern auth identique à MCP : `jose` + JWKS Supabase
- SSE côté Deno via `ReadableStream` + `TransformStream`
- Pas de framework web ; `Deno.serve` natif

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `supabase/functions/agent-runtime/index.ts` | Créer |
| `supabase/functions/agent-runtime/auth.ts` | Créer (extraire pattern JWKS) |
| `supabase/functions/agent-runtime/sse.ts` | Créer (helper SSE) |
| `supabase/functions/agent-runtime/router.ts` | Créer |
| `supabase/functions/agent-runtime/runPersistence.ts` | Créer (CRUD `skill_runs`) |
| `supabase/functions/_shared/skills/types.ts` | Créer (types manifests) |
| `supabase/functions/_shared/skills/index.ts` | Créer (registry map, vide pour l'instant) |
| `supabase/functions/_shared/skills/helloWorld.ts` | Créer (skill de test) |
| `supabase/functions/_shared/cors.ts` | Existe, réutiliser |

## Spec technique

### Structure

```
supabase/functions/agent-runtime/
├── index.ts             # Deno.serve + dispatch
├── auth.ts              # validateToken, JWKS
├── router.ts            # dispatch par path
├── sse.ts               # helpers SSE
├── runPersistence.ts    # insert/update skill_runs
└── executeSkill.ts      # placeholder (fera appel Claude en A.4)
```

### `index.ts`

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { dispatch } from "./router.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  try {
    const response = await dispatch(req);
    // merge CORS headers
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (err) {
    console.error("agent-runtime fatal", err);
    return new Response(
      JSON.stringify({ error: "internal_error", message: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
```

### `auth.ts`

```ts
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_JWT_ISSUER =
  Deno.env.get("SB_JWT_ISSUER") ?? `${SUPABASE_URL}/auth/v1`;
const JWKS = createRemoteJWKSet(
  new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
);

export type AuthInfo = {
  token: string;
  userId: string;
  tenantId?: string;
  role?: string;
};

export async function validateToken(req: Request): Promise<AuthInfo | null> {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [bearer, token] = header.split(" ");
  if (bearer !== "Bearer" || !token) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: SUPABASE_JWT_ISSUER,
    });
    if (!payload.sub) return null;
    return {
      token,
      userId: payload.sub,
      tenantId: payload.tenant_id as string | undefined,
      role: payload.role as string | undefined,
    };
  } catch {
    return null;
  }
}
```

### `router.ts`

```ts
import { validateToken } from "./auth.ts";
import { handleRun } from "./executeSkill.ts";
import { handleListSkills } from "./skills.ts";

export async function dispatch(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path.endsWith("/health") && req.method === "GET") {
    return Response.json({ ok: true, ts: new Date().toISOString() });
  }

  const auth = await validateToken(req);
  if (!auth) return new Response("Unauthorized", { status: 401 });

  if (path.endsWith("/skills") && req.method === "GET") {
    return handleListSkills(auth);
  }
  if (path.endsWith("/run") && req.method === "POST") {
    return handleRun(req, auth);
  }
  // undo, rerun → stories C.x et tests ; 501 ici
  return new Response("Not Found", { status: 404 });
}
```

### `sse.ts`

```ts
export type SSEEvent = { event?: string; data: unknown; id?: string };

export function createSSEStream(): {
  stream: ReadableStream<Uint8Array>;
  send: (e: SSEEvent) => void;
  close: () => void;
} {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) { controller = c; },
  });
  const send = (e: SSEEvent) => {
    const parts: string[] = [];
    if (e.id) parts.push(`id: ${e.id}`);
    if (e.event) parts.push(`event: ${e.event}`);
    parts.push(`data: ${JSON.stringify(e.data)}`);
    parts.push("", "");
    controller.enqueue(encoder.encode(parts.join("\n")));
  };
  const close = () => { try { controller.close(); } catch {} };
  return { stream, send, close };
}

export function sseResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
```

### `runPersistence.ts`

```ts
import { createClient } from "npm:@supabase/supabase-js@2";

export function makeSupabaseForUser(userJwt: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${userJwt}` } } },
  );
}

export async function createRun(userJwt: string, row: {
  skill_id: string;
  skill_version: string;
  input: unknown;
  dry_run: boolean;
  model?: string;
  tenant_id?: string;
}): Promise<number> {
  const supabase = makeSupabaseForUser(userJwt);
  const { data, error } = await supabase
    .from("skill_runs")
    .insert({ ...row, status: row.dry_run ? "shadow" : "running" })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

export async function appendTraceStep(
  userJwt: string, runId: number, step: unknown,
) {
  const supabase = makeSupabaseForUser(userJwt);
  await supabase.rpc("append_skill_run_trace", { p_run_id: runId, p_step: step });
  // alt: patch via ||  jsonb_array  — see note below
}

export async function finalizeRun(userJwt: string, runId: number, patch: {
  status: "success" | "error" | "cancelled";
  output?: unknown;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
  cost_usd?: number;
  error_code?: string;
  error_message?: string;
}) {
  const supabase = makeSupabaseForUser(userJwt);
  const { error } = await supabase
    .from("skill_runs")
    .update({ ...patch, ended_at: new Date().toISOString() })
    .eq("id", runId);
  if (error) throw error;
}
```

> Note : pour `appendTraceStep`, on peut soit utiliser une function SQL `append_skill_run_trace` (plus robuste vs concurrence) soit un simple `update` qui fetche-merge-patch. Préférer la function SQL et la créer dans `02_functions.sql` (exemple fourni plus bas).

### SQL function à ajouter (`02_functions.sql`)

```sql
create or replace function public.append_skill_run_trace(
  p_run_id bigint,
  p_step jsonb
) returns void
language sql
security invoker
as $$
  update public.skill_runs
  set trace = trace || jsonb_build_array(p_step)
  where id = p_run_id and user_id = auth.uid();
$$;
```

### `executeSkill.ts` (squelette, LLM en A.4)

```ts
import type { AuthInfo } from "./auth.ts";
import { skills } from "../_shared/skills/index.ts";
import { createRun, finalizeRun, appendTraceStep } from "./runPersistence.ts";
import { createSSEStream, sseResponse } from "./sse.ts";

export async function handleRun(req: Request, auth: AuthInfo): Promise<Response> {
  const body = await req.json();
  const { skill_id, input, dry_run = false } = body;

  const manifest = skills[skill_id];
  if (!manifest) {
    return Response.json(
      { error: "unknown_skill", skill_id }, { status: 404 },
    );
  }

  const parsed = manifest.input_schema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const runId = await createRun(auth.token, {
    skill_id: manifest.id,
    skill_version: manifest.version,
    input: parsed.data,
    dry_run,
    model: manifest.model,
    tenant_id: auth.tenantId,
  });

  const { stream, send, close } = createSSEStream();

  (async () => {
    try {
      send({ event: "run.started", data: { run_id: runId } });
      // A.4 branchera Claude ici. Pour A.2 on exécute juste le skill helloWorld.
      const output = await manifest.execute!({
        input: parsed.data,
        auth,
        runId,
        dryRun: dry_run,
        appendStep: (step) => appendTraceStep(auth.token, runId, step),
        emit: send,
      });
      await finalizeRun(auth.token, runId, { status: "success", output });
      send({ event: "run.done", data: { run_id: runId, output } });
    } catch (err) {
      await finalizeRun(auth.token, runId, {
        status: "error",
        error_code: "runtime_error",
        error_message: String(err),
      });
      send({ event: "run.error", data: { run_id: runId, error: String(err) } });
    } finally {
      close();
    }
  })();

  return sseResponse(stream);
}
```

### `_shared/skills/types.ts`

```ts
import { z } from "npm:zod@^3.25";
import type { AuthInfo } from "../../agent-runtime/auth.ts";

export type SkillExecCtx<I> = {
  input: I;
  auth: AuthInfo;
  runId: number;
  dryRun: boolean;
  appendStep: (step: unknown) => Promise<void>;
  emit: (e: { event?: string; data: unknown }) => void;
};

export type SkillManifest<I = any, O = any> = {
  id: string;
  version: string;
  model: string;
  description: string;
  input_schema: z.ZodType<I>;
  output_schema: z.ZodType<O>;
  tools_allowed: string[];
  max_iterations: number;
  max_writes: number;
  rate_limit: { per_minute: number; per_hour: number };
  system_prompt: string;
  // rempli en A.4 par le runtime Claude ; en A.2 on permet un execute custom pour helloWorld
  execute?: (ctx: SkillExecCtx<I>) => Promise<O>;
};
```

### `_shared/skills/helloWorld.ts`

```ts
import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";

export const helloWorldSkill: SkillManifest<{ name: string }, { message: string }> = {
  id: "hello_world",
  version: "1.0.0",
  model: "none",
  description: "Test skill, no LLM. Returns a greeting.",
  input_schema: z.object({ name: z.string().min(1).max(100) }),
  output_schema: z.object({ message: z.string() }),
  tools_allowed: [],
  max_iterations: 0,
  max_writes: 0,
  rate_limit: { per_minute: 10, per_hour: 100 },
  system_prompt: "",
  execute: async ({ input, appendStep, emit }) => {
    await appendStep({ step: 0, type: "user", content: JSON.stringify(input), ts: new Date().toISOString() });
    emit({ event: "thinking", data: "saying hi" });
    const message = `Hello ${input.name}`;
    await appendStep({ step: 1, type: "assistant_text", content: message, ts: new Date().toISOString() });
    return { message };
  },
};
```

### `_shared/skills/index.ts`

```ts
import type { SkillManifest } from "./types.ts";
import { helloWorldSkill } from "./helloWorld.ts";

export const skills: Record<string, SkillManifest> = {
  [helloWorldSkill.id]: helloWorldSkill,
};
```

### `skills.ts` (dans agent-runtime)

```ts
import type { AuthInfo } from "./auth.ts";
import { skills } from "../_shared/skills/index.ts";

export async function handleListSkills(_auth: AuthInfo): Promise<Response> {
  const list = Object.values(skills).map((s) => ({
    id: s.id,
    version: s.version,
    description: s.description,
    input_schema: s.input_schema,
  }));
  return Response.json({ skills: list });
}
```

## Critères d'acceptation

- [ ] `curl -X GET http://127.0.0.1:54321/functions/v1/agent-runtime/health` → 200 JSON `{ok:true,...}`
- [ ] `curl -X GET …/agent-runtime/skills` avec Bearer valide → liste incluant `hello_world`
- [ ] `curl -X GET …/agent-runtime/skills` sans Bearer → 401
- [ ] `POST …/agent-runtime/run` body `{skill_id:"hello_world",input:{name:"Alice"}}` → stream SSE avec events `run.started`, `thinking`, `run.done`
- [ ] Input invalide (`name: ""`) → 400 avec `issues`
- [ ] Skill inconnu → 404 avec `error:"unknown_skill"`
- [ ] Après run : ligne dans `skill_runs` avec `status='success'`, `trace` contient 2 steps, `ended_at` rempli
- [ ] Test RLS : user A lance un run, user B ne peut pas voir sa ligne
- [ ] `make typecheck` et `make lint` passent

## Tests

### E2E manuel
```bash
TOKEN=$(supabase auth sign-in --email dev@localhost --password ... | jq -r .access_token)
curl -N -X POST http://127.0.0.1:54321/functions/v1/agent-runtime/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"skill_id":"hello_world","input":{"name":"Alice"}}'
```

### Unit
- `auth.test.ts` : token valide/invalide/expiré
- `sse.test.ts` : format SSE respecté

## Risques / pièges

- Les edge functions Deno ne conservent pas d'état entre requests → OK pour notre design stateless
- Attention au `ReadableStream` qui peut rester ouvert côté client si `close()` oublié dans le finally
- `append_skill_run_trace` via `auth.uid()` → le `SET LOCAL` du JWT n'est pas nécessaire ici car on passe le JWT au client supabase, qui fait le SET automatiquement via PostgREST

## Done

- Commit : `feat(agentic): add agent-runtime edge function skeleton + hello_world skill`
- Health check documenté dans `docs/agentic/`
- SSE testé à la main via curl
