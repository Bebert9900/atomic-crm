---
name: Atomic CRM — production infrastructure
description: Where crm.fabrik.so actually runs (VPS + Caddy, not GitHub Pages), how to deploy, Supabase project ref
type: project
originSessionId: 6c166439-9966-4647-970a-52c4e10d7822
---
Atomic CRM in prod at **https://crm.fabrik.so** is served by **Caddy on VPS `187.77.161.25`**, NOT GitHub Pages. GitHub Pages workflow exists and publishes to `atomic-crm-deploy` repo but the DNS `crm.fabrik.so` points to the VPS.

**VPS access**: `ssh levelup@187.77.161.25` — user `levelup`, home `/home/levelup`, repo at `/home/levelup/atomic-crm`. Server has no GitHub push credentials (HTTPS remote without creds). Git user on server is Jules/jules@levelups.fr by default.

**Caddy config** (`/etc/caddy/Caddyfile`): `crm.fabrik.so { root * /home/levelup/atomic-crm/dist; try_files {path} /index.html; file_server }`. No reload needed — it serves files directly.

**Supabase project**: ref `luibovhuvqnznucfwvym`, URL `https://luibovhuvqnznucfwvym.supabase.co`, West EU. Owner auth email `levelupdemo230@gmail.com`. Secrets `GEMINI_API_KEY`, `VITE_ATTACHMENTS_BUCKET=attachments` already set. Single storage bucket `attachments` (public, stores recordings + email attachments + everything else).

**Why:** Jules set this up manually outside the CI path. The GitHub Actions deploy workflow is dead weight for crm.fabrik.so (it only updates bebert9900.github.io/atomic-crm-deploy).

**How to apply:**
- Deploy = edit files via rsync on VPS, SSH run `npm run build`, Caddy serves instantly. No CI involvement needed for prod.
- Git flow: server has commits from Jules not on GitHub. To keep GitHub in sync, fetch from server via SSH remote (`git remote add srv ssh://levelup@187.77.161.25/home/levelup/atomic-crm; git fetch srv main; git push origin srv/main:main`).
- Never trust "push on main triggers deploy to crm.fabrik.so" — it doesn't. Only explicit rsync + build does.
- Before building, **backup `dist/` as `dist.backup-YYYYMMDD-HHMMSS`** in case rollback needed.
