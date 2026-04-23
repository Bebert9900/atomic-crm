# Story A.3 — Tool Registry initial

**Epic**: A. Foundation
**Status**: Ready
**Estimation**: 8h
**Depends on**: A.1
**Blocks**: A.4, B.1 à B.5

## Contexte business

Les tools sont les briques que Claude invoque via tool_use. Sans registry, aucun skill ne peut agir sur le CRM. Cette story crée le registry, ses conventions, et ~20 tools couvrant les besoins des 5 skills v1.

## Contexte technique

- Tools TypeScript purs, un fichier par domaine (`contacts.ts`, `deals.ts`, etc.)
- Chaque tool retourne du JSON strict (pas de ReactElement, pas de Date non ISO)
- Chaque tool reçoit un `ToolContext` avec un `SupabaseClient` porteur du JWT user → RLS appliqué
- Schemas Zod partagés en input/output → convertibles au format Claude (`input_schema`)
- Lazy loading non requis v1 (fichier unique chargé)

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `supabase/functions/_shared/tools/types.ts` | Créer (ToolDefinition, ToolContext) |
| `supabase/functions/_shared/tools/registry.ts` | Créer (map + conversion Claude) |
| `supabase/functions/_shared/tools/contacts.ts` | Créer |
| `supabase/functions/_shared/tools/companies.ts` | Créer |
| `supabase/functions/_shared/tools/deals.ts` | Créer |
| `supabase/functions/_shared/tools/tasks.ts` | Créer |
| `supabase/functions/_shared/tools/notes.ts` | Créer |
| `supabase/functions/_shared/tools/recordings.ts` | Créer |
| `supabase/functions/_shared/tools/emails.ts` | Créer |
| `supabase/functions/_shared/tools/tags.ts` | Créer |
| `supabase/functions/_shared/tools/activity.ts` | Créer |
| `supabase/functions/_shared/tools/registry.test.ts` | Créer |

## Spec technique

### `types.ts`

```ts
import { z } from "npm:zod@^3.25";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AuthInfo } from "../../agent-runtime/auth.ts";

export type ToolContext = {
  auth: AuthInfo;
  supabase: SupabaseClient; // créé avec user JWT
  runId: number;
  dryRun: boolean;
};

export type ToolKind = 'read' | 'write';

export type ToolDefinition<I = any, O = any> = {
  name: string;
  description: string;       // visible par Claude, soignée
  input_schema: z.ZodType<I>;
  output_schema: z.ZodType<O>;
  kind: ToolKind;
  reversible: boolean;       // write uniquement ; si true, `undo` possible
  cost_estimate: 'low' | 'medium' | 'high';
  handler: (args: I, ctx: ToolContext) => Promise<O>;
  /** undo handler : reçoit l'output original + ctx, rollback l'effet */
  undo?: (original: { args: I; output: O }, ctx: ToolContext) => Promise<void>;
};
```

### `registry.ts`

```ts
import { zodToJsonSchema } from "npm:zod-to-json-schema@3";
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

const all: ToolDefinition[] = [
  ...Object.values(contacts), ...Object.values(companies),
  ...Object.values(deals), ...Object.values(tasks),
  ...Object.values(notes), ...Object.values(recordings),
  ...Object.values(emails), ...Object.values(tagsMod),
  ...Object.values(activity),
];

export const tools: Record<string, ToolDefinition> =
  Object.fromEntries(all.map((t) => [t.name, t]));

export function toolsForClaude(names: string[]) {
  return names.map((n) => {
    const t = tools[n];
    if (!t) throw new Error(`Unknown tool: ${n}`);
    return {
      name: t.name,
      description: t.description,
      input_schema: zodToJsonSchema(t.input_schema, { target: "jsonSchema7" }),
    };
  });
}

export function isWriteTool(name: string): boolean {
  return tools[name]?.kind === 'write';
}
```

### Liste des tools v1

