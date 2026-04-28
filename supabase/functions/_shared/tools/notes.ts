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

export const update_note: ToolDefinition = {
  name: "update_note",
  description:
    "Met à jour le texte (et éventuellement le status pour les contact_notes) d'une note existante.",
  input_schema: z.object({
    note_id: z.number().int(),
    note_type: z.enum(["contact", "deal"]),
    text: z.string().min(1).optional(),
    status: z.string().optional(),
  }),
  output_schema: z.object({ id: z.number(), updated: z.boolean() }),
  kind: "write",
  reversible: false,
  cost_estimate: "low",
  handler: async ({ note_id, note_type, text, status }, ctx) => {
    const table = note_type === "contact" ? "contact_notes" : "deal_notes";
    const patch: Record<string, unknown> = {};
    if (text !== undefined) patch.text = text;
    if (status !== undefined && note_type === "contact") patch.status = status;
    if (Object.keys(patch).length === 0) {
      throw new Error("update_note: nothing to update");
    }
    const { error } = await ctx.supabase
      .from(table)
      .update(patch)
      .eq("id", note_id);
    if (error) throw error;
    return { id: note_id, updated: true };
  },
};

export const delete_note: ToolDefinition = {
  name: "delete_note",
  description: "Supprime une note (contact ou deal).",
  input_schema: z.object({
    note_id: z.number().int(),
    note_type: z.enum(["contact", "deal"]),
  }),
  output_schema: z.object({ id: z.number(), deleted: z.boolean() }),
  kind: "write",
  reversible: false,
  cost_estimate: "low",
  handler: async ({ note_id, note_type }, ctx) => {
    const table = note_type === "contact" ? "contact_notes" : "deal_notes";
    const { error } = await ctx.supabase.from(table).delete().eq("id", note_id);
    if (error) throw error;
    return { id: note_id, deleted: true };
  },
};
