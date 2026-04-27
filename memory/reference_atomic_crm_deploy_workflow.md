---
name: Atomic CRM — deploy workflow (VPS + GitHub sync)
description: Exact command sequence to ship a change to crm.fabrik.so and keep GitHub main in sync
type: reference
originSessionId: 6c166439-9966-4647-970a-52c4e10d7822
---
For crm.fabrik.so, the deploy is **not** `git push origin main`. It's SSH + rsync + build on the VPS.

**Standard change flow** (editing frontend files):
1. Pull files locally for editing: `rsync -a levelup@187.77.161.25:atomic-crm/src/.../File.tsx /tmp/atomic-merge/`
2. Edit locally (use Edit/Write tools, not SSH sed — prettier hook on server reformats differently than local).
3. Push edited file: `rsync -a /tmp/atomic-merge/File.tsx levelup@187.77.161.25:atomic-crm/src/.../File.tsx`
4. On server: `git add -A && git -c user.name=Bebert9900 -c user.email=fboudjada54@gmail.com commit -m "..."` (override git author or the commit appears as Jules)
5. On server: `npm run build` — outputs to `dist/`, Caddy serves immediately.
6. Sync GitHub: on local, `git fetch srv main; git push origin srv/main:main`.
7. Verify with `curl -s https://crm.fabrik.so | grep -oE 'index-[A-Za-z0-9_-]+\.js'` — the hash should match the freshly built one.

**Local git srv remote setup** (one-time): `git remote add srv ssh://levelup@187.77.161.25/home/levelup/atomic-crm`.

**Edge function deploys**: use MCP `mcp__claude_ai_Supabase__deploy_edge_function`. Required params: `project_id=luibovhuvqnznucfwvym`, `name`, `entrypoint_path=index.ts`, `verify_jwt` (false on this project for new functions — see features memory), `files` array with `_shared/cors.ts`, `_shared/utils.ts`, `_shared/supabaseAdmin.ts`, `index.ts` each with `content` string. Do NOT include `_shared/authentication.ts` unless you know the gateway JWT issuer matches (it doesn't here).

**DB migrations**: use MCP `apply_migration` with a clear name. Remember RLS pattern — this project leaves policies permissive (`USING (true)`, `WITH CHECK (true)`) by design, for a 3-person founding team where everyone sees everything. Not a bug.

**Why:** The GitHub Actions deploy workflow publishes to `atomic-crm-deploy` → `bebert9900.github.io/atomic-crm-deploy` which is NOT where `crm.fabrik.so` points. Pushing only to GitHub does not update prod.

**How to apply:** Always prefer rsync-to-server over making the user manually deploy. Verify deploy with curl on the index hash. Don't rely on the GitHub Actions pipeline unless the target URL is explicitly `.github.io`.
