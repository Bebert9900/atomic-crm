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
