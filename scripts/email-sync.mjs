#!/usr/bin/env node
/**
 * IMAP sync worker — pulls emails from each active email_account,
 * matches senders/recipients against contacts.email_jsonb, and stores
 * matching messages in email_messages so they appear on the contact timeline.
 *
 * Runs as a cron/systemd job (every 5 min is a reasonable cadence).
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * The IMAP password for each account is decrypted server-side via the
 * decrypt_email_password RPC (uses app.settings.email_encryption_key).
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const FOLDERS = ["INBOX", "Sent"];
// Some servers use different names for the Sent folder — we try these in order.
const SENT_ALIASES = ["Sent", "Sent Items", "INBOX.Sent", "Sent Mail"];

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function normalizeEmail(addr) {
  return (addr || "").trim().toLowerCase();
}

function extractAddresses(list) {
  // imapflow returns address lists as arrays of { name, address }
  if (!list) return [];
  return list
    .map((a) => ({
      name: a.name || null,
      email: normalizeEmail(a.address),
    }))
    .filter((a) => a.email);
}

async function buildContactEmailMap() {
  // Build a Map<lowercased_email, {contact_id, sales_id}> so matching is O(1).
  // contacts.email_jsonb is an array of {email, type} objects.
  const map = new Map();
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("contacts")
      .select("id, sales_id, email_jsonb")
      .not("email_jsonb", "is", null)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const c of data) {
      for (const entry of c.email_jsonb || []) {
        const email = normalizeEmail(entry?.email);
        if (email && !map.has(email)) {
          map.set(email, { contact_id: c.id, sales_id: c.sales_id });
        }
      }
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return map;
}

async function resolveFolderName(client, wanted) {
  if (wanted === "INBOX") return "INBOX";
  const list = await client.list();
  const names = list.map((m) => m.path);
  for (const candidate of SENT_ALIASES) {
    if (names.includes(candidate)) return candidate;
  }
  // Fallback: any folder with \Sent special-use flag
  const sent = list.find((m) => m.specialUse === "\\Sent");
  return sent?.path || null;
}

async function getSyncState(accountId, folder) {
  const { data, error } = await supabase
    .from("email_sync_state")
    .select("last_uid")
    .eq("email_account_id", accountId)
    .eq("folder", folder)
    .maybeSingle();
  if (error) throw error;
  return data?.last_uid || 0;
}

async function upsertSyncState(accountId, folder, lastUid) {
  const { error } = await supabase
    .from("email_sync_state")
    .upsert(
      {
        email_account_id: accountId,
        folder,
        last_uid: lastUid,
        last_sync: new Date().toISOString(),
      },
      { onConflict: "email_account_id,folder" },
    );
  if (error) throw error;
}

async function decryptPassword(encrypted) {
  const { data, error } = await supabase.rpc("decrypt_email_password", {
    encrypted_password: encrypted,
  });
  if (error) throw error;
  return data;
}

async function syncFolder({ account, client, folderName, contactMap }) {
  const lock = await client.getMailboxLock(folderName);
  try {
    const lastUid = await getSyncState(account.id, folderName);
    // Fetch UIDs strictly greater than lastUid
    const range = `${lastUid + 1}:*`;
    let maxUid = lastUid;
    let saved = 0;
    let skipped = 0;

    for await (const msg of client.fetch(
      range,
      { envelope: true, source: true, uid: true, flags: true },
      { uid: true },
    )) {
      if (!msg.envelope) continue;
      if (msg.uid <= lastUid) continue; // server returned older, defensive
      if (msg.uid > maxUid) maxUid = msg.uid;

      const env = msg.envelope;
      const fromList = extractAddresses(env.from);
      const toList = extractAddresses(env.to);
      const ccList = extractAddresses(env.cc);
      const allParties = [...fromList, ...toList, ...ccList];

      // Match any party (from OR to/cc) against known contact emails.
      // For INBOX: sender is external, recipients include our user → we match on sender.
      // For Sent: sender is our user, recipients are external → we match on recipients.
      // Matching every party handles both cleanly.
      let match = null;
      for (const party of allParties) {
        const hit = contactMap.get(party.email);
        if (hit) {
          match = hit;
          break;
        }
      }
      if (!match) {
        skipped++;
        continue;
      }

      const from = fromList[0] || { email: "", name: null };
      const bodyText = msg.source ? msg.source.toString("utf8") : null;

      const row = {
        message_id: env.messageId || `uid-${account.id}-${folderName}-${msg.uid}`,
        email_account_id: account.id,
        folder: folderName,
        from_email: from.email,
        from_name: from.name,
        to_emails: toList,
        cc_emails: ccList.length > 0 ? ccList : null,
        subject: env.subject || null,
        text_body: bodyText,
        html_body: null,
        date: (env.date || new Date()).toISOString(),
        is_read: folderName !== "INBOX" || (msg.flags && msg.flags.has("\\Seen")),
        contact_id: match.contact_id,
        sales_id: account.sales_id || match.sales_id || null,
        uid: msg.uid,
      };

      const { error } = await supabase
        .from("email_messages")
        .upsert(row, {
          onConflict: "email_account_id,folder,message_id",
          ignoreDuplicates: false,
        });
      if (error) {
        console.error("Upsert error for uid", msg.uid, error.message);
        continue;
      }
      saved++;
    }

    await upsertSyncState(account.id, folderName, maxUid);
    log(
      `[${account.email}] ${folderName}: ${saved} saved, ${skipped} skipped (non-contact), lastUid=${maxUid}`,
    );
  } finally {
    lock.release();
  }
}

async function syncAccount(account, contactMap) {
  const password = await decryptPassword(account.encrypted_password);
  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: account.imap_port === 993,
    auth: { user: account.email, pass: password },
    logger: false,
    tls: account.skip_tls_verify ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await client.connect();

    for (const wanted of FOLDERS) {
      const resolved =
        wanted === "INBOX" ? "INBOX" : await resolveFolderName(client, wanted);
      if (!resolved) {
        log(`[${account.email}] ${wanted} folder not found, skipping`);
        continue;
      }
      await syncFolder({
        account,
        client,
        folderName: resolved,
        contactMap,
      });
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

async function main() {
  log("Email sync starting");

  const { data: accounts, error } = await supabase
    .from("email_accounts")
    .select(
      "id, email, imap_host, imap_port, encrypted_password, sales_id, skip_tls_verify, is_active",
    )
    .eq("is_active", true);

  if (error) throw error;
  if (!accounts || accounts.length === 0) {
    log("No active email accounts");
    return;
  }

  const contactMap = await buildContactEmailMap();
  log(`Loaded ${contactMap.size} contact emails for matching`);

  for (const account of accounts) {
    try {
      await syncAccount(account, contactMap);
    } catch (err) {
      console.error(`[${account.email}] sync failed:`, err.message);
    }
  }

  log("Email sync done");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
