import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { AuthMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SMTP_HOST = Deno.env.get("SMTP_HOST");
const SMTP_PORT = parseInt(Deno.env.get("SMTP_PORT") || "587", 10);
const SMTP_USER = Deno.env.get("SMTP_USER");
const SMTP_PASS = Deno.env.get("SMTP_PASS");

interface SendEmailRequest {
  contact_id: number;
  email_type: string;
  custom_instructions?: string;
  // If provided, skip AI generation and send this directly
  subject?: string;
  body?: string;
  generate_only?: boolean;
}

async function gatherContactContext(contactId: number) {
  // Fetch contact with company
  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("*")
    .eq("id", contactId)
    .single();

  if (!contact) throw new Error("Contact not found");

  // Fetch company
  let company = null;
  if (contact.company_id) {
    const { data } = await supabaseAdmin
      .from("companies")
      .select("*")
      .eq("id", contact.company_id)
      .single();
    company = data;
  }

  // Fetch recent notes (last 20)
  const { data: notes } = await supabaseAdmin
    .from("contact_notes")
    .select("*")
    .eq("contact_id", contactId)
    .order("date", { ascending: false })
    .limit(20);

  // Fetch deals linked to this contact
  const { data: deals } = await supabaseAdmin
    .from("deals")
    .select("*")
    .contains("contact_ids", [contactId]);

  // Fetch tasks
  const { data: tasks } = await supabaseAdmin
    .from("tasks")
    .select("*")
    .eq("contact_id", contactId)
    .order("due_date", { ascending: false })
    .limit(10);

  // Fetch appointments
  const { data: appointments } = await supabaseAdmin
    .from("appointments")
    .select("*")
    .eq("contact_id", contactId)
    .order("start_at", { ascending: false })
    .limit(10);

  // Fetch recordings with transcriptions
  const { data: recordings } = await supabaseAdmin
    .from("contact_recordings")
    .select("*")
    .eq("contact_id", contactId)
    .eq("transcription_status", "completed")
    .order("created_at", { ascending: false })
    .limit(5);

  // Fetch tags
  const { data: tags } = await supabaseAdmin
    .from("tags")
    .select("*")
    .in("id", contact.tags || []);

  return {
    contact,
    company,
    notes,
    deals,
    tasks,
    appointments,
    recordings,
    tags,
  };
}

function buildGeminiPrompt(
  context: Awaited<ReturnType<typeof gatherContactContext>>,
  emailType: string,
  customInstructions?: string,
) {
  const {
    contact,
    company,
    notes,
    deals,
    tasks,
    appointments,
    recordings,
    tags,
  } = context;

  const contactInfo = `
CONTACT:
- Nom: ${contact.first_name} ${contact.last_name}
- Titre: ${contact.title || "Non renseigné"}
- Email(s): ${JSON.stringify(contact.email_jsonb)}
- Téléphone(s): ${JSON.stringify(contact.phone_jsonb)}
- Genre: ${contact.gender || "Non renseigné"}
- Statut: ${contact.status || "Non renseigné"}
- Background: ${contact.background || "Aucun"}
- LinkedIn: ${contact.linkedin_url || "Non renseigné"}
- Premier contact: ${contact.first_seen}
- Dernier contact: ${contact.last_seen}
- Newsletter: ${contact.has_newsletter ? "Oui" : "Non"}
- Tags: ${tags?.map((t: { name: string }) => t.name).join(", ") || "Aucun"}`;

  const companyInfo = company
    ? `
ENTREPRISE:
- Nom: ${company.name}
- Secteur: ${company.sector || "Non renseigné"}
- Taille: ${company.size || "Non renseignée"} employés
- Site web: ${company.website || "Non renseigné"}
- Description: ${company.description || "Non renseignée"}
- Chiffre d'affaires: ${company.revenue || "Non renseigné"}
- Adresse: ${[company.address, company.zipcode, company.city, company.country].filter(Boolean).join(", ") || "Non renseignée"}
- LinkedIn: ${company.linkedin_url || "Non renseigné"}`
    : "\nENTREPRISE: Aucune entreprise associée";

  const notesInfo = notes?.length
    ? `
HISTORIQUE DES NOTES (${notes.length} dernières):
${notes.map((n: { date: string; text: string; status: string }) => `- [${n.date}] ${n.status ? `(${n.status}) ` : ""}${n.text?.substring(0, 300)}`).join("\n")}`
    : "\nNOTES: Aucune note";

  const dealsInfo = deals?.length
    ? `
DEALS EN COURS:
${deals.map((d: { name: string; stage: string; amount: number; category: string; description: string }) => `- ${d.name} | Étape: ${d.stage} | Montant: ${d.amount}€ | Catégorie: ${d.category} | Description: ${d.description || "Aucune"}`).join("\n")}`
    : "\nDEALS: Aucun deal";

  const tasksInfo = tasks?.length
    ? `
TÂCHES:
${tasks.map((t: { type: string; text: string; due_date: string; done_date: string | null }) => `- [${t.done_date ? "✓" : "○"}] ${t.type}: ${t.text} (échéance: ${t.due_date})`).join("\n")}`
    : "\nTÂCHES: Aucune tâche";

  const appointmentsInfo = appointments?.length
    ? `
RENDEZ-VOUS:
${appointments.map((a: { title: string; start_at: string; status: string; description: string | null }) => `- ${a.title} | ${a.start_at} | Statut: ${a.status} | ${a.description || ""}`).join("\n")}`
    : "\nRENDEZ-VOUS: Aucun rendez-vous";

  const recordingsInfo = recordings?.length
    ? `
ENREGISTREMENTS/APPELS:
${recordings.map((r: { created_at: string; summary: string | null; transcription: string | null; email_advice: string | null }) => `- [${r.created_at}] Résumé: ${r.summary || "Aucun"}\n  Conseil email: ${r.email_advice || "Aucun"}\n  Transcription: ${r.transcription?.substring(0, 500) || "Aucune"}`).join("\n")}`
    : "\nENREGISTREMENTS: Aucun enregistrement";

  const emailTypeInstructions: Record<string, string> = {
    prospection:
      "Email de premier contact / prospection. Accroche percutante, présentation de la valeur, call-to-action pour un RDV.",
    follow_up:
      "Email de suivi après un échange (appel, RDV, email précédent). Rappeler les points discutés, proposer les prochaines étapes.",
    relance:
      "Email de relance commerciale. Ton professionnel mais insistant, rappeler la proposition de valeur, créer l'urgence.",
    remerciement:
      "Email de remerciement après un RDV ou un échange. Chaleureux, récapituler les points clés, confirmer les prochaines étapes.",
    proposal:
      "Email d'envoi de proposition commerciale. Professionnel, récapituler les besoins identifiés, présenter la solution.",
    introduction:
      "Email d'introduction / mise en relation. Présenter le contexte, la raison de la mise en relation, faciliter le contact.",
    newsletter:
      "Email de newsletter personnalisé. Contenu à valeur ajoutée, lien avec les intérêts du contact.",
    custom: customInstructions || "Email personnalisé selon les instructions.",
  };

  return `Tu es un expert en rédaction d'emails commerciaux B2B en français. Tu dois rédiger un email ultra-personnalisé en utilisant TOUTES les informations contextuelles disponibles sur ce contact.

TYPE D'EMAIL: ${emailTypeInstructions[emailType] || emailTypeInstructions.custom}

${customInstructions ? `INSTRUCTIONS SPÉCIFIQUES: ${customInstructions}` : ""}

CONTEXTE COMPLET DU CONTACT:
${contactInfo}
${companyInfo}
${notesInfo}
${dealsInfo}
${tasksInfo}
${appointmentsInfo}
${recordingsInfo}

RÈGLES DE RÉDACTION:
- L'email doit être envoyé depuis Faycal de Fabrik (faycal@fabrik.so)
- Utilise un ton professionnel mais humain et chaleureux
- Personnalise au MAXIMUM en utilisant les détails du contexte (notes, appels, deals, RDV passés)
- Si des enregistrements d'appels existent, utilise les conseils email associés
- Adapte le tutoiement/vouvoiement selon le contexte des échanges précédents
- Sois concis mais impactant
- Inclus un call-to-action clair

Réponds STRICTEMENT en JSON valide (sans markdown, sans backticks):
{
  "subject": "L'objet de l'email",
  "body": "Le corps de l'email en texte brut (avec des retours à la ligne \\n)"
}`;
}

async function generateEmail(
  contactId: number,
  emailType: string,
  customInstructions?: string,
) {
  const context = await gatherContactContext(contactId);

  const prompt = buildGeminiPrompt(context, emailType, customInstructions);

  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    },
  );

  if (!geminiResponse.ok) {
    const errorBody = await geminiResponse.text();
    console.error("Gemini API error:", errorBody);
    throw new Error("Failed to generate email with Gemini");
  }

  const result = await geminiResponse.json();
  let text = result.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  text = text
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();

  try {
    return JSON.parse(text) as { subject: string; body: string };
  } catch {
    console.error("Failed to parse Gemini response:", text);
    throw new Error("Failed to parse AI-generated email");
  }
}

interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  displayName?: string | null;
  fromEmail: string;
  skipTlsVerify?: boolean;
}

async function resolveSmtpConfig(salesId: number | null): Promise<SmtpConfig> {
  // Prefer the sales user's own email_account (per-user inbox).
  if (salesId) {
    const { data: account } = await supabaseAdmin
      .from("email_accounts")
      .select(
        "email, smtp_host, smtp_port, imap_host, encrypted_password, skip_tls_verify",
      )
      .eq("sales_id", salesId)
      .eq("is_active", true)
      .maybeSingle();

    if (account?.encrypted_password) {
      const { data: plain, error } = await supabaseAdmin.rpc(
        "decrypt_email_password",
        { encrypted_password: account.encrypted_password },
      );
      if (error) throw new Error(`Decrypt failed: ${error.message}`);
      return {
        host: account.smtp_host || account.imap_host,
        port: account.smtp_port || 465,
        username: account.email,
        password: plain as string,
        fromEmail: account.email,
        skipTlsVerify: account.skip_tls_verify,
      };
    }
  }

  // Fallback: global SMTP env vars (legacy).
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
      "No SMTP configuration: no email_account for this sales user and SMTP_* env vars are missing",
    );
  }
  return {
    host: SMTP_HOST,
    port: SMTP_PORT,
    username: SMTP_USER,
    password: SMTP_PASS,
    fromEmail: SMTP_USER,
  };
}

