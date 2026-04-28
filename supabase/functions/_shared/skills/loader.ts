import { z } from "npm:zod@^3.25";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { skills as codeSkills } from "./index.ts";
import type { SkillManifest } from "./types.ts";
import { tools as toolDefs } from "../tools/registry.ts";

type CustomSkillRow = {
  skill_id: string;
  version: string;
  description: string;
  model: string;
  tools_allowed: unknown;
  max_iterations: number;
  max_writes: number;
  rate_limit: { per_minute: number; per_hour: number };
  system_prompt: string;
};

const PassThroughInput = z.record(z.unknown());
const PassThroughOutput = z.unknown();

function buildCustomManifest(
  row: CustomSkillRow,
  // deno-lint-ignore no-explicit-any
): SkillManifest<any, any> {
  const allowed = Array.isArray(row.tools_allowed)
    ? (row.tools_allowed as unknown[]).filter(
        (n): n is string => typeof n === "string" && Boolean(toolDefs[n]),
      )
    : [];
  return {
    id: row.skill_id,
    version: row.version,
    model: row.model,
    description: row.description,
    input_schema: PassThroughInput,
    output_schema: PassThroughOutput,
    tools_allowed: allowed,
    max_iterations: row.max_iterations,
    max_writes: row.max_writes,
    rate_limit: row.rate_limit,
    system_prompt: row.system_prompt,
  };
}

export type SkillSource = "code" | "custom";

export type LoadedSkillsMap = {
  // deno-lint-ignore no-explicit-any
  byId: Record<string, SkillManifest<any, any>>;
  sourceById: Record<string, SkillSource>;
};

export async function loadSkillsFor(
  supabase: SupabaseClient,
): Promise<LoadedSkillsMap> {
  // deno-lint-ignore no-explicit-any
  const byId: Record<string, SkillManifest<any, any>> = { ...codeSkills };
  const sourceById: Record<string, SkillSource> = {};
  for (const k of Object.keys(codeSkills)) sourceById[k] = "code";

  try {
    const { data, error } = await supabase
      .from("agent_custom_skills")
      .select(
        "skill_id,version,description,model,tools_allowed,max_iterations,max_writes,rate_limit,system_prompt",
      )
      .eq("enabled", true);
    if (error) throw error;
    for (const row of (data ?? []) as CustomSkillRow[]) {
      byId[row.skill_id] = buildCustomManifest(row);
      sourceById[row.skill_id] = "custom";
    }
  } catch (err) {
    // Custom skills are best-effort: if the table is missing (migration not
    // applied yet) we still serve the code skills.
    console.warn("loadSkillsFor: custom skills unavailable", err);
  }

  return { byId, sourceById };
}
