import { z } from "npm:zod@^3.25";
import type { ToolDefinition } from "./types.ts";

// Allowed action kinds — must match a tool name in the registry.
// Keep this list narrow: only the high-stakes writes that need user validation.
const APPROVABLE_KINDS = [
  // deals
  "update_deal",
  "move_deal_stage",
  // contacts
  "update_contact",
  "merge_contacts",
  // companies
  "update_company",
  // notes
  "delete_note",
  // emails
  "send_email",
  // appointments (visible externally, often Google-Calendar synced)
  "create_appointment",
  "update_appointment",
  "cancel_appointment",
  // dev tasks (team roadmap → visible to whole team)
  "create_dev_task",
  "update_dev_task",
  "archive_dev_task",
  // assignments
  "assign_contact_to_sale",
  "assign_deal_to_sale",
  "assign_company_to_sale",
  "assign_task_to_sale",
] as const;

export const request_approval: ToolDefinition = {
  name: "request_approval",
  description:
    "Enregistre une action sensible côté serveur en attente de validation utilisateur. Retourne un approval_id à mentionner dans le bloc crm:approve. L'action sera exécutée par le backend quand l'utilisateur clique 'Valider'. Utilise CE tool avant d'émettre un crm:approve pour tout update/delete/send.",
  input_schema: z.object({
    kind: z.enum(APPROVABLE_KINDS),
    payload: z.record(z.unknown()),
    summary: z.string().min(1).max(500),
    ttl_seconds: z.number().int().min(60).max(86400).default(3600),
  }),
  output_schema: z.object({
    approval_id: z.string(),
    expires_at: z.string(),
  }),
  kind: "write",
  reversible: true,
  cost_estimate: "low",
  handler: async ({ kind, payload, summary, ttl_seconds }, ctx) => {
    const expires_at = new Date(Date.now() + ttl_seconds * 1000).toISOString();
    const { data, error } = await ctx.supabase
      .from("agentic_pending_approvals")
      .insert({
        run_id: ctx.runId,
        user_id: ctx.auth.userId,
        tenant_id: ctx.auth.tenantId ?? null,
        kind,
        payload,
        summary,
        expires_at,
      })
      .select("id,expires_at")
      .single();
    if (error) throw error;
    return {
      approval_id: (data as { id: string }).id,
      expires_at: (data as { expires_at: string }).expires_at,
    };
  },
};

export const APPROVABLE_KINDS_LIST = APPROVABLE_KINDS;
