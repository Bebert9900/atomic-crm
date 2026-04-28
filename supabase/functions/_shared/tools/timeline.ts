import { z } from "npm:zod@^3.25";
import type { ToolDefinition } from "./types.ts";

type TimelineItem = {
  type: "email_in" | "email_out" | "call" | "video" | "note" | "appointment";
  date: string;
  title: string;
  summary: string | null;
  ref_id: number;
  meta?: Record<string, unknown>;
};

function truncate(s: string | null | undefined, n = 240): string | null {
  if (!s) return null;
  const cleaned = s.replace(/\s+/g, " ").trim();
  return cleaned.length > n ? cleaned.slice(0, n) + "…" : cleaned;
}

export const get_contact_timeline: ToolDefinition = {
  name: "get_contact_timeline",
  description:
    "Récupère TOUS les échanges d'un contact (emails entrants/sortants, appels enregistrés, visioconférences, notes, RDV) fusionnés et triés chronologiquement. Idéal pour 'résume-moi l'historique avec X'. Une seule tool call au lieu de 5.",
  input_schema: z.object({
    contact_id: z.number().int(),
    since_days: z.number().int().min(1).max(365).default(90),
    types: z
      .array(z.enum(["email", "call", "video", "note", "appointment"]))
      .optional(),
    limit_per_type: z.number().int().min(1).max(50).default(20),
    with_excerpts: z.boolean().default(true),
  }),
  output_schema: z.object({
    contact_id: z.number(),
    since: z.string(),
    counts: z.object({
      emails: z.number(),
      calls: z.number(),
      videos: z.number(),
      notes: z.number(),
      appointments: z.number(),
    }),
    items: z.array(
      z.object({
        type: z.string(),
        date: z.string(),
        title: z.string(),
        summary: z.string().nullable(),
        ref_id: z.number(),
        meta: z.record(z.unknown()).optional(),
      }),
    ),
  }),
  kind: "read",
  reversible: true,
  cost_estimate: "medium",
  handler: async (
    { contact_id, since_days, types, limit_per_type, with_excerpts },
    ctx,
  ) => {
    const since = new Date(Date.now() - since_days * 86400_000).toISOString();
    const wanted = new Set(
      types ?? ["email", "call", "video", "note", "appointment"],
    );
    const items: TimelineItem[] = [];
    const counts = {
      emails: 0,
      calls: 0,
      videos: 0,
      notes: 0,
      appointments: 0,
    };

    if (wanted.has("email")) {
      const { data: emails } = await ctx.supabase
        .from("email_messages")
        .select("id,subject,from_email,from_name,date,folder,text_body,is_read")
        .eq("contact_id", contact_id)
        .gte("date", since)
        .order("date", { ascending: false })
        .limit(limit_per_type);
      for (const e of (emails ?? []) as Array<{
        id: number;
        subject: string | null;
        from_email: string | null;
        from_name: string | null;
        date: string;
        folder: string | null;
        text_body: string | null;
        is_read: boolean;
      }>) {
        const isOutbound = (e.folder ?? "").toLowerCase().includes("sent");
        items.push({
          type: isOutbound ? "email_out" : "email_in",
          date: e.date,
          title: e.subject ?? "(sans sujet)",
          summary: with_excerpts ? truncate(e.text_body, 300) : null,
          ref_id: e.id,
          meta: {
            from: e.from_name ?? e.from_email,
            unread: !e.is_read,
          },
        });
      }
      counts.emails = (emails ?? []).length;
    }

    if (wanted.has("call")) {
      const { data: recs } = await ctx.supabase
        .from("contact_recordings")
        .select("id,created_at,summary,sentiment,warmth_label,duration_seconds")
        .eq("contact_id", contact_id)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(limit_per_type);
      for (const r of (recs ?? []) as Array<{
        id: number;
        created_at: string;
        summary: string | null;
        sentiment: string | null;
        warmth_label: string | null;
        duration_seconds: number | null;
      }>) {
        const dur = r.duration_seconds
          ? `${Math.floor(r.duration_seconds / 60)}min`
          : "?";
        items.push({
          type: "call",
          date: r.created_at,
          title: `Appel téléphonique (${dur})`,
          summary: with_excerpts ? truncate(r.summary, 400) : null,
          ref_id: r.id,
          meta: {
            sentiment: r.sentiment,
            warmth: r.warmth_label,
          },
        });
      }
      counts.calls = (recs ?? []).length;
    }

    if (wanted.has("video")) {
      const { data: vids } = await ctx.supabase
        .from("video_conferences")
        .select(
          "id,recorded_at,title,provider,duration_minutes,transcription,notes",
        )
        .eq("contact_id", contact_id)
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: false })
        .limit(limit_per_type);
      for (const v of (vids ?? []) as Array<{
        id: number;
        recorded_at: string | null;
        title: string | null;
        provider: string | null;
        duration_minutes: number | null;
        transcription: string | null;
        notes: string | null;
      }>) {
        if (!v.recorded_at) continue;
        items.push({
          type: "video",
          date: v.recorded_at,
          title: `${v.title ?? "Visio"} (${v.duration_minutes ?? "?"}min)`,
          summary: with_excerpts
            ? truncate(v.notes ?? v.transcription, 400)
            : null,
          ref_id: v.id,
          meta: { provider: v.provider },
        });
      }
      counts.videos = (vids ?? []).length;
    }

    if (wanted.has("note")) {
      const { data: notes } = await ctx.supabase
        .from("contact_notes")
        .select("id,text,date,status")
        .eq("contact_id", contact_id)
        .gte("date", since)
        .order("date", { ascending: false })
        .limit(limit_per_type);
      for (const n of (notes ?? []) as Array<{
        id: number;
        text: string | null;
        date: string;
        status: string | null;
      }>) {
        items.push({
          type: "note",
          date: n.date,
          title: "Note interne",
          summary: with_excerpts ? truncate(n.text, 400) : null,
          ref_id: n.id,
          meta: { status: n.status },
        });
      }
      counts.notes = (notes ?? []).length;
    }

    if (wanted.has("appointment")) {
      const { data: appts } = await ctx.supabase
        .from("appointments")
        .select("id,title,start_at,status,location,description")
        .eq("contact_id", contact_id)
        .gte("start_at", since)
        .order("start_at", { ascending: false })
        .limit(limit_per_type);
      for (const a of (appts ?? []) as Array<{
        id: number;
        title: string | null;
        start_at: string;
        status: string | null;
        location: string | null;
        description: string | null;
      }>) {
        items.push({
          type: "appointment",
          date: a.start_at,
          title: a.title ?? "RDV",
          summary: with_excerpts
            ? truncate(a.description ?? a.location, 200)
            : null,
          ref_id: a.id,
          meta: { status: a.status, location: a.location },
        });
      }
      counts.appointments = (appts ?? []).length;
    }

    items.sort((a, b) => (a.date < b.date ? 1 : -1));

    return {
      contact_id,
      since,
      counts,
      items,
    };
  },
};

