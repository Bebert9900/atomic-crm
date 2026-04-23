import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";

const Input = z.object({ email_id: z.number() });
const Output = z.object({
  contact_id: z.number().nullable(),
  contact_created: z.boolean(),
  email_linked: z.boolean(),
  deal_id: z.number().nullable(),
  tasks_created: z.array(z.number()),
  classification: z.enum([
    "lead_inbound",
    "existing_customer_request",
    "existing_customer_update",
    "internal",
    "unrelated",
    "spam",
  ]),
  rationale: z.string(),
});

export const handleIncomingEmailSkill: SkillManifest<
  z.infer<typeof Input>,
  z.infer<typeof Output>
> = {
  id: "handle_incoming_email",
  version: "1.0.0",
  model: "claude-opus-4-7",
  description:
    "Classifies an incoming email, matches/creates the contact, links the email, creates follow-up tasks.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: [
    "get_email",
    "search_contacts",
    "get_contact",
    "search_companies",
    "get_company",
    "list_contact_tasks",
    "list_contact_emails",
    "search_deals",
    "get_deal",
    "list_company_deals",
    "create_contact",
    "update_contact",
    "link_email_to_contact",
    "mark_email_read",
    "create_task",
    "apply_tag",
    "list_tags",
  ],
  max_iterations: 12,
  max_writes: 6,
  rate_limit: { per_minute: 5, per_hour: 100 },
  system_prompt: `You triage incoming emails for a CRM sales team.

Steps:
1. get_email(email_id). Read from_email, subject, body_excerpt.
2. If the email is clearly automated (no-reply, noreply, bounces@,
   daemon, newsletter signals in subject) → classification='spam',
   contact_id=null, contact_created=false, email_linked=false,
   tasks_created=[], no writes except mark_email_read.
3. Otherwise search_contacts with email substring (part before @)
   and then with sender display name.
4. If no match AND email looks like a real human (not automated),
   create_contact with at least the email and any obvious name
   from from_email/from_name.
5. If contact identified, link_email_to_contact(email_id, contact_id).
6. Classify into one of:
   lead_inbound | existing_customer_request | existing_customer_update
   | internal | unrelated | spam.
7. If the email mentions an ongoing project/deal, search_deals on
   contact's company to identify deal_id. Never create a deal.
8. Create follow-up task per classification:
   - lead_inbound: 1 task "Qualify lead" due +1 business day
   - existing_customer_request: 1 task "Respond to request" due today
   - existing_customer_update: 1 task "Review update" due +2 business days
   - others: no task
9. mark_email_read(email_id) at the end.

Max 2 tasks. Never send emails. Never invent company/deal/contact
attributes not derivable from the email.

Return JSON in a \`\`\`json code block matching the output schema.`,
};
