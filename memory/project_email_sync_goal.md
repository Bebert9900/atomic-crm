---
name: Email sync feature — real goal
description: The in-progress email_sync work is specifically to show per-contact email history, not to build a full inbox client
type: project
originSessionId: 7f064b10-9954-41fd-adf7-46aa57d80b70
---
The `email_sync` feature in atomic-crm (tables `email_accounts`, `email_messages`, `email_sync_state` — migration `20260416160000_email_sync.sql`, still uncommitted as of 2026-04-17) exists for **one reason**: give each commercial a view of every email exchanged with each prospect, inside the contact's detail page.

**Why:** the user's stated objective — "avoir une vision de l'historique des échanges avec chacun des prospects". Not a general-purpose webmail, not an inbox replacement.

**How to apply:**
- Sync scope must include both **INBOX** (received) and **Sent** folder (sent) — skipping Sent would miss half the conversation.
- Matching is `email_messages.from_email` / `to_emails` against `contacts.email_jsonb` (jsonb array of `{email, type}` objects, not a single string).
- Primary UI surface is the contact detail page timeline, not a standalone inbox route.
- One IMAP account per commercial (`email_accounts.sales_id`), since each rep's mailbox is different and only their own exchanges matter to them.
- Don't over-engineer: no threading reconstruction, no multi-mailbox inbox view, no attachments UI in v1.
