import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";
import { makeSupabaseForUser } from "../../agent-runtime/runPersistence.ts";

const Input = z.object({
  sales_id: z.number().int().optional(),
  days: z.number().int().min(1).max(30).default(7),
  min_batch_size: z.number().int().min(2).max(50).default(3),
});

const Output = z.object({
  approval_id: z.string().nullable(),
  task_id: z.number().nullable(),
  total_emails: z.number(),
  proposal_summary: z.string(),
  by_sender: z.array(
    z.object({
      sender: z.string(),
      count: z.number(),
    }),
  ),
});

// Heuristics: known marketing/automation senders (lowercase, domain or substring match)
const MARKETING_DOMAINS = [
  "instantly.ai",
  "instantly.app",
  "lemlist.com",
  "mailchimp.com",
  "mailchi.mp",
  "sendinblue.com",
  "sendgrid.net",
  "mailgun",
  "hubspot",
  "intercom",
  "klaviyo",
  "activecampaign",
  "convertkit",
  "constantcontact",
  "mailerlite",
  "postmark",
  "amazonses.com",
  "amazonaws.com",
];

// Subject patterns that often indicate bulk/marketing
const MARKETING_SUBJECT_PATTERNS = [
  /\bunsubscribe\b/i,
  /\bnewsletter\b/i,
  /\bne plus recevoir\b/i,
  /\bse désabonner\b/i,
  /\b\d+%\s*(off|de réduction|de remise)\b/i,
  /^(re:\s*)?(black\s*friday|cyber\s*monday)/i,
  /webinar|webinaire/i,
];

function isLikelyMarketing(
  fromEmail: string | null,
  subject: string | null,
): { isMarketing: boolean; reason: string } {
  if (!fromEmail) return { isMarketing: false, reason: "" };
  const fe = fromEmail.toLowerCase();
  const fromDomain = fe.split("@")[1] ?? fe;

  for (const dom of MARKETING_DOMAINS) {
    if (fromDomain.includes(dom)) {
      return { isMarketing: true, reason: `domain:${dom}` };
    }
  }
  // common bulk patterns in local-part
  if (
    /^(no[-._]?reply|noreply|donot[-._]?reply|news|newsletter|info|hello|contact|support)@/i.test(
      fe,
    ) &&
    subject &&
    MARKETING_SUBJECT_PATTERNS.some((p) => p.test(subject))
  ) {
    return { isMarketing: true, reason: "bulk_pattern" };
  }
  // subject signal alone is weaker — require List-Unsubscribe-style words
  if (subject && /unsubscribe|se désabonner|ne plus recevoir/i.test(subject)) {
    return { isMarketing: true, reason: "unsubscribe_in_subject" };
  }
  return { isMarketing: false, reason: "" };
}

export const inboxCleanupProposalSkill: SkillManifest<
  z.infer<typeof Input>,
  z.infer<typeof Output>
