import { z } from "npm:zod@^3.25";
import { zodToJsonSchema } from "npm:zod-to-json-schema@^3.23";
import type { SkillManifest } from "./types.ts";
import { isWriteTool, tools as toolRegistry } from "../tools/registry.ts";
import { makeSupabaseForUser } from "../../agent-runtime/runPersistence.ts";
import { anthropicProvider } from "../llm/anthropic.ts";
import { deepseekProvider } from "../llm/deepseek.ts";
import { openrouterProvider } from "../llm/openrouter.ts";
import { getUserApiKey } from "../userKeys/apiKeys.ts";
import { getValidAnthropicToken } from "../oauth/anthropic.ts";
import type { LLMProvider, ToolResultEntry } from "../llm/types.ts";

const DEFAULT_MODELS = {
  anthropic: "claude-sonnet-4-6",
  deepseek: "deepseek-chat",
  openrouter: "openai/gpt-4o-mini",
} as const;

const Input = z.object({
  conversation_id: z.string().uuid().optional(),
  message: z.string().min(1).max(10_000),
  context: z
    .object({
      page: z.string().optional(),
      entity_type: z.string().optional(),
      entity_id: z.union([z.string(), z.number()]).optional(),
      entity_label: z.string().optional(),
    })
    .optional(),
});

const Output = z.object({
  conversation_id: z.string().uuid(),
  assistant_text: z.string(),
});

const TOOLS_ALLOWED = [
  // ─── reads ───
  "search_contacts",
  "get_contact",
  "find_duplicate_contacts",
  "search_deals",
  "get_deal",
  "search_companies",
  "get_company",
  "search_tasks",
  "get_task",
  "search_emails",
  "get_email",
  "search_appointments",
  "get_appointment",
  "find_free_slots",
  "search_dev_tasks",
  "get_dev_task",
  "list_dev_task_labels",
  "get_recent_activity",
  "get_activity_log",
  "get_posthog_activity",
  "list_my_day",
  "get_pipeline_kpis",
  "get_my_kpis",
  "list_integrations",
  "search_recordings",
  "list_unread_emails",
  "list_contact_notes",
  "list_deal_notes",
  "list_contact_emails",
  "list_contact_tasks",
  "list_contact_recordings",
  "list_contact_plans",
  "list_contact_video_conferences",
  "get_video_conference",
  "get_contact_timeline",
  "get_company_timeline",
  "list_company_contacts",
  "list_company_deals",
  "list_tags",
  "list_email_accounts",
  "list_subscriptions",
  "get_subscription",
  "list_payments",
  "get_recording",
  "get_transcription",
  // ─── safe writes (low risk, no approval needed) ───
  "create_contact",
  "create_task",
  "complete_task",
  "reschedule_task",
  "add_contact_note",
  "add_deal_note",
  "create_company",
  "update_company",
  "create_tag",
  "apply_tag",
  "remove_tag",
  "update_note",
  "delete_note",
  "mark_email_read",
  "draft_email_reply",
  "link_email_to_contact",
  // ─── sales / assignment ───
  "list_sales",
  "assign_contact_to_sale",
  "assign_deal_to_sale",
  "assign_task_to_sale",
  "assign_company_to_sale",
  // ─── finance ───
  "get_finance_metrics",
  "get_treasury",
  "list_recent_payments",
  "list_recent_payouts",
  // ─── emails (extended) ───
  "list_email_threads",
  "get_thread",
  "move_email_folder",
  "bulk_mark_emails_read",
  // ─── orchestration ───
  "run_skill",
  // ─── approval workflow (for sensitive writes via crm:approve) ───
  "request_approval",
  // ─── proactive scheduling ───
  "schedule_skill_at",
  "cancel_scheduled_action",
  "list_my_scheduled_actions",
];

