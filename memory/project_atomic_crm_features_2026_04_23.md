---
name: Atomic CRM — features shipped 2026-04-23
description: Major features added this session (calendar, mail, recordings, dev-tasks, video conferences)
type: project
originSessionId: 6c166439-9966-4647-970a-52c4e10d7822
---
Session of **2026-04-23** shipped a large feature push on top of Jules's UI redesign merge. For continuity:

**Merge of divergent branches**: Jules had 2 UI redesign commits on server never pushed to GitHub (`b27d719`, `9fc6575`). Origin/main had 4 commits Jules didn't have (Stripe, email backfill, supabase config). Merged with conflict resolution = keep Jules's UI, then reintegrate Bebert's features file-by-file.

**Recordings (audio + transcription)**:
- Edge function `transcribe_recording` v15 deployed with `verify_jwt=false` (gateway JWT validation was broken due to signing_keys mismatch on this project) and model `gemini-2.5-flash` with `thinkingConfig: { thinkingBudget: 0 }` (2.0-flash is deprecated, 2.5-flash's default thinking mode eats all tokens and returns empty text).
- DB columns added: `sentiment`, `warmth_score`, `warmth_label`, `email_draft`, `sms_draft`.
- UI: RecordButton in ContactAside, list with delete + retry, aggregated CompanyRecordingsList tab on company page.

**Mail inbox (`/mail`)**:
- Full inbox page with list + detail + filters (folder, account, unread only, search).
- Compose/Reply/Reply-all/Forward with attachments via edge function `send_email_raw` v1 (`verify_jwt=false`, uses per-account SMTP from `email_accounts` table via `decrypt_email_password` RPC, denomailer SMTP client, inserts sent into `email_messages` folder=Sent).
- Admin-only gate on EmailAccountsPage LIFTED — all users can see list, only admins can add/edit.

**Calendar (`/appointments`)**:
- Per-user color palette (8 colors cycled by sales_id).
- Team filter toggle bar above calendar (hide/show individual commercials).
- Event popup (dialog) on click, stays on calendar page. Supports appointment/task/dev_task with contextual actions including "Fait" button.
- Event IDs use underscore separator (`appointment_42`, `task_1`, `devtask_2`) — schedule-x rejects colons.

**Dev tasks**:
- Multi-assignee (`assignee_ids bigint[]`) with backfill from legacy `assignee_id`.
- Assignee UI: avatars stacked on card, pills on detail page.

**Cross-view "Fait" button** → `MarkDoneDialog` in `src/components/atomic-crm/misc/MarkDoneDialog.tsx`. Wired on: calendar popup, TodayTasks widget, MyDay timeline rows, DevTaskShow header. Dialog offers: comment (saved as contact_note if contact_id), optional follow-up task creation (J+3 default due date).

**Video conferences**: new `video_conferences` table with sections on ContactAside + CompanyShow tab "Visios".

**Contact plans**: table `contact_plans` was inferred from Jules's dead code and created (schema matches `ContactPlan` type) so the 404 spam stops.

**Dashboard linkage**: Dashboard TodayTasks + TodayAgenda now include both tasks + dev_tasks assigned to current user. Calendar aggregates all 3 event types.

**Queries invalidation**: AddTask / TaskCreateSheet / AppointmentCreateSheet / DevTaskCreate all call `queryClient.invalidateQueries({ queryKey: [...] })` after success so badges/lists refresh without F5.

**Why:** User wanted "tous les éléments reliés en logique" — calendar shows everything, completing anywhere updates everywhere.

**How to apply:**
- When asked about why an edge function returns 401/500/empty: check `get_logs` for deployment_id + version. On this project, gateway JWT validation is broken — default to `verify_jwt=false` for new edge functions that need authenticated user context, do the check manually inside.
- Edge function deploys: use `mcp__claude_ai_Supabase__deploy_edge_function` with `files` array including `_shared/` files as siblings. Don't use supabase CLI via SSH (no access token).
- After any build on the server, Caddy serves new `dist/` immediately — no reload command.
