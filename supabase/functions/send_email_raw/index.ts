import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { getUserSale } from "../_shared/getUserSale.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const ATTACHMENTS_BUCKET =
  Deno.env.get("VITE_ATTACHMENTS_BUCKET") ?? "attachments";

interface Payload {
  email_account_id: number;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text_body?: string;
  html_body?: string;
  attachments?: Array<{ storage_path: string; filename: string }>;
  in_reply_to?: string;
  references?: string;
}

async function handler(req: Request, user: any): Promise<Response> {
  if (req.method !== "POST")
    return createErrorResponse(405, "Method not allowed");

  const body = (await req.json()) as Payload;
  if (!body.email_account_id)
    return createErrorResponse(400, "email_account_id is required");
  if (!body.to?.length)
    return createErrorResponse(400, "At least one recipient (to) is required");
  if (!body.subject) return createErrorResponse(400, "subject is required");

  const { data: account, error: accErr } = await supabaseAdmin
    .from("email_accounts")
    .select("*")
    .eq("id", body.email_account_id)
    .single();
  if (accErr || !account)
    return createErrorResponse(404, "Email account not found");
  if (!account.smtp_host)
    return createErrorResponse(400, "SMTP not configured on this account");

  // Authorization: the caller must own this email_account (same sales_id)
  // OR be an administrator. Prevents a logged-in user from sending as someone else.
  const currentSale = await getUserSale(user);
  if (!currentSale) return createErrorResponse(401, "No sale record for user");
  const isOwner = currentSale.id === account.sales_id;
  const isAdmin = !!currentSale.administrator;
  if (!isOwner && !isAdmin) {
    return createErrorResponse(
      403,
      "Forbidden: you do not own this email account",
    );
  }

  const { data: password, error: pwErr } = await supabaseAdmin.rpc(
    "decrypt_email_password",
    { encrypted_password: account.encrypted_password },
  );
  if (pwErr || !password)
    return createErrorResponse(
      500,
      `Unable to decrypt password: ${pwErr?.message ?? "empty"}`,
    );

  const attachmentsForSMTP: Array<{
    filename: string;
    content: Uint8Array;
    contentType: string;
  }> = [];
  for (const att of body.attachments ?? []) {
    const { data: file, error: dlErr } = await supabaseAdmin.storage
      .from(ATTACHMENTS_BUCKET)
      .download(att.storage_path);
    if (dlErr || !file) {
      return createErrorResponse(
        500,
        `Unable to download attachment ${att.filename}: ${dlErr?.message ?? ""}`,
      );
    }
    const buffer = new Uint8Array(await file.arrayBuffer());
    attachmentsForSMTP.push({
      filename: att.filename,
      content: buffer,
      contentType: file.type || "application/octet-stream",
    });
  }

  const client = new SMTPClient({
    connection: {
      hostname: account.smtp_host,
      port: account.smtp_port,
      tls: account.smtp_port === 465,
      auth: { username: account.email, password: password as string },
    },
  });

  try {
    const headers: Record<string, string> = {};
    if (body.in_reply_to) headers["In-Reply-To"] = body.in_reply_to;
    if (body.references) headers["References"] = body.references;

    const msg: Record<string, unknown> = {
      from: account.email,
      to: body.to,
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject,
      content: body.text_body ?? "",
      headers: Object.keys(headers).length ? headers : undefined,
    };
    if (body.html_body) msg.html = body.html_body;
    if (attachmentsForSMTP.length) msg.attachments = attachmentsForSMTP;

    // deno-lint-ignore no-explicit-any
    await client.send(msg as any);
    await client.close();
  } catch (e) {
    try {
      await client.close();
    } catch {
      /* ignore */
    }
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("SMTP send error:", errMsg);
    return createErrorResponse(500, `SMTP send failed: ${errMsg}`);
  }

  const messageId = `<${crypto.randomUUID()}@${account.smtp_host}>`;
  const { error: insErr } = await supabaseAdmin.from("email_messages").insert({
    message_id: messageId,
    email_account_id: account.id,
    folder: "Sent",
    from_email: account.email,
    from_name: null,
    to_emails: body.to.map((e) => ({ email: e })),
    cc_emails: body.cc?.length ? body.cc.map((e) => ({ email: e })) : null,
    subject: body.subject,
    text_body: body.text_body ?? null,
    html_body: body.html_body ?? null,
    date: new Date().toISOString(),
    is_read: true,
    sales_id: account.sales_id,
  });
  if (insErr) console.error("Failed to record sent email:", insErr.message);

  return new Response(
    JSON.stringify({ success: true, message_id: messageId }),
    {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    },
  );
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => handler(req, user)),
    ),
  ),
);
