import type { ToolDefinition } from "./types.ts";

import * as contacts from "./contacts.ts";
import * as companies from "./companies.ts";
import * as deals from "./deals.ts";
import * as tasks from "./tasks.ts";
import * as notes from "./notes.ts";
import * as recordings from "./recordings.ts";
import * as emails from "./emails.ts";
import * as tagsMod from "./tags.ts";
import * as activity from "./activity.ts";
import * as appointments from "./appointments.ts";
import * as devTasks from "./dev_tasks.ts";
import * as integrations from "./integrations.ts";
import * as subscriptions from "./subscriptions.ts";
import * as sessions from "./sessions.ts";
import * as salesMod from "./sales.ts";
import * as financeMod from "./finance.ts";
import * as timelineMod from "./timeline.ts";
import * as approvalsMod from "./approvals.ts";
import * as schedulerMod from "./scheduler.ts";
import { runSkillTool } from "./skills_run.ts";

function collect(mod: Record<string, unknown>): ToolDefinition[] {
  return Object.values(mod).filter(
    (v): v is ToolDefinition =>
      typeof v === "object" && v !== null && "name" in v && "handler" in v,
  );
}

const all: ToolDefinition[] = [
  ...collect(contacts),
  ...collect(companies),
  ...collect(deals),
  ...collect(tasks),
  ...collect(notes),
  ...collect(recordings),
  ...collect(emails),
  ...collect(tagsMod),
  ...collect(activity),
  ...collect(appointments),
  ...collect(devTasks),
  ...collect(integrations),
  ...collect(subscriptions),
  ...collect(sessions),
  ...collect(salesMod),
  ...collect(financeMod),
  ...collect(timelineMod),
  approvalsMod.request_approval,
  ...collect(schedulerMod),
  runSkillTool,
];

export const tools: Record<string, ToolDefinition> = Object.fromEntries(
  all.map((t) => [t.name, t]),
);

/** Convert zod schema → JSON schema for Claude (naive conversion). */
// deno-lint-ignore no-explicit-any
function zodToJsonSchemaNaive(schema: any): Record<string, unknown> {
  // Minimal conversion: we rely on zod._def to walk.
  // For production, swap to `zod-to-json-schema` npm import.
  try {
    // dynamic import kept lazy (avoid top-level side effects)
    // eslint-disable-next-line
    return (schema as any)._def
      ? { type: "object", additionalProperties: true }
      : { type: "object" };
  } catch {
    return { type: "object" };
  }
}

export function toolsForClaude(names: string[]) {
  return names.map((n) => {
    const t = tools[n];
    if (!t) throw new Error(`Unknown tool: ${n}`);
    return {
      name: t.name,
      description: t.description,
      input_schema: zodToJsonSchemaNaive(t.input_schema),
    };
  });
}

export function isWriteTool(name: string): boolean {
  return tools[name]?.kind === "write";
}