async function sendViaSMTP(
  config: SmtpConfig,
  to: string,
  subject: string,
  body: string,
) {
  const secure = config.port === 465;
  const client = new SMTPClient({
    connection: {
      hostname: config.host,
      port: config.port,
      tls: secure,
      auth: {
        username: config.username,
        password: config.password,
      },
    },
  });

  const fromHeader = config.displayName
    ? `${config.displayName} <${config.fromEmail}>`
    : config.fromEmail;

  await client.send({
    from: fromHeader,
    to,
    subject,
    content: body,
  });

  await client.close();
}

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return createErrorResponse(405, "Method not allowed");
  }

  const payload: SendEmailRequest = await req.json();
  const { contact_id, email_type, custom_instructions, generate_only } =
    payload;

  if (!contact_id) {
    return createErrorResponse(400, "contact_id is required");
  }
  if (!email_type && !payload.subject) {
    return createErrorResponse(400, "email_type or subject+body is required");
  }

  try {
    let subject = payload.subject;
    let body = payload.body;

    // Generate email with AI if not provided
    if (!subject || !body) {
      const generated = await generateEmail(
        contact_id,
        email_type,
        custom_instructions,
      );
      subject = generated.subject;
      body = generated.body;
    }

    // If generate_only, return without sending
    if (generate_only) {
      return new Response(JSON.stringify({ success: true, subject, body }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get contact email
    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("email_jsonb, first_name, last_name")
      .eq("id", contact_id)
      .single();

    if (!contact?.email_jsonb?.length) {
      return createErrorResponse(400, "Contact has no email address");
    }

    const toEmail = contact.email_jsonb[0].email;

    // Resolve the sales user BEFORE sending so we pick the right SMTP account.
    const authHeader = req.headers.get("Authorization");
    const localClient = (
      await import("jsr:@supabase/supabase-js@2")
    ).createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SB_PUBLISHABLE_KEY") ?? "",
      { global: { headers: { Authorization: authHeader! } } },
    );
    const { data: userData } = await localClient.auth.getUser();
    let salesId: number | null = null;
    let salesName: string | null = null;
    if (userData?.user) {
      const { data: sale } = await supabaseAdmin
        .from("sales")
        .select("id, first_name, last_name")
        .eq("user_id", userData.user.id)
        .single();
      salesId = sale?.id ?? null;
      salesName =
        sale?.first_name || sale?.last_name
          ? `${sale.first_name ?? ""} ${sale.last_name ?? ""}`.trim()
          : null;
    }

    // Send the email using the sales user's own SMTP account (or global fallback).
    const smtpConfig = await resolveSmtpConfig(salesId);
    smtpConfig.displayName = salesName;
    await sendViaSMTP(smtpConfig, toEmail, subject!, body!);

    await supabaseAdmin.from("contact_notes").insert({
      contact_id,
      text: `📧 **Email envoyé** — ${subject}\n\n${body}`,
      sales_id: salesId,
      date: new Date().toISOString(),
    });

    // Update last_seen
    await supabaseAdmin
      .from("contacts")
      .update({ last_seen: new Date().toISOString() })
      .eq("id", contact_id);

    return new Response(
      JSON.stringify({ success: true, subject, body, sent_to: toEmail }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error) {
    console.error("Send email error:", error);
    return createErrorResponse(
      500,
      error instanceof Error ? error.message : "Failed to send email",
    );
  }
}

Deno.serve((req) =>
  OptionsMiddleware(req, (req) => AuthMiddleware(req, handler)),
);
