# Story A.5 — Frontend SkillLauncher + SSE client + trace panel

**Epic**: A. Foundation
**Status**: Ready
**Estimation**: 6h
**Depends on**: A.2 (pour health/skills/run endpoints)
**Blocks**: B.1 à B.5 (pour invoquer depuis l'UI)

## Contexte business

Interface utilisateur pour déclencher des skills et observer leur exécution. Composants réutilisables placés dans chaque fiche (deal, contact, etc.).

## Contexte technique

- React 19 + shadcn-admin-kit
- SSE côté client via `fetch` + `ReadableStream.getReader()` (EventSource n'accepte pas les headers custom)
- Auth : récupération JWT via `supabase.auth.getSession()` disponible dans `supabase.ts`
- `ra-core` pour refresh des ressources après run (invalidate queries)

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `src/lib/agenticClient.ts` | Créer (fetch SSE helper) |
| `src/hooks/useSkillRun.ts` | Créer |
| `src/components/atomic-crm/agentic/SkillLauncher.tsx` | Créer |
| `src/components/atomic-crm/agentic/SkillRunPanel.tsx` | Créer |
| `src/components/atomic-crm/agentic/SkillRunTrace.tsx` | Créer |
| `src/components/atomic-crm/agentic/index.ts` | Créer (exports) |
| `src/components/atomic-crm/types.ts` | Déjà mis à jour en A.1 |

## Spec technique

### `src/lib/agenticClient.ts`

```ts
import { supabase } from "@/components/atomic-crm/providers/supabase/supabase";

export type SkillRunEvent =
  | { event: "run.started"; data: { run_id: number } }
  | { event: "text"; data: { content: string } }
  | { event: "tool_use"; data: { name: string; args: unknown } }
  | { event: "tool_result"; data: { name: string; result: unknown } }
  | { event: "thinking"; data: string }
  | { event: "run.done"; data: { run_id: number; output: unknown } }
  | { event: "run.error"; data: { run_id: number; error: string } };

export async function* streamSkillRun(
  skill_id: string,
  input: unknown,
  opts: { dry_run?: boolean; signal?: AbortSignal } = {},
): AsyncGenerator<SkillRunEvent> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("not_authenticated");

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-runtime/run`;
  const res = await fetch(url, {
    method: "POST",
    signal: opts.signal,
    headers: {
      "Authorization": `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ skill_id, input, dry_run: opts.dry_run }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`skill_run_failed: ${res.status} ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const raw of parts) {
      const ev = parseSSE(raw);
      if (ev) yield ev as SkillRunEvent;
    }
  }
}

function parseSSE(block: string): unknown {
  let event: string | undefined;
  let data = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7);
    else if (line.startsWith("data: ")) data += line.slice(6);
  }
  if (!data) return null;
  try { return { event, data: JSON.parse(data) }; } catch { return null; }
}

export async function listSkills(): Promise<
  Array<{ id: string; version: string; description: string }>
> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-runtime/skills`,
    { headers: { "Authorization": `Bearer ${session!.access_token}` } },
  );
  const json = await res.json();
  return json.skills ?? [];
}
```

### `src/hooks/useSkillRun.ts`

```ts
import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { streamSkillRun, type SkillRunEvent } from "@/lib/agenticClient";

export type SkillRunState = {
  status: "idle" | "running" | "success" | "error";
  runId?: number;
  events: SkillRunEvent[];
  output?: unknown;
  error?: string;
};

export function useSkillRun(options?: {
  invalidateOnDone?: string[]; // resources to invalidate via react-query
}) {
  const [state, setState] = useState<SkillRunState>({ status: "idle", events: [] });
  const abortRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  const run = useCallback(async (skill_id: string, input: unknown, opts?: { dry_run?: boolean }) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setState({ status: "running", events: [] });
    try {
      for await (const ev of streamSkillRun(skill_id, input, { ...opts, signal: ac.signal })) {
        setState((s) => ({ ...s, events: [...s.events, ev] }));
        if (ev.event === "run.started") setState((s) => ({ ...s, runId: ev.data.run_id }));
        if (ev.event === "run.done") {
          setState((s) => ({ ...s, status: "success", output: ev.data.output }));
          if (options?.invalidateOnDone) {
            for (const r of options.invalidateOnDone) {
              queryClient.invalidateQueries({ queryKey: [r] });
            }
          }
        }
        if (ev.event === "run.error") setState((s) => ({ ...s, status: "error", error: ev.data.error }));
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setState((s) => ({ ...s, status: "error", error: String(e) }));
    }
  }, [options, queryClient]);

  const abort = useCallback(() => abortRef.current?.abort(), []);

  return { ...state, run, abort };
}
```

### `src/components/atomic-crm/agentic/SkillLauncher.tsx`