**contacts.ts** :
```ts
import { z } from "npm:zod@^3.25";
import type { ToolDefinition } from "./types.ts";

export const search_contacts: ToolDefinition = {
  name: "search_contacts",
  description:
    "Search contacts by name, email, company, or free text. Returns id, first_name, last_name, email, company name, last interaction date. Use this before referencing a contact by id.",
  input_schema: z.object({
    query: z.string().optional().describe("Free-text match on name, email, company"),
    company_id: z.number().optional(),
    tag_ids: z.array(z.number()).optional(),
    updated_since: z.string().datetime().optional(),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  output_schema: z.array(z.object({
    id: z.number(),
    first_name: z.string().nullable(),
    last_name: z.string().nullable(),
    email: z.string().nullable(),
    company_name: z.string().nullable(),
    last_seen: z.string().nullable(),
  })),
  kind: "read",
  reversible: true,
  cost_estimate: "low",
  handler: async (args, ctx) => {
    const q = ctx.supabase.from("contacts_summary").select(
      "id, first_name, last_name, email_fts, company_name, last_seen",
    ).limit(args.limit);
    if (args.query) q.or(
      `first_name.ilike.%${args.query}%,last_name.ilike.%${args.query}%,email_fts.ilike.%${args.query}%,company_name.ilike.%${args.query}%`,
    );
    if (args.company_id) q.eq("company_id", args.company_id);
    if (args.updated_since) q.gte("last_seen", args.updated_since);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id,
      first_name: r.first_name,
      last_name: r.last_name,
      email: r.email_fts,
      company_name: r.company_name,
      last_seen: r.last_seen,
    }));
  },
};

export const get_contact: ToolDefinition = {
  name: "get_contact",
  description: "Get full contact record with emails, phones, company, tags.",
  input_schema: z.object({ id: z.number() }),
  output_schema: z.object({
    id: z.number(), first_name: z.string().nullable(), last_name: z.string().nullable(),
    title: z.string().nullable(), company_id: z.number().nullable(),
    email_jsonb: z.array(z.object({ email: z.string(), type: z.string() })),
    phone_jsonb: z.array(z.object({ number: z.string(), type: z.string() })),
    tags: z.array(z.number()), background: z.string().nullable(),
    status: z.string().nullable(), lead_source: z.string(),
  }),
  kind: "read", reversible: true, cost_estimate: "low",
  handler: async ({ id }, ctx) => {
    const { data, error } = await ctx.supabase.from("contacts")
      .select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  },
};

export const create_contact: ToolDefinition = {
  name: "create_contact",
  description: "Create a new contact. Must provide at least first_name or last_name or one email. Do NOT set sales_id, it is auto-filled.",
  input_schema: z.object({
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    title: z.string().optional(),
    company_id: z.number().optional(),
    email_jsonb: z.array(z.object({
      email: z.string().email(),
      type: z.enum(["Work","Home","Other"]),
    })).optional(),
    phone_jsonb: z.array(z.object({
      number: z.string(),
      type: z.enum(["Work","Home","Other"]),
    })).optional(),
    tags: z.array(z.number()).optional(),
    background: z.string().optional(),
    lead_source: z.enum([
      "outbound","referral","partner","manual",
      "email_campaign","seo","other","unknown",
    ]).default("manual"),
  }).refine(
    (v) => v.first_name || v.last_name || (v.email_jsonb && v.email_jsonb.length > 0),
    { message: "Provide at least first_name, last_name, or an email." },
  ),
  output_schema: z.object({ id: z.number() }),
  kind: "write", reversible: true, cost_estimate: "low",
  handler: async (args, ctx) => {
    if (ctx.dryRun) return { id: -1 };
    const { data, error } = await ctx.supabase.from("contacts")
      .insert(args).select("id").single();
    if (error) throw error;
    return { id: data.id };
  },
  undo: async ({ output }, ctx) => {
    if (output.id < 0) return;
    await ctx.supabase.from("contacts").delete().eq("id", output.id);
  },
};

export const update_contact: ToolDefinition = {
  name: "update_contact",
  description: "Update fields on an existing contact. Only provided fields are changed. Destructive field deletions (setting to null) are not allowed.",
  input_schema: z.object({
    id: z.number(),
    patch: z.object({
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      title: z.string().optional(),
      company_id: z.number().optional(),
      tags: z.array(z.number()).optional(),
      background: z.string().optional(),
      status: z.string().optional(),
    }),
  }),
  output_schema: z.object({ id: z.number(), before: z.record(z.unknown()) }),
  kind: "write", reversible: true, cost_estimate: "low",
  handler: async ({ id, patch }, ctx) => {
    const { data: before } = await ctx.supabase.from("contacts")
      .select(Object.keys(patch).join(",")).eq("id", id).single();
    if (ctx.dryRun) return { id, before: before ?? {} };
    const { error } = await ctx.supabase.from("contacts")
      .update(patch).eq("id", id);
    if (error) throw error;
    return { id, before: before ?? {} };
  },
  undo: async ({ output }, ctx) => {
    await ctx.supabase.from("contacts")
      .update(output.before as any).eq("id", output.id);
  },
};

export const list_contact_tasks: ToolDefinition = {
  name: "list_contact_tasks",
  description: "List tasks attached to a contact. Optionally filter by done/pending.",
  input_schema: z.object({
    contact_id: z.number(),
    done: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  output_schema: z.array(z.object({
    id: z.number(), type: z.string().nullable(), text: z.string().nullable(),
    due_date: z.string().nullable(), done_date: z.string().nullable(),
  })),
  kind: "read", reversible: true, cost_estimate: "low",
  handler: async (args, ctx) => {
    const q = ctx.supabase.from("tasks").select("id,type,text,due_date,done_date")
      .eq("contact_id", args.contact_id).limit(args.limit);
    if (args.done === true) q.not("done_date", "is", null);
    if (args.done === false) q.is("done_date", null);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },
};

export const list_contact_notes: ToolDefinition = {
  name: "list_contact_notes",
  description: "List notes on a contact, newest first.",
  input_schema: z.object({
    contact_id: z.number(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  output_schema: z.array(z.object({
    id: z.number(), text: z.string().nullable(), date: z.string(), status: z.string().nullable(),
  })),
  kind: "read", reversible: true, cost_estimate: "low",
  handler: async ({ contact_id, limit }, ctx) => {
    const { data, error } = await ctx.supabase.from("contact_notes")
      .select("id,text,date,status").eq("contact_id", contact_id)
      .order("date", { ascending: false }).limit(limit);
    if (error) throw error;
    return data ?? [];
  },
};

export const list_contact_emails: ToolDefinition = {
  name: "list_contact_emails",
  description: "List email messages linked to a contact, newest first.",
  input_schema: z.object({
    contact_id: z.number(),
    unread_only: z.boolean().default(false),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  output_schema: z.array(z.object({
    id: z.number(), subject: z.string().nullable(), from_email: z.string(),
    date: z.string(), is_read: z.boolean(), text_body_excerpt: z.string().nullable(),
  })),
  kind: "read", reversible: true, cost_estimate: "low",
  handler: async (args, ctx) => {
    const q = ctx.supabase.from("email_messages")
      .select("id,subject,from_email,date,is_read,text_body")
      .eq("contact_id", args.contact_id)
      .order("date", { ascending: false }).limit(args.limit);
    if (args.unread_only) q.eq("is_read", false);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      ...r,
      text_body_excerpt: r.text_body ? r.text_body.slice(0, 500) : null,
      text_body: undefined,
    }));
  },
};

export const list_contact_recordings: ToolDefinition = {
  name: "list_contact_recordings",
  description: "List audio recordings on a contact with transcription/summary status.",
  input_schema: z.object({ contact_id: z.number() }),
  output_schema: z.array(z.object({
    id: z.number(), duration_seconds: z.number().nullable(),
    transcription_status: z.string(), has_summary: z.boolean(),
    created_at: z.string(),
  })),
  kind: "read", reversible: true, cost_estimate: "low",
  handler: async ({ contact_id }, ctx) => {
    const { data, error } = await ctx.supabase.from("contact_recordings")
      .select("id,duration_seconds,transcription_status,summary,created_at")
      .eq("contact_id", contact_id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id, duration_seconds: r.duration_seconds,
      transcription_status: r.transcription_status,
      has_summary: Boolean(r.summary), created_at: r.created_at,
    }));
  },
};
```

