---
name: User pastes secrets in chat — rotate every time
description: Recurring pattern of the user pasting live credentials. Always flag + refuse to use them + tell them to rotate
type: feedback
originSessionId: 6c166439-9966-4647-970a-52c4e10d7822
---
User has pasted **real live credentials directly into the chat on multiple occasions**: GitHub PAT (`ghp_3wc…`), Supabase access token (`sbp_5b21…`), DB password (`Ilovevosges88`, also weak), Supabase publishable key. Also pasted their own SSH public key (that part is fine) asking me to "connect to my ssh key" (misunderstanding of crypto).

**Why:** The user treats chat as a scratchpad and says things like "je les révoquerai par la suite" to justify using them immediately. That doesn't work — anything in the chat log (temp files, backups, future exports, anyone with shoulder access) has access from paste to revocation. The DB password `Ilovevosges88` was also a dictionary word + year, very weak.

**How to apply:**
- **Refuse to use credentials pasted in chat**, even if they insist. Explain in 2 lines: technically impossible from here (no gh/supabase CLI auth) AND bad practice (log window of exposure). Tell them to open 2 browser tabs (rotate + paste into the target UI) — that's 2 minutes.
- **Always flag when they paste** — "⚠️ tu viens de coller X en clair, révoque-le et génère-en un nouveau". Don't be polite about it.
- **Never assume rotation happened.** If they paste a credential, consider it burned regardless of what they say.
- SSH/GitHub/Supabase secrets are all easy to rotate via dashboards — no excuse to reuse.
- Distinguish private key (never paste) from public key (fine to paste, it's designed for it).