```tsx
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { useSkillRun } from "@/hooks/useSkillRun";
import { SkillRunPanel } from "./SkillRunPanel";

type Props = {
  skill_id: string;
  input: Record<string, unknown>;
  label?: string;
  invalidateOnDone?: string[];
  variant?: "default" | "outline" | "ghost";
};

export function SkillLauncher({
  skill_id, input, label, invalidateOnDone, variant = "default",
}: Props) {
  const { status, events, output, error, run, abort, runId } =
    useSkillRun({ invalidateOnDone });

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button
          variant={variant}
          disabled={status === "running"}
          onClick={() => run(skill_id, input)}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          {label ?? skill_id}
        </Button>
        {status === "running" && (
          <Button variant="ghost" onClick={abort}>Cancel</Button>
        )}
      </div>
      {(status !== "idle") && (
        <SkillRunPanel
          runId={runId}
          status={status}
          events={events}
          output={output}
          error={error}
        />
      )}
    </div>
  );
}
```

### `src/components/atomic-crm/agentic/SkillRunPanel.tsx`

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SkillRunTrace } from "./SkillRunTrace";
import type { SkillRunEvent } from "@/lib/agenticClient";

type Props = {
  runId?: number;
  status: "running" | "success" | "error";
  events: SkillRunEvent[];
  output?: unknown;
  error?: string;
};

export function SkillRunPanel({ runId, status, events, output, error }: Props) {
  return (
    <Card className="text-sm">
      <CardHeader className="py-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <StatusDot status={status} />
          <span>Run {runId ?? "…"}</span>
          <span className="text-muted-foreground">· {status}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <SkillRunTrace events={events} />
        {status === "success" && (
          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
            {JSON.stringify(output, null, 2)}
          </pre>
        )}
        {status === "error" && (
          <div className="text-xs text-destructive">{error}</div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusDot({ status }: { status: string }) {
  const cls =
    status === "running" ? "bg-amber-500 animate-pulse"
    : status === "success" ? "bg-emerald-500"
    : "bg-red-500";
  return <span className={`inline-block w-2 h-2 rounded-full ${cls}`} />;
}
```

### `src/components/atomic-crm/agentic/SkillRunTrace.tsx`

```tsx
import type { SkillRunEvent } from "@/lib/agenticClient";

export function SkillRunTrace({ events }: { events: SkillRunEvent[] }) {
  return (
    <ul className="space-y-1">
      {events.map((ev, i) => (
        <li key={i} className="font-mono text-xs">
          {renderEvent(ev)}
        </li>
      ))}
    </ul>
  );
}

function renderEvent(ev: SkillRunEvent): React.ReactNode {
  switch (ev.event) {
    case "text":
      return <span>{ev.data.content}</span>;
    case "tool_use":
      return <span>→ {ev.data.name}({JSON.stringify(ev.data.args)})</span>;
    case "tool_result":
      return <span className="text-muted-foreground">  ← {shortResult(ev.data.result)}</span>;
    case "run.started":
      return <span className="text-muted-foreground">started run #{ev.data.run_id}</span>;
    case "run.done":
      return <span className="text-emerald-500">done</span>;
    case "run.error":
      return <span className="text-destructive">error: {ev.data.error}</span>;
    default:
      return <span>{JSON.stringify(ev)}</span>;
  }
}

function shortResult(r: unknown) {
  const s = JSON.stringify(r);
  return s.length > 120 ? s.slice(0, 120) + "…" : s;
}
```

### `src/components/atomic-crm/agentic/index.ts`

```ts
export { SkillLauncher } from "./SkillLauncher";
export { SkillRunPanel } from "./SkillRunPanel";
export { SkillRunTrace } from "./SkillRunTrace";
```

### Test d'intégration

Ajouter un bouton dans `src/components/atomic-crm/dashboard/Welcome.tsx` :
```tsx
<SkillLauncher
  skill_id="hello_world"
  input={{ name: "Alice" }}
  label="Run hello_world"
/>
```

## Critères d'acceptation

- [ ] Bouton apparaît sur dashboard, click lance le skill et affiche le panel
- [ ] Le panel montre en temps réel : run.started → (éventuels events) → run.done
- [ ] Après run.done, `output` est affiché en JSON
- [ ] Cancel interrompt le run côté client (abort SSE)
- [ ] Skill unknown → error affiché
- [ ] `make typecheck` et `make lint` passent
- [ ] Pas de régression sur `Welcome.tsx` existant

## Risques / pièges

- `EventSource` ne supporte pas les headers custom → impossible. On utilise `fetch` + reader, sans polyfill.
- Attention au buffer SSE : un event peut arriver en plusieurs chunks. Bien attendre `\n\n` avant parse.
- Safari : `ReadableStream` ok, pas de soucis connus
- Avec VITE, `import.meta.env.VITE_SUPABASE_URL` doit exister — il est déjà dans `.env.local`

## Done

- Commit : `feat(agentic): add SkillLauncher UI and SSE client`
- Bouton de test visible sur dashboard
- Screenshot joint dans PR (optionnel)