> = {
  id: "inbox_cleanup_proposal",
  version: "1.0.0",
  model: "claude-sonnet-4-6",
  description:
    "Détecte les emails marketing/newsletter dans la boîte d'un sales (par heuristiques sender/subject) et propose un bulk move vers le dossier 'Junk'. Crée un pending_approval + une tâche CRM contenant un marker [agent_approval:UUID] pour validation depuis 'À faire'.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: [],
  max_iterations: 0,
  max_writes: 0,
  rate_limit: { per_minute: 5, per_hour: 30 },
  system_prompt: "",
  execute: async (ctx) => {
    const supa = makeSupabaseForUser(ctx.auth.token);
    const { sales_id, days, min_batch_size } = ctx.input;
    const since = new Date(Date.now() - days * 86400_000).toISOString();

    let q = supa
      .from("email_messages")
      .select("id,from_email,from_name,subject,date,folder,sales_id")
      .ilike("folder", "%inbox%")
      .gte("date", since)
      .order("date", { ascending: false })
      .limit(500);
    if (sales_id) q = q.eq("sales_id", sales_id);
    const { data: emails, error } = await q;
    if (error) throw error;

    const candidates: Array<{
      id: number;
      from_email: string;
      reason: string;
    }> = [];
    const senderCounts = new Map<string, number>();
    for (const e of (emails ?? []) as Array<{
      id: number;
      from_email: string | null;
      subject: string | null;
    }>) {
      const { isMarketing, reason } = isLikelyMarketing(
        e.from_email,
        e.subject,
      );
      if (!isMarketing || !e.from_email) continue;
      candidates.push({ id: e.id, from_email: e.from_email, reason });
      const dom = (
        e.from_email.toLowerCase().split("@")[1] ?? e.from_email
      ).trim();
      senderCounts.set(dom, (senderCounts.get(dom) ?? 0) + 1);
    }

    // Skip noisy proposals (e.g. only 1-2 emails total)
    if (candidates.length < min_batch_size) {
      return {
        approval_id: null,
        task_id: null,
        total_emails: candidates.length,
        proposal_summary:
          candidates.length === 0
            ? "Aucun email marketing détecté."
            : `Seulement ${candidates.length} emails détectés (sous le seuil ${min_batch_size}).`,
        by_sender: [...senderCounts.entries()].map(([sender, count]) => ({
          sender,
          count,
        })),
      };
    }

    const bySender = [...senderCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([sender, count]) => ({ sender, count }));
    const summaryLines = [
      `${candidates.length} emails marketing/newsletter détectés sur ${days} jours.`,
      "",
      "Top expéditeurs :",
      ...bySender.slice(0, 8).map((s) => `- ${s.sender} (${s.count})`),
    ];
    if (bySender.length > 8) {
      summaryLines.push(`- … et ${bySender.length - 8} autres`);
    }
    const summary = summaryLines.join("\n");

    // 1) Create pending approval
    const expiresAt = new Date(Date.now() + 7 * 86400_000).toISOString();
    const { data: approval, error: aerr } = await supa
      .from("agentic_pending_approvals")
      .insert({
        user_id: ctx.auth.userId,
        run_id: ctx.runId,
        kind: "bulk_move_emails",
        payload: {
          ids: candidates.map((c) => c.id),
          folder: "Junk",
        },
        summary: `Ranger ${candidates.length} mails marketing vers Junk`,
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    if (aerr) throw aerr;
    const approvalId = (approval as { id: string }).id;

    // 2) Create CRM task with marker so frontend renders Valider/Refuser inline
    let resolvedSales = sales_id ?? null;
    if (!resolvedSales) {
      const { data: s } = await supa
        .from("sales")
        .select("id")
        .eq("user_id", ctx.auth.userId)
        .maybeSingle();
      resolvedSales = (s as { id: number } | null)?.id ?? null;
    }
    // Need a contact_id (NOT NULL on tasks). Use the sales's first contact, or skip.
    let contactId: number | null = null;
    if (resolvedSales) {
      const { data: c } = await supa
        .from("contacts")
        .select("id")
        .eq("sales_id", resolvedSales)
        .limit(1)
        .maybeSingle();
      contactId = (c as { id: number } | null)?.id ?? null;
    }
    if (!contactId) {
      const { data: c } = await supa
        .from("contacts")
        .select("id")
        .limit(1)
        .maybeSingle();
      contactId = (c as { id: number } | null)?.id ?? null;
    }

    let taskId: number | null = null;
    if (contactId) {
      const taskText = `📨 Tri d'inbox proposé par l'agent\n\n${summary}\n\nAction : déplacer vers le dossier 'Junk'.\n\n[agent_approval:${approvalId}]`;
      const { data: created, error: terr } = await supa
        .from("tasks")
        .insert({
          contact_id: contactId,
          type: "agent",
          text: taskText,
          due_date: new Date().toISOString(),
          sales_id: resolvedSales,
        })
        .select("id")
        .single();
      if (!terr && created) {
        taskId = (created as { id: number }).id;
      } else if (terr) {
        await ctx.appendStep({
          type: "error",
          message: `task insert failed: ${terr.message}`,
        });
      }
    }

    return {
      approval_id: approvalId,
      task_id: taskId,
      total_emails: candidates.length,
      proposal_summary: summary,
      by_sender: bySender,
    };
  },
};
