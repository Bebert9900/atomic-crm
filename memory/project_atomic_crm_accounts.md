---
name: Atomic CRM — account state (Fabrik team)
description: Who is admin, duplicate Faycal profile, merge proposed but not executed
type: project
originSessionId: 6c166439-9966-4647-970a-52c4e10d7822
---
**Sales table** in the remote Supabase (`luibovhuvqnznucfwvym`):

| id | sales.email | admin | auth.users email | notes |
|---|---|---|---|---|
| 1 | jules@fabrik.so | ✅ | jules@fabrik.so | never signed in via fab domain (uses his own setup) |
| 2 | theo@fabrik.so | ✅ | theo@fabrik.so | promoted admin 2026-04-23, never signed in |
| 3 | faycal@fabrik.so | ✅ | faycal@fabrik.so | promoted admin 2026-04-23, never signed in |
| 4 | theo@levelups.fr | ❌ | theo@levelups.fr | theo's alt |
| 5 | fboudjada54@gmail.com | ✅ | fboudjada54@gmail.com | **faycal's actual daily login**, promoted admin 2026-04-23 |

**Why:** ids 3 and 5 are both Faycal Boudjada. User wanted to merge them (keep faycal@fabrik.so as identity, keep fboudjada54@gmail.com as the login credential so no password reset needed). The plan was: transfer data from sales_id=5 to sales_id=3 (3 contacts, 1 company, 2 recordings), repoint sales 3 user_id to c1de59e5-d55d-4e40-9424-bfdd6e45e1fe (fboudjada54 auth.users), delete sales 5 row + auth faycal@fabrik.so (617fd0e0-8bd0-4b71-bcac-4af9271a4197).

**NOT EXECUTED** — user logged out before confirming.

**How to apply:**
- If the user logs in as `fboudjada54@gmail.com`, they are sales_id=5 with admin rights.
- If user asks again to merge Faycal accounts: data to migrate from id 5 to id 3 may have grown since 2026-04-23 — re-run the inventory query on every table with `sales_id=5` before copying.
- Theo (id 2, theo@fabrik.so) and Jules (id 1) have never signed in with their fabrik emails. If they need to, they'll have to "Mot de passe oublié".