const SYSTEM_PROMPT = `Tu es l'assistant IA intégré au CRM "Atomic CRM". Tu aides l'utilisateur (un commercial) à comprendre et agir sur son CRM.

Principes :
- Réponds en français, concis, style direct.
- Cite les entités par leur nom (contact, deal, company), pas par id.
- Utilise les tools pour lire le CRM avant de répondre à une question factuelle.
- Tu peux créer des tasks ou des notes quand c'est utile, mais préviens avant (courtement).
- Pour les **updates sensibles** (changer un stage, un owner, une amount, send_email, merge, delete, réassigner, créer/modifier/annuler un RDV, créer/modifier une tâche dev…), procède en 2 étapes :
  1) Appelle \`request_approval\` avec \`kind\` (un de : \`update_deal\`, \`move_deal_stage\`, \`update_contact\`, \`merge_contacts\`, \`update_company\`, \`delete_note\`, \`send_email\`, \`create_appointment\`, \`update_appointment\`, \`cancel_appointment\`, \`create_dev_task\`, \`update_dev_task\`, \`archive_dev_task\`, \`assign_*_to_sale\`), \`payload\` (les arguments du tool), \`summary\` court.
  2) Émets ensuite un bloc \`crm:approve\` qui inclut \`approval_id\` (renvoyé par \`request_approval\`), un \`title\`, un \`description\`, et le \`diff\` à montrer à l'utilisateur. Quand il clique 'Valider', le backend exécute pour toi via le tool registry.
- Pour les **actions à risque faible** (créer un contact, créer une note, créer une tâche, marquer une tâche faite, draft un mail, appliquer/retirer un tag, lier un mail à un contact, mark email read), tu peux exécuter le tool directement sans approval — utilise toujours le tool dédié (\`create_contact\`, \`complete_task\`, \`apply_tag\`, etc.) plutôt que d'émettre un bloc.
- Tu peux émettre un bloc \`crm:actions\` (suggestions cliquables) sans approval pour les actions read-only ou très légères.
- Si l'utilisateur consulte une fiche (contexte fourni), considère-la comme le focus par défaut.
- Pour les demandes complexes qui mappent sur une skill métier (brief journée, revue pipeline, triage backlog dev, qualification d'un contact, brief avant RDV, détection de churn…), délègue via le tool \`run_skill\` (ex: \`morning_brief_ds\`, \`weekly_pipeline_review\`, \`triage_dev_tasks\`, \`qualify_inbound_contact\`, \`prepare_meeting_brief\`, \`detect_churn_risk\`). Max 3 délégations par tour, pas de doublon.
- Tu peux désormais créer/modifier des **companies**, créer des **tags**, modifier/supprimer des **notes**, et **réassigner** contacts/deals/tasks/companies à un autre sales (utilise \`list_sales\` pour connaître l'équipe).
- Pour **résumer l'historique d'échanges** avec un contact ou une company (mails + appels + visios + notes + RDV fusionnés), utilise \`get_contact_timeline(contact_id)\` ou \`get_company_timeline(company_id)\` — UNE seule tool call au lieu d'enchaîner list_contact_emails + list_contact_recordings + etc.
- Tu peux **planifier** des actions futures avec \`schedule_skill_at(skill_id, input, when_iso)\` (ex: "rappelle-moi de relancer X dans 3 jours" → schedule_skill_at avec une skill comme \`prepare_meeting_brief\` ou \`stale_deal_watchdog\` et un \`when_iso\` ISO 8601). Liste les actions planifiées avec \`list_my_scheduled_actions\`, annule avec \`cancel_scheduled_action\`.

## Formats de rendu riches

En plus du markdown (titres ##, listes, gras, tableaux GFM), tu peux émettre des blocs spéciaux pour enrichir la réponse. Utilise-les dès qu'ils apportent de la clarté. Chaque bloc est un fence markdown avec langage \`crm:<kind>\` et payload JSON valide.

**\`crm:table\`** — dès qu'il y a 3+ lignes tabulaires (deals, contacts, tasks…). Préfère ce bloc à un tableau GFM : il se déplie en plein écran avec tri/filtre/export.
\`\`\`crm:table
{
  "title": "Deals à relancer",
  "columns": [
    {"key":"name","label":"Deal"},
    {"key":"company","label":"Société"},
    {"key":"amount","label":"Montant","align":"right"},
    {"key":"stage","label":"Étape"}
  ],
  "rows": [
    {"id":1,"name":"Renouvellement Acme","company":"Acme","amount":"45 k€","stage":"Proposition"}
  ],
  "entityType":"deal",
  "rowLinkKey":"id"
}
\`\`\`

**\`crm:dashboard\`** — pour les briefs, résumés, KPIs. Scanable en 3 secondes.
\`\`\`crm:dashboard
{
  "title": "Ta journée",
  "kpis": [
    {"label":"Tâches aujourd'hui","value":3,"tone":"ok"},
    {"label":"En retard","value":2,"tone":"warn"},
    {"label":"Deals chauds","value":5}
  ],
  "bars": [
    {"label":"Discovery","value":2},
    {"label":"Proposition","value":1}
  ]
}
\`\`\`

**\`crm:kanban\`** — quand l'utilisateur parle pipeline, étapes, flow de deals.
\`\`\`crm:kanban
{
  "columns":[
    {"key":"lead","title":"Lead","count":1,"amount":"15 k€","deals":[{"id":6,"name":"Atelier Lumière","company":"Atelier Lumière","amount":"15 k€"}]},
    {"key":"qualified","title":"Qualifié","count":1,"deals":[{"id":2,"name":"POC Globex","amount":"25 k€"}]}
  ]
}
\`\`\`

**\`crm:actions\`** — quand tu listes des entités avec des actions suggérées (relancer, appeler, ouvrir, mettre à jour).
\`\`\`crm:actions
{
  "title":"À relancer cette semaine",
  "items":[
    {"label":"Marie Dubois — Acme","reason":"Décision prévue fin de mois","entity":{"type":"contact","id":1},"actions":[{"kind":"call"},{"kind":"email"},{"kind":"open"}]},
    {"label":"Deal Globex — POC en stagnation","entity":{"type":"deal","id":42},"actions":[
      {"kind":"open"},
      {"kind":"update","label":"Passer en 'won'","patch":{"stage":"won"}},
      {"kind":"task","label":"Tâche relance","task":{"name":"Relancer Globex","type":"call"}},
      {"kind":"note","label":"Note","note":{"text":"À relancer la semaine prochaine"}}
    ]}
  ]
}
\`\`\`
Kinds disponibles : \`open\`, \`email\`, \`call\`, \`update\` (avec \`patch\`), \`task\` (avec \`task.name\`), \`note\` (avec \`note.text\`). Tous les kinds destructifs (update/task/note) demandent confirmation à l'utilisateur avant d'être exécutés côté frontend.

**\`crm:approve\`** — pour une action ponctuelle qui mérite preview détaillée. **Workflow recommandé** : appelle d'abord \`request_approval(kind, payload, summary)\`, récupère l'\`approval_id\`, puis émets ce bloc avec ce même \`approval_id\`. Le backend exécutera l'action quand l'utilisateur clique Valider.
\`\`\`crm:approve
{
  "approval_id":"<uuid renvoyé par request_approval>",
  "title":"Marquer le deal Acme comme gagné",
  "description":"Le deal change de stage et la date de clôture est mise à aujourd'hui.",
  "diff":[
    {"field":"stage","before":"Proposition","after":"won"},
    {"field":"closed_at","after":"2026-04-27"}
  ]
}
\`\`\`
Le champ \`action\` (legacy) reste supporté pour les rares cas non couverts par les tools backend, mais préfère systématiquement \`request_approval\` + \`approval_id\`.

**\`crm:fullscreen\`** — pour rapports longs (brief hebdo, analyse détaillée) : l'utilisateur peut ouvrir en plein écran avec impression/export.
\`\`\`crm:fullscreen
{
  "title":"Brief hebdomadaire",
  "sections":[{"title":"Pipeline","content":"..."},{"title":"Risques","content":"..."}]
}
\`\`\`

**Règles** :
- Un bloc par vue. N'emballe pas chaque ligne dans un bloc séparé.
- Texte markdown avant/après pour contextualiser (ex: "Voici les deals, focus sur Acme :").
- Si 1-2 items seulement, reste en markdown simple sans bloc.
- Pour une question qualitative (avis, reco), reste en markdown narratif.`;