**companies.ts** — mêmes patterns :
- `search_companies(query, sector?, limit)` → list id, name, sector, size, lead_source
- `get_company(id)` → record complet
- `list_company_deals(company_id)` → deals liés
- `list_company_contacts(company_id)` → contacts liés

**deals.ts** :
- `search_deals(stage?, sales_id?, updated_since?, limit)` → id, name, stage, amount, company_name
- `get_deal(id)`
- `list_deal_notes(deal_id, limit)`
- `update_deal(id, patch)` — patch limité à : description, amount, expected_closing_date, category
- `move_deal_stage(id, stage)` — **refuse `won`/`lost`** en v1 (hors whitelist réversible)
- `add_deal_note(deal_id, text, type)` — reversible (delete note créée)

**tasks.ts** :
- `search_tasks(assignee?, done?, overdue?, limit)`
- `get_task(id)`
- `create_task(contact_id, text, type, due_date)` — reversible
- `complete_task(id)` — reversible (reset `done_date`)
- `reschedule_task(id, new_due_date)` — reversible (restore old due_date)

**notes.ts** :
- `add_contact_note(contact_id, text, status?)` — reversible
- `add_deal_note(deal_id, text, type?)` — reversible

**recordings.ts** :
- `get_recording(id)` — incluant transcription, summary, email_advice, sms_advice
- `get_transcription(recording_id)`

