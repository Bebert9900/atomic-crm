import { z } from "npm:zod@^3.25";
import type { ToolDefinition } from "./types.ts";

export const list_tags: ToolDefinition = {
  name: "list_tags",
  description: "List all available tags (id, name, color).",
  input_schema: z.object({}),
  output_schema: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      color: z.string(),
    }),
  ),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async (_args, ctx) => {
    const { data, error } = await ctx.supabase
      .from("tags")
      .select("id,name,color")
      .order("name");
    if (error) throw error;
    return data ?? [];
  },
};

export const apply_tag: ToolDefinition = {
  name: "apply_tag",
  description:
    "Apply an existing tag to a contact. Does nothing if already applied. Only entity_type='contact' is supported v1.",
  input_schema: z.object({
    entity_type: z.enum(["contact"]),
    entity_id: z.number(),
    tag_id: z.number(),
  }),
  output_schema: z.object({
    applied: z.boolean(),
    before_tags: z.array(z.number()),
  }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ entity_id, tag_id }, ctx) => {
    const { data: cur } = await ctx.supabase
      .from("contacts")
      .select("tags")
      .eq("id", entity_id)
      .single();
    const before = (cur as { tags: number[] | null } | null)?.tags ?? [];
    if (before.includes(tag_id)) return { applied: false, before_tags: before };
    if (ctx.dryRun) return { applied: true, before_tags: before };
    const next = [...before, tag_id];
    const { error } = await ctx.supabase
      .from("contacts")
      .update({ tags: next })
      .eq("id", entity_id);
    if (error) throw error;
    return { applied: true, before_tags: before };
  },
  undo: async ({ original, output }, ctx) => {
    if (!output.applied) return;
    await ctx.supabase
      .from("contacts")
      .update({ tags: output.before_tags })
      .eq("id", original.args.entity_id);
  },
};

export const remove_tag: ToolDefinition = {
  name: "remove_tag",
  description: "Remove a tag from a contact.",
  input_schema: z.object({
    entity_type: z.enum(["contact"]),
    entity_id: z.number(),
    tag_id: z.number(),
  }),
  output_schema: z.object({
    removed: z.boolean(),
    before_tags: z.array(z.number()),
  }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ entity_id, tag_id }, ctx) => {
    const { data: cur } = await ctx.supabase
      .from("contacts")
      .select("tags")
      .eq("id", entity_id)
      .single();
    const before = (cur as { tags: number[] | null } | null)?.tags ?? [];
    if (!before.includes(tag_id))
      return { removed: false, before_tags: before };
    if (ctx.dryRun) return { removed: true, before_tags: before };
    const next = before.filter((t) => t !== tag_id);
    const { error } = await ctx.supabase
      .from("contacts")
      .update({ tags: next })
      .eq("id", entity_id);
    if (error) throw error;
    return { removed: true, before_tags: before };
  },
  undo: async ({ original, output }, ctx) => {
    if (!output.removed) return;
    await ctx.supabase
      .from("contacts")
      .update({ tags: output.before_tags })
      .eq("id", original.args.entity_id);
  },
};
