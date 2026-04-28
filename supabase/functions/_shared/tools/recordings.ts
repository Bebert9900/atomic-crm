import { z } from "npm:zod@^3.25";
import type { ToolDefinition } from "./types.ts";

export const get_recording: ToolDefinition = {
  name: "get_recording",
  description:
    "Get a contact_recording with metadata, transcription, summary, sentiment/warmth, and ready-to-send drafts (email_advice / sms_advice).",
  input_schema: z.object({ id: z.number() }),
  output_schema: z.object({
    id: z.number(),
    contact_id: z.number(),
    duration_seconds: z.number().nullable(),
    transcription_status: z.string(),
    transcription: z.string().nullable(),
    summary: z.string().nullable(),
    sentiment: z.string().nullable(),
    warmth_score: z.number().nullable(),
    warmth_label: z.string().nullable(),
    email_advice: z.string().nullable(),
    sms_advice: z.string().nullable(),
    created_at: z.string(),
  }),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ id }, ctx) => {
    const { data, error } = await ctx.supabase
      .from("contact_recordings")
      .select(
        "id,contact_id,duration_seconds,transcription_status,transcription,summary,sentiment,warmth_score,warmth_label,email_advice,sms_advice,created_at",
      )
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },
};

export const update_recording_insights: ToolDefinition = {
  name: "update_recording_insights",
  description:
    "Backfill or refine the analytical fields of a recording: summary, sentiment, warmth_score (0..100), warmth_label, email_advice draft, sms_advice draft. Only provided fields are written.",
  input_schema: z.object({
    id: z.number(),
    patch: z.object({
      summary: z.string().optional(),
      sentiment: z
        .enum(["Positif", "Neutre", "Hésitant", "Négatif", "Froid"])
        .optional(),
      warmth_score: z.number().int().min(0).max(100).optional(),
      warmth_label: z
        .enum(["Glacé", "Froid", "Tiède", "Chaud", "Brûlant"])
        .optional(),
      email_advice: z.string().max(4000).optional(),
      sms_advice: z.string().max(800).optional(),
    }),
  }),
  output_schema: z.object({
    id: z.number(),
    before: z.record(z.unknown()),
  }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ id, patch }, ctx) => {
    const cols = Object.keys(patch);
    let before: Record<string, unknown> = {};
    if (cols.length > 0) {
      const { data } = await ctx.supabase
        .from("contact_recordings")
        .select(cols.join(","))
        .eq("id", id)
        .single();
      before = (data ?? {}) as Record<string, unknown>;
    }
    if (ctx.dryRun) return { id, before };
    const { error } = await ctx.supabase
      .from("contact_recordings")
      .update(patch)
      .eq("id", id);
    if (error) throw error;
    return { id, before };
  },
  undo: async ({ output }, ctx) => {
    // deno-lint-ignore no-explicit-any
    await ctx.supabase
      .from("contact_recordings")
      .update(output.before as any)
      .eq("id", output.id);
  },
};

export const get_transcription: ToolDefinition = {
  name: "get_transcription",
  description:
    "Get just the transcription text of a recording, truncated to 20k chars if very long.",
  input_schema: z.object({ recording_id: z.number() }),
  output_schema: z.object({
    transcription: z.string().nullable(),
    truncated: z.boolean(),
  }),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ recording_id }, ctx) => {
    const { data, error } = await ctx.supabase
      .from("contact_recordings")
      .select("transcription")
      .eq("id", recording_id)
      .single();
    if (error) throw error;
    const t =
      (data as { transcription: string | null } | null)?.transcription ?? null;
    if (!t) return { transcription: null, truncated: false };
    if (t.length > 20000) {
      return { transcription: t.slice(0, 20000), truncated: true };
    }
    return { transcription: t, truncated: false };
  },
};
