import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";

const Input = z.object({ contact_id: z.number() });
const Output = z.object({
  company_id: z.number().nullable(),
  company_created: z.boolean(),
  tags_applied: z.array(z.number()),
  background_set: z.boolean(),
  task_id: z.number().nullable(),
  rationale: z.string(),
});

export const qualifyInboundContactSkill: SkillManifest<
  z.infer<typeof Input>,
  z.infer<typeof Output>
> = {
  id: "qualify_inbound_contact",
  version: "1.0.0",
  model: "claude-sonnet-4-6",
  description:
    "Qualifies a freshly-created inbound contact: attaches company, applies tags, sets background, creates first-touch task.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: [
    "get_contact",
    "update_contact",
    "search_companies",
    "get_company",
    "search_contacts",
    "list_tags",
    "apply_tag",
    "create_task",
  ],
  max_iterations: 10,
  max_writes: 5,
  rate_limit: { per_minute: 10, per_hour: 100 },
  system_prompt: `You qualify a freshly-created inbound contact.

Steps:
1. get_contact(contact_id).
2. If contact.company_id is null:
   - Extract email domain from primary email.
   - Skip if domain is public: gmail.com, hotmail.com, outlook.com,
     yahoo.com, icloud.com, proton.me, protonmail.com.
   - Otherwise search_companies with query = domain name without tld.
   - If a company matches, update_contact to link (company_id).
   - If none matches, do NOT create a company (out of v1 scope):
     just note it in rationale.
3. list_tags. Apply at most 2 tags justified by title or company sector.
4. If background is empty and a short 1-line background is inferable
   from title + company name, update_contact to set it. No invented facts.
5. create_task "Premier contact" due in 2 business days.

Rules:
- Max 1 task.
- Never create a company.
- Never invent attributes.
- Return task_id=null ONLY if contact had no identifiable info at all.

Return JSON in \`\`\`json block.`,
};
