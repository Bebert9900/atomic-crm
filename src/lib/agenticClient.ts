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

export type SkillSummary = {
  id: string;
  version: string;
  description: string;
  model: string;
  tools_allowed: string[];
  rate_limit: { per_minute: number; per_hour: number };
  source?: "code" | "custom";
};

async function authedFetch(path: string, init?: RequestInit) {
  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("not_authenticated");
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export async function listSkills(): Promise<SkillSummary[]> {
  const res = await authedFetch("/agent-runtime/skills");
  if (!res.ok) throw new Error(`list_skills_failed: ${res.status}`);
  const json = await res.json();
  return json.skills ?? [];
}

export type ToolSummary = {
  name: string;
  description: string;
  kind: "read" | "write";
  cost_estimate: "low" | "medium" | "high";
  reversible: boolean;
};

export async function listTools(): Promise<ToolSummary[]> {
  const res = await authedFetch("/agent-runtime/tools");
  if (!res.ok) throw new Error(`list_tools_failed: ${res.status}`);
  const json = await res.json();
  return json.tools ?? [];
}

export type CustomSkillRow = {
  id: string;
  skill_id: string;
  version: string;
  description: string;
  model: string;
  tools_allowed: string[];
  max_iterations: number;
  max_writes: number;
  rate_limit: { per_minute: number; per_hour: number };
  system_prompt: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type CustomSkillPatch = Partial<
  Omit<CustomSkillRow, "id" | "created_at" | "updated_at">
> & {
  skill_id?: string;
};

export async function listCustomSkills(): Promise<CustomSkillRow[]> {
  const res = await authedFetch("/agent-runtime/custom-skills");
  if (!res.ok) throw new Error(`list_custom_skills_failed: ${res.status}`);
  const json = await res.json();
  return json.skills ?? [];
}

export async function createCustomSkill(
  body: CustomSkillPatch,
): Promise<CustomSkillRow> {
  const res = await authedFetch("/agent-runtime/custom-skills", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`create_custom_skill_failed: ${res.status} ${t}`);
  }
  return await res.json();
}

export async function updateCustomSkill(
  id: string,
  body: CustomSkillPatch,
): Promise<CustomSkillRow> {
  const res = await authedFetch(`/agent-runtime/custom-skills/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`update_custom_skill_failed: ${res.status} ${t}`);
  }
  return await res.json();
}

export async function deleteCustomSkill(id: string): Promise<void> {
  const res = await authedFetch(`/agent-runtime/custom-skills/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`delete_custom_skill_failed: ${res.status}`);
}
