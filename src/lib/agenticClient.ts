import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";

export type SkillRunEvent =
  | { event: "run.started"; data: { run_id: number; dry_run: boolean } }
  | { event: "text"; data: { content: string } }
  | { event: "tool_use"; data: { name: string; args: unknown } }
  | { event: "tool_result"; data: { name: string; result: unknown } }
  | { event: "thinking"; data: string }
  | { event: "run.done"; data: { run_id: number; output: unknown; usage?: unknown } }
  | { event: "run.error"; data: { run_id: number; error: string } };

function parseSSEBlock(block: string): SkillRunEvent | null {
  let event: string | undefined;
  let data = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7).trim();
    else if (line.startsWith("data: ")) data += line.slice(6);
  }
  if (!data) return null;
  try {
    return { event, data: JSON.parse(data) } as SkillRunEvent;
  } catch {
    return null;
  }
}

export async function* streamSkillRun(
  skill_id: string,
  input: unknown,
  opts: { dry_run?: boolean; signal?: AbortSignal } = {},
): AsyncGenerator<SkillRunEvent> {
  const supabase = getSupabaseClient();
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
      const ev = parseSSEBlock(raw);
      if (ev) yield ev;
    }
  }
}

export async function listSkills(): Promise<
  Array<{
    id: string;
    version: string;
    description: string;
    model: string;
    tools_allowed: string[];
    rate_limit: { per_minute: number; per_hour: number };
  }>
> {
  const supabase = getSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("not_authenticated");
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-runtime/skills`,
    { headers: { "Authorization": `Bearer ${session.access_token}` } },
  );
  if (!res.ok) throw new Error(`list_skills_failed: ${res.status}`);
  const json = await res.json();
  return json.skills ?? [];
}