**emails.ts** :
- `search_emails(contact_id?, unread?, query?, limit)`
- `get_email(id)`
- `link_email_to_contact(email_id, contact_id)` — reversible (set back to null)
- `mark_email_read(email_id)` — reversible

**tags.ts** :
- `list_tags()`
- `apply_tag(entity_type: 'contact'|'deal', entity_id, tag_id)` — reversible
- `remove_tag(entity_type, entity_id, tag_id)` — reversible

**activity.ts** :
- `get_recent_activity(since, until, types?, limit)` — lit les sources agrégées (nouveau : peut agréger notes, deals, contacts sur une fenêtre)

### Tests

`registry.test.ts` (Deno test) :
- Chaque tool a un name unique
- `input_schema.parse(sample)` et `output_schema.parse(sample)` valident un cas nominal
- `toolsForClaude([...])` produit du JSON Schema valide pour chaque tool
- Handler de `search_contacts` appelle `supabase.from('contacts_summary')`

## Critères d'acceptation

- [ ] Au moins 25 tools exposés, couvrant les domaines cités
- [ ] Chaque tool write a un `undo` implémenté (sauf exceptions documentées)
- [ ] Aucun tool ne fait de DELETE ou de move vers won/lost en v1
- [ ] `toolsForClaude(['search_contacts'])` renvoie un array avec `{name, description, input_schema}` valide
- [ ] Un tool appelé sans JWT user échoue (RLS)
- [ ] Tous les outputs sont JSON-sérialisables (test sur chaque handler)
- [ ] `make typecheck` et `make lint` passent
- [ ] Tests unitaires : `deno test supabase/functions/_shared/tools/`

## Risques / pièges

- Les Zod schemas Deno + zod-to-json-schema : vérifier que les `refine()` ne cassent pas la conversion (fallback sans refine pour Claude)
- `contacts_summary` est une VIEW → pas d'écriture via ce nom
- Attention aux tools qui renvoient de gros blobs (text_body complet d'email) : toujours tronquer côté serveur pour économiser des tokens
- Les tools writes en `dryRun` doivent retourner une forme compatible avec l'output_schema (id = -1 sentinel)

## Done

- Commit : `feat(agentic): add tool registry with 25+ tools for agentic skills`
- Stories B.x peuvent commencer à référencer les tools par nom
