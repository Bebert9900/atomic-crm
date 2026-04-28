import type { AuthInfo } from "./auth.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { tools as toolDefs } from "../_shared/tools/registry.ts";

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SB_ADMIN_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function userClient(jwt: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    },
  );
}

const ALLOWED_MODELS = [
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
  "deepseek-chat",
];

type CustomSkillInput = {
  skill_id?: string;
  version?: string;
  description?: string;
  model?: string;
  tools_allowed?: unknown;
  max_iterations?: number;
  max_writes?: number;
  rate_limit?: { per_minute?: number; per_hour?: number };
  system_prompt?: string;
  enabled?: boolean;
};

function validate(body: CustomSkillInput, isCreate: boolean): string | null {
  if (isCreate || body.skill_id !== undefined) {
    if (!body.skill_id || !/^[a-z][a-z0-9_]{2,63}$/.test(body.skill_id)) {
      return "skill_id must match /^[a-z][a-z0-9_]{2,63}$/";
    }
  }
  if (isCreate || body.model !== undefined) {
    if (!body.model || !ALLOWED_MODELS.includes(body.model)) {
      return `model must be one of: ${ALLOWED_MODELS.join(", ")}`;
    }
  }
  if (body.tools_allowed !== undefined) {
    if (!Array.isArray(body.tools_allowed))
      return "tools_allowed must be an array";
    for (const n of body.tools_allowed) {
      if (typeof n !== "string") return "tools_allowed entries must be strings";
      if (!toolDefs[n]) return `unknown tool: ${n}`;
    }
  }
  if (isCreate && (!body.system_prompt || body.system_prompt.length < 20)) {
    return "system_prompt is required (≥ 20 chars)";
  }
  if (body.max_iterations !== undefined) {
    if (
      typeof body.max_iterations !== "number" ||
      body.max_iterations < 1 ||
      body.max_iterations > 50
    )
      return "max_iterations must be between 1 and 50";
  }
  if (body.max_writes !== undefined) {
    if (
      typeof body.max_writes !== "number" ||
      body.max_writes < 0 ||
      body.max_writes > 50
    )
      return "max_writes must be between 0 and 50";
  }
  return null;
}

export async function handleListCustomSkills(
  auth: AuthInfo,
): Promise<Response> {
  const supa = userClient(auth.token);
  const { data, error } = await supa
    .from("agent_custom_skills")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ skills: data ?? [] });
}

export async function handleCreateCustomSkill(
  req: Request,
  auth: AuthInfo,
): Promise<Response> {
  let body: CustomSkillInput;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const err = validate(body, true);
  if (err) return Response.json({ error: err }, { status: 400 });

  const admin = adminClient();
  const { data, error } = await admin
    .from("agent_custom_skills")
    .insert({
      skill_id: body.skill_id,
      version: body.version ?? "1.0.0",
      description: body.description ?? "",
      model: body.model,
      tools_allowed: body.tools_allowed ?? [],
      max_iterations: body.max_iterations ?? 8,
      max_writes: body.max_writes ?? 4,
      rate_limit: body.rate_limit ?? { per_minute: 2, per_hour: 20 },
      system_prompt: body.system_prompt,
      enabled: body.enabled ?? true,
      created_by: auth.userId,
    })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json(data, { status: 201 });
}

export async function handleUpdateCustomSkill(
  req: Request,
  auth: AuthInfo,
  id: string,
): Promise<Response> {
  let body: CustomSkillInput;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const err = validate(body, false);
  if (err) return Response.json({ error: err }, { status: 400 });

  // RLS still enforced via user JWT (admin write policy).
  const supa = userClient(auth.token);
  const patch: Record<string, unknown> = {};
  for (const k of [
    "skill_id",
    "version",
    "description",
    "model",
    "tools_allowed",
    "max_iterations",
    "max_writes",
    "rate_limit",
    "system_prompt",
    "enabled",
  ] as const) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  const { data, error } = await supa
    .from("agent_custom_skills")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json(data);
}

export async function handleDeleteCustomSkill(
  auth: AuthInfo,
  id: string,
): Promise<Response> {
  const supa = userClient(auth.token);
  const { error } = await supa
    .from("agent_custom_skills")
    .delete()
    .eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return new Response(null, { status: 204 });
}
