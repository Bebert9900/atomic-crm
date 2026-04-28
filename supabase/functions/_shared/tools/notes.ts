import { z } from "npm:zod@^3.25";
import type { ToolDefinition } from "./types.ts";

export const add_contact_note: ToolDefinition = {
  name: "add_contact_note",
  description: "Add a note to a contact.",
  input_schema: z.object({
    contact_id: z.number(),
    text: z.string().min(1),
    status: z.string().optional(),
  }),
  output_schema: z.object({ id: z.number() }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async (args, ctx) => {
    if (ctx.dryRun) return { id: -1 };
    const { data, error } = await ctx.supabase
      .from("contact_notes")
      .insert({ ...args, date: new Date().toISOString() })
      .select("id")
      .single();
    if (error) throw error;
    return { id: (data as { id: number }).id };
  },
  undo: async ({ output }, ctx) => {
    if (output.id < 0) return;
    await ctx.supabase.from("contact_notes").delete().eq("id", output.id);
  },
};
