# Configuration du déploiement automatique

Ce document liste les secrets et variables GitHub Actions à configurer pour que le workflow `deploy.yml` puisse déployer automatiquement le frontend (GitHub Pages) et les edge functions Supabase à chaque `push` sur `main`.

Aujourd'hui, ce workflow échoue car la plupart des secrets n'ont jamais été configurés dans le fork `Bebert9900/atomic-crm`.

## ⚡ TL;DR — tout est configuré ✅

Tous les secrets et variables nécessaires ont été configurés dans `Bebert9900/atomic-crm`. Le workflow `deploy.yml` devrait passer vert au prochain push sur `main`.

**Restent optionnels** (seulement si le webhook Postmark est utilisé) : `POSTMARK_WEBHOOK_USER`, `POSTMARK_WEBHOOK_PASSWORD`, `POSTMARK_WEBHOOK_AUTHORIZED_IPS`.

---


## Où configurer ?

- **Secrets** : https://github.com/Bebert9900/atomic-crm/settings/secrets/actions
- **Variables** : https://github.com/Bebert9900/atomic-crm/settings/variables/actions

## 1. Secrets à ajouter

### Supabase — obligatoires pour pousser les migrations et déployer les edge functions

| Nom | Description | Statut / Où le récupérer |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Token personnel Supabase (CLI) | ✅ configuré |
| `SUPABASE_DB_PASSWORD` | Mot de passe Postgres du projet | ✅ configuré |
| `SUPABASE_PROJECT_ID` | Référence du projet | ✅ configuré |
| `SUPABASE_URL` | URL du projet | ✅ configuré |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key | ✅ configuré |
| `SB_PUBLISHABLE_KEY` | Clé publique (anon) | ✅ configuré |

### Postmark webhook (email entrant) — obligatoires si le webhook Postmark est utilisé

| Nom | Description |
|---|---|
| `POSTMARK_WEBHOOK_USER` | Utilisateur HTTP Basic Auth que Postmark envoie |
| `POSTMARK_WEBHOOK_PASSWORD` | Mot de passe HTTP Basic Auth |
| `POSTMARK_WEBHOOK_AUTHORIZED_IPS` | IPs autorisées (cf. `supabase/functions/.env.example`) |

### Email sync IMAP (cron GitHub Actions) — déjà configurés ✅

| Nom | Description | Statut |
|---|---|---|
| `SUPABASE_URL` | Idem ci-dessus | ✅ configuré |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key du projet Supabase | ✅ configuré |

### Optionnels

| Nom | Description |
|---|---|
| `DEPLOY_TOKEN` | Token GitHub avec droits `repo` pour push vers un repo externe de déploiement (sinon `GITHUB_TOKEN` est utilisé) |
| `VITE_GOOGLE_WORKPLACE_DOMAIN` | Domaine Google Workspace si utilisé pour l'auth |

## 2. Variables à ajouter

| Nom | Description | Statut / Valeur |
|---|---|---|
| `DEPLOY_REPOSITORY` | Repo GitHub Pages cible (où est publié le frontend) | ✅ configuré (`Bebert9900/atomic-crm-deploy`) |
| `DEMO_DEPLOY_REPOSITORY` | Repo GitHub Pages pour la version demo | ✅ configuré (`Bebert9900/atomic-crm-demo`) |
| `DEPLOY_BRANCH` | Branche de déploiement | ✅ configuré (`gh-pages`) |
| `VITE_IS_DEMO` | `true` pour build demo (FakeRest), `false` pour prod | ✅ configuré (`false`) |
| `VITE_INBOUND_EMAIL` | Adresse email d'ingestion Postmark | ✅ configuré |
| `VITE_ATTACHMENTS_BUCKET` | Bucket Supabase Storage pour les pièces jointes | ✅ configuré (`attachments`) |

## 3. Prérequis côté repos de déploiement

Pour que le déploiement GitHub Pages fonctionne, le repo cible (`DEPLOY_REPOSITORY`) doit :

1. **Exister** dans l'organisation ou le compte (créer un repo vide si besoin).
2. **Avoir GitHub Pages activé** : Settings → Pages → Source = `gh-pages` branch.
3. **Autoriser le token de push** : si `DEPLOY_TOKEN` est utilisé, il doit avoir `Contents: write` sur ce repo.

## 4. Tester la configuration

Une fois les secrets/variables configurés, relance le workflow :

1. Va sur https://github.com/Bebert9900/atomic-crm/actions/workflows/deploy.yml
2. Clique **Run workflow** → branche `main` → **Run workflow**

Ou pousse un commit vide :

```bash
git commit --allow-empty -m "chore: trigger deploy"
git push origin main
```

Le workflow doit passer les 3 jobs :
- ✅ Deploy (doc)
- ✅ Deploy (demo)
- ✅ Deploy (supabase) — pousse les migrations + déploie les edge functions + publie le frontend

## 5. Vérifier le déploiement

| Quoi | URL / commande |
|---|---|
| Frontend prod | URL GitHub Pages du repo `DEPLOY_REPOSITORY` |
| Edge functions | https://supabase.com/dashboard/project/luibovhuvqnznucfwvym/functions |
| Migrations DB | `npx supabase migration list --linked` |
| Cron email sync | https://github.com/Bebert9900/atomic-crm/actions/workflows/email-sync.yml |

## 6. En cas d'erreur

- **`SUPABASE_ACCESS_TOKEN secret is missing`** → secret non configuré (voir section 1)
- **`Cloning into '***'` puis exit 1** → `DEPLOY_REPOSITORY` manquante ou repo cible inexistant
- **`permission denied` sur push** → régénérer `DEPLOY_TOKEN` avec scope `repo` complet

Toutes les étapes du workflow ont des `if` qui skippent proprement si un secret manque — un warning apparaît dans le Summary du run.
