#!/usr/bin/env node
/**
 * One-shot backfill: the first version of email-sync.mjs stored the full raw
 * RFC822 message (headers + body) as text_body. This script re-parses every
 * row whose text_body starts with RFC822 headers and rewrites text_body /
 * html_body to contain only the actual message content.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { simpleParser } from "mailparser";

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

function looksLikeRawRfc822(text) {
  if (!text) return false;
  const head = text.slice(0, 2000);
  return /^(Return-Path:|Received:|Delivered-To:|MIME-Version:|Content-Type:|Message-ID:|DKIM-Signature:|X-[A-Za-z-]+:)/m.test(
    head,
  );
}

function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function main() {
  const pageSize = 200;
  let from = 0;
  let fixed = 0;
  let skipped = 0;
  let failed = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("email_messages")
      .select("id, text_body")
      .range(from, from + pageSize - 1)
      .order("id", { ascending: true });
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (!looksLikeRawRfc822(row.text_body)) {
        skipped++;
        continue;
      }
      try {
        const parsed = await simpleParser(row.text_body);
        let textBody = parsed.text || null;
        const htmlBody = parsed.html || null;
        if (!textBody && htmlBody) textBody = htmlToText(htmlBody);
        if (!textBody && !htmlBody) {
          failed++;
          continue;
        }
        const { error: updErr } = await supabase
          .from("email_messages")
          .update({ text_body: textBody, html_body: htmlBody })
          .eq("id", row.id);
        if (updErr) {
          console.error("Update error for id", row.id, updErr.message);
          failed++;
          continue;
        }
        fixed++;
      } catch (e) {
        console.error("Parse error for id", row.id, e.message);
        failed++;
      }
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  console.log(`Backfill done: ${fixed} fixed, ${skipped} skipped, ${failed} failed`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
