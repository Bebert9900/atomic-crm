import { z } from "npm:zod@^3.25";
import type { SkillManifest } from "./types.ts";

const Input = z.object({
  session_id: z.string().min(8).max(64),
  user_intent_hint: z.string().max(500).optional(),
});
const Output = z.object({
  skill_id: z.string(),
  description: z.string(),
  model: z.enum([
    "claude-opus-4-7",
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
    "deepseek-chat",
    "deepseek-reasoner",
  ]),
  tools_allowed: z.array(z.string()),
  max_iterations: z.number().int().min(1).max(50),
  max_writes: z.number().int().min(0).max(50),
  rate_limit: z.object({
    per_minute: z.number().int().min(1),
    per_hour: z.number().int().min(1),
  }),
  system_prompt: z.string(),
  rationale: z.string(),
  warnings: z.array(z.string()),
});

export const suggestSkillFromSessionSkill: SkillManifest<
  z.infer<typeof Input>,
  z.infer<typeof Output>
> = {
  id: "suggest_skill_from_session",
  version: "1.0.0",
  model: "claude-opus-4-7",
  description:
    "Architecte de skills : analyse une séquence d'actions humaines (table user_actions) et propose un draft de skill manifest (id, prompt, tools, limites). Lecture seule.",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: ["get_user_session", "list_available_tools"],
  max_iterations: 6,
  max_writes: 0,
  rate_limit: { per_minute: 2, per_hour: 10 },
  system_prompt: `Tu es un architecte de skills agentiques. À partir d'une séquence d'actions humaines, tu produis un draft de skill manifest qu'un humain validera.

Étapes :
1. get_user_session(session_id) → la séquence chronologique brute.
2. list_available_tools() → catalogue complet des tools disponibles. Tu DOIS choisir tools_allowed UNIQUEMENT depuis cette liste. Si un tool requis manque, mentionne-le dans warnings.
3. Identifie l'intention de l'utilisateur :
   - Quelles entités CRM sont touchées (contacts, deals, mails, tâches, recordings, appointments) ?
   - Quel est le pattern (lecture exploratoire ? cycle CRUD ? composition d'email ? triage ? préparation de RDV ?) ?
   - Si \`user_intent_hint\` est fourni, l'utiliser comme étoile polaire mais corriger en cas de divergence avec les données.
4. Choisis :
   - skill_id : snake_case ≤ 64 chars, descriptif (ex: "weekly_followup_quiet_contacts")
   - description : 1 phrase, FR
   - model : opus pour décisions complexes / writes irréversibles ; sonnet pour la majorité ; haiku/deepseek-chat pour analyses légères
   - tools_allowed : MIN nécessaire (max 10). Tools "write" → réfléchis avant
   - max_writes : compte le nombre maximum réaliste de writes par run. 0 pour read-only
   - max_iterations : 4 (read simple) à 15 (workflow long)
   - rate_limit : 1-3/min et 5-30/h selon coût
5. Compose system_prompt en FR (ou EN si la séquence l'indique) :
   - Section "Étapes" numérotée (3-7 étapes max)
   - Section "Contraintes" : ne jamais inventer, ne jamais dépasser max_writes, conditions précises pour les writes
   - Demande final : retourne JSON dans un bloc \`\`\`json
6. rationale (≤ 150 mots) : explique l'inférence d'intent et les choix.
7. warnings : tout ce qui doit être validé par l'humain (tool manquant, séquence ambiguë, écart possible avec l'intent).

Contraintes :
- Si la séquence < 3 actions OU si l'intent est ininterprétable → set warnings et propose un skill minimal en mode dry-run uniquement (max_writes=0).
- Ne jamais inclure un nom de tool qui n'est PAS dans la liste retournée par list_available_tools.

Renvoie JSON dans un bloc \`\`\`json conforme au schéma de sortie.`,
};