function buildContextPreamble(ctx?: z.infer<typeof Input>["context"]): string {
  if (!ctx || (!ctx.page && !ctx.entity_type)) return "";
  const bits: string[] = [];
  if (ctx.entity_type && ctx.entity_id) {
    bits.push(
      `L'utilisateur consulte actuellement ${ctx.entity_type} #${ctx.entity_id}${
        ctx.entity_label ? ` (${ctx.entity_label})` : ""
      }.`,
    );
  }
  if (ctx.page && !ctx.entity_type) {
    bits.push(`L'utilisateur est sur la page "${ctx.page}".`);
  }
  return bits.length ? `\n\nContexte courant : ${bits.join(" ")}` : "";
}

type DbMessage = {
  id: number;
  role: "user" | "assistant" | "tool";
  content: string | null;
};

export const chatWithCrmSkill: SkillManifest<
  z.infer<typeof Input>,
  z.infer<typeof Output>
> = {
  id: "chat_with_crm",
  version: "1.0.0",
  model: "claude-sonnet-4-6",
  description:
    "Chat conversationnel multi-tour avec accès aux données du CRM (lectures + création de tâches et de notes).",
  input_schema: Input,
  output_schema: Output,
  tools_allowed: TOOLS_ALLOWED,
  max_iterations: 10,
  max_writes: 3,
  rate_limit: { per_minute: 20, per_hour: 200 },
  system_prompt: SYSTEM_PROMPT,
  execute: async (execCtx) => {
    const { input, auth, runId, emit, appendStep } = execCtx;
    const supabase = makeSupabaseForUser(auth.token);

    // 1. Resolve or create conversation
    let conversationId = input.conversation_id;
    if (!conversationId) {
      const title = input.message.slice(0, 60).replace(/\s+/g, " ").trim();
      const { data: conv, error } = await supabase
        .from("chat_conversations")
        .insert({
          user_id: auth.userId,
          tenant_id: auth.tenantId ?? null,
          title: title || "Nouvelle conversation",
          context: input.context ?? {},
        })
        .select("id")
        .single();
      if (error)
        throw new Error(`create_conversation_failed: ${error.message}`);
      conversationId = conv.id as string;
      emit({
        event: "conversation.created",
        data: { conversation_id: conversationId },
      });
    }

    // 2. Load history (last 30 messages, oldest first)
    const { data: history } = await supabase
      .from("chat_messages")
      .select("id, role, content")
      .eq("conversation_id", conversationId)
      .order("id", { ascending: false })
      .limit(30);
    const priorMessages = ((history ?? []) as DbMessage[])
      .filter((m) => m.role !== "tool" && (m.content ?? "").length > 0)
      .reverse()
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content ?? "",
      }));

    // 3. Insert user message immediately
    await supabase.from("chat_messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: input.message,
    });

    // 4. Pick provider. Priority order:
    //    1. OAuth Anthropic (user's Claude subscription quota)
    //    2. User-configured API keys (Anthropic → DeepSeek → OpenRouter)
    //    3. Server env vars (Anthropic → DeepSeek → OpenRouter)
    const [userOAuth, userAnthropic, userDeepseek, userOpenrouter] =
      await Promise.all([
        getValidAnthropicToken(auth.userId),
        getUserApiKey(auth.userId, "anthropic"),
        getUserApiKey(auth.userId, "deepseek"),
        getUserApiKey(auth.userId, "openrouter"),
      ]);

    let provider: LLMProvider;
    let model: string;
    let apiKey: string | undefined;
    let userOAuthToken: string | undefined;
    let keySource: "oauth" | "user" | "server";

    if (userOAuth) {
      provider = anthropicProvider;
      model = DEFAULT_MODELS.anthropic;
      userOAuthToken = userOAuth.accessToken;
      keySource = "oauth";
      emit({
        event: "auth.mode",
        data: {
          mode: "oauth",
          provider: "anthropic",
          subscription: userOAuth.subscriptionType,
          model,
        },
      });
    } else if (userAnthropic) {
      provider = anthropicProvider;
      model = userAnthropic.model ?? DEFAULT_MODELS.anthropic;
      apiKey = userAnthropic.apiKey;
      keySource = "user";
    } else if (userDeepseek) {
      provider = deepseekProvider;
      model = userDeepseek.model ?? DEFAULT_MODELS.deepseek;
      apiKey = userDeepseek.apiKey;
      keySource = "user";
    } else if (userOpenrouter) {
      provider = openrouterProvider;
      model = userOpenrouter.model ?? DEFAULT_MODELS.openrouter;
      apiKey = userOpenrouter.apiKey;
      keySource = "user";
    } else if (anthropicProvider.hasApiKey()) {
      provider = anthropicProvider;
      model = DEFAULT_MODELS.anthropic;
      keySource = "server";
    } else if (deepseekProvider.hasApiKey()) {
      provider = deepseekProvider;
      model = DEFAULT_MODELS.deepseek;
      keySource = "server";
    } else if (openrouterProvider.hasApiKey()) {
      provider = openrouterProvider;
      model = DEFAULT_MODELS.openrouter;
      keySource = "server";
    } else {
      throw new Error(
        "no_credentials: connect your Anthropic account or configure an API key in Settings → AI Providers",
      );
    }
    if (keySource !== "oauth") {
      emit({
        event: "auth.mode",
        data: { mode: keySource, provider: provider.id, model },
      });
    }
    const descriptors = TOOLS_ALLOWED.map((n) => {
      const t = toolRegistry[n];
      if (!t) throw new Error(`Unknown tool: ${n}`);
      return {
        name: t.name,
        description: t.description,
        input_schema: zodToJsonSchema(t.input_schema, {
          target: "jsonSchema7",
          $refStrategy: "none",
        }) as Record<string, unknown>,
      };
    });

    const systemWithCtx = SYSTEM_PROMPT + buildContextPreamble(input.context);
    let messages: unknown[] = [
      ...priorMessages,
      { role: "user", content: input.message },
    ];

    await appendStep({
      step: 0,
      type: "user",
      content: input.message,
      ts: new Date().toISOString(),
    });

    // 5. Tool-use loop
    let finalText = "";
    let iteration = 0;
    let writes = 0;
    const MAX_ITER = 10;
    const MAX_WRITES = 3;

    // Orchestrator state: bounds nested skill calls + dedupes them
    const orchestrator = {
      calls: new Set<string>(),
      maxCalls: 3,
      depth: 0,
    };
    // Loop guard: same tool + same args twice in a turn → block
    const toolCallSeen = new Set<string>();

    while (iteration < MAX_ITER) {
      iteration++;
      const response = await provider.createCompletion({
        model,
        system: systemWithCtx,
        messages,
        tools: descriptors,
        maxTokens: 4096,
        apiKey,
        userOAuthToken,
      });

      messages = [...messages, response.rawAssistantMessage];

      if (response.text) {
        finalText = response.text;
        await appendStep({
          step: iteration,
          type: "assistant_text",
          content: response.text,
          ts: new Date().toISOString(),
        });
        emit({ event: "text", data: { content: response.text } });
      }

      if (response.finishReason !== "tool_use") break;

      const toolResults: ToolResultEntry[] = [];
      for (const call of response.toolCalls) {
        const toolDef = toolRegistry[call.name];
        if (!toolDef || !TOOLS_ALLOWED.includes(call.name)) {
          toolResults.push({
            toolCallId: call.id,
            toolName: call.name,
            content: `Error: tool not allowed`,
            isError: true,
          });
          continue;
        }
        // Loop guard: refuse identical tool call (same name + same args) within turn
        const callSig = `${call.name}:${JSON.stringify(call.args ?? {})}`;
        if (toolCallSeen.has(callSig)) {
          toolResults.push({
            toolCallId: call.id,
            toolName: call.name,
            content: `Error: duplicate tool call rejected (same name and args already executed in this turn)`,
            isError: true,
          });
          continue;
        }
        toolCallSeen.add(callSig);
        if (isWriteTool(call.name)) {
          if (writes >= MAX_WRITES) {
            toolResults.push({
              toolCallId: call.id,
              toolName: call.name,
              content: `Error: max write actions reached`,
              isError: true,
            });
            continue;
          }
          writes++;
        }

        emit({ event: "tool_use", data: { name: call.name, args: call.args } });
        await appendStep({
          step: iteration,
          type: "tool_use",
          tool: call.name,
          args: call.args,
          tool_use_id: call.id,
          ts: new Date().toISOString(),
        });
        try {
          const parsedArgs = toolDef.input_schema.parse(call.args);
          const result = await toolDef.handler(parsedArgs, {
            auth,
            supabase,
            runId,
            dryRun: false,
            orchestrator,
          });
          emit({ event: "tool_result", data: { name: call.name, result } });
          await appendStep({
            step: iteration,
            type: "tool_result",
            tool_use_id: call.id,
            result,
            status: "ok",
            ts: new Date().toISOString(),
          });
          toolResults.push({
            toolCallId: call.id,
            toolName: call.name,
            content: JSON.stringify(result),
            isError: false,
          });
        } catch (err) {
          toolResults.push({
            toolCallId: call.id,
            toolName: call.name,
            content: `Error: ${String(err)}`,
            isError: true,
          });
        }
      }
      messages = provider.appendToolResults(messages, toolResults);
    }

    if (!finalText) finalText = "(pas de réponse)";

    // 6. Persist assistant message
    await supabase.from("chat_messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: finalText,
      skill_run_id: runId,
    });

    return { conversation_id: conversationId, assistant_text: finalText };
  },
};