export const get_company_timeline: ToolDefinition = {
  name: "get_company_timeline",
  description:
    "Variante de get_contact_timeline pour une company : agrège tous les échanges de tous les contacts liés à la boîte. Idéal pour 'fais-moi le point sur le compte X'.",
  input_schema: z.object({
    company_id: z.number().int(),
    since_days: z.number().int().min(1).max(365).default(90),
    limit: z.number().int().min(1).max(100).default(40),
    with_excerpts: z.boolean().default(true),
  }),
  output_schema: z.object({
    company_id: z.number(),
    contact_ids: z.array(z.number()),
    items: z.array(
      z.object({
        type: z.string(),
        date: z.string(),
        title: z.string(),
        summary: z.string().nullable(),
        ref_id: z.number(),
        contact_id: z.number().nullable(),
      }),
    ),
  }),
  kind: "read",
  reversible: true,
  cost_estimate: "medium",
  handler: async ({ company_id, since_days, limit, with_excerpts }, ctx) => {
    const { data: contacts } = await ctx.supabase
      .from("contacts")
      .select("id")
      .eq("company_id", company_id);
    const ids = (contacts ?? []).map((c: { id: number }) => c.id);
    if (ids.length === 0) {
      return { company_id, contact_ids: [], items: [] };
    }
    const since = new Date(Date.now() - since_days * 86400_000).toISOString();

    const [emails, recs, vids, notes, appts] = await Promise.all([
      ctx.supabase
        .from("email_messages")
        .select("id,subject,from_email,date,folder,text_body,contact_id")
        .in("contact_id", ids)
        .gte("date", since)
        .order("date", { ascending: false })
        .limit(limit),
      ctx.supabase
        .from("contact_recordings")
        .select("id,created_at,summary,contact_id,duration_seconds")
        .in("contact_id", ids)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(limit),
      ctx.supabase
        .from("video_conferences")
        .select("id,recorded_at,title,notes,contact_id")
        .in("contact_id", ids)
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: false })
        .limit(limit),
      ctx.supabase
        .from("contact_notes")
        .select("id,text,date,contact_id")
        .in("contact_id", ids)
        .gte("date", since)
        .order("date", { ascending: false })
        .limit(limit),
      ctx.supabase
        .from("appointments")
        .select("id,title,start_at,status,contact_id")
        .in("contact_id", ids)
        .gte("start_at", since)
        .order("start_at", { ascending: false })
        .limit(limit),
    ]);

    type Item = {
      type: string;
      date: string;
      title: string;
      summary: string | null;
      ref_id: number;
      contact_id: number | null;
    };
    const items: Item[] = [];

    for (const e of (emails.data ?? []) as Array<{
      id: number;
      subject: string | null;
      from_email: string | null;
      date: string;
      folder: string | null;
      text_body: string | null;
      contact_id: number | null;
    }>) {
      const out = (e.folder ?? "").toLowerCase().includes("sent");
      items.push({
        type: out ? "email_out" : "email_in",
        date: e.date,
        title: e.subject ?? "(sans sujet)",
        summary: with_excerpts ? truncate(e.text_body, 250) : null,
        ref_id: e.id,
        contact_id: e.contact_id,
      });
    }
    for (const r of (recs.data ?? []) as Array<{
      id: number;
      created_at: string;
      summary: string | null;
      contact_id: number | null;
      duration_seconds: number | null;
    }>) {
      items.push({
        type: "call",
        date: r.created_at,
        title: `Appel (${r.duration_seconds ? Math.floor(r.duration_seconds / 60) + "min" : "?"})`,
        summary: with_excerpts ? truncate(r.summary, 300) : null,
        ref_id: r.id,
        contact_id: r.contact_id,
      });
    }
    for (const v of (vids.data ?? []) as Array<{
      id: number;
      recorded_at: string | null;
      title: string | null;
      notes: string | null;
      contact_id: number | null;
    }>) {
      if (!v.recorded_at) continue;
      items.push({
        type: "video",
        date: v.recorded_at,
        title: v.title ?? "Visio",
        summary: with_excerpts ? truncate(v.notes, 300) : null,
        ref_id: v.id,
        contact_id: v.contact_id,
      });
    }
    for (const n of (notes.data ?? []) as Array<{
      id: number;
      text: string | null;
      date: string;
      contact_id: number | null;
    }>) {
      items.push({
        type: "note",
        date: n.date,
        title: "Note interne",
        summary: with_excerpts ? truncate(n.text, 300) : null,
        ref_id: n.id,
        contact_id: n.contact_id,
      });
    }
    for (const a of (appts.data ?? []) as Array<{
      id: number;
      title: string | null;
      start_at: string;
      status: string | null;
      contact_id: number | null;
    }>) {
      items.push({
        type: "appointment",
        date: a.start_at,
        title: a.title ?? "RDV",
        summary: a.status ?? null,
        ref_id: a.id,
        contact_id: a.contact_id,
      });
    }

    items.sort((a, b) => (a.date < b.date ? 1 : -1));
    return { company_id, contact_ids: ids, items: items.slice(0, limit) };
  },
};
