import { z } from "npm:zod@^3.25";
import type { ToolDefinition } from "./types.ts";

export const get_recording: ToolDefinition = {
  name: "get_recording",
  description:
    "Get a contact_recording with metadata, transcription, summary, and advice.",
  input_schema: z.object({ id: z.number() }),
  output_schema: z.object({
    id: z.number(),
    contact_id: z.number(),
    duration_seconds: z.number().nullable(),
    transcription_status: z.string(),
    transcription: z.string().nullable(),
    summary: z.string().nullable(),
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
        "id,contact_id,duration_seconds,transcription_status,transcription,summary,email_advice,sms_advice,created_at",
      )
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
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
