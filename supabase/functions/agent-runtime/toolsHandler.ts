import type { AuthInfo } from "./auth.ts";
import { tools as toolDefs } from "../_shared/tools/registry.ts";

export function handleListTools(_auth: AuthInfo): Response {
  const list = Object.values(toolDefs).map((t) => ({
    name: t.name,
    description: t.description,
    kind: t.kind,
    cost_estimate: t.cost_estimate,
    reversible: t.reversible,
  }));
  return Response.json({ tools: list });
}
