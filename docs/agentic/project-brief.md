# Project Brief — Agentic CRM Layer

**Owner**: équipe Atomic CRM (3 personnes, sales+dev)
**Date**: 2026-04-23
**Status**: Approved for planning

## Problème

L'équipe passe un temps significatif sur des actions CRM répétitives à faible valeur ajoutée : structurer les notes post-call, rédiger des follow-ups email, maintenir le pipeline à jour, préparer les points hebdomadaires. Ce temps est volé à la prospection et au dev produit.

En parallèle, la société vend un SaaS avec CRM intégré (ce repo est à double usage : outil interne + produit vendu). Chaque capacité agentique construite en interne devient potentiellement une feature vendable, en cohérence avec l'offre "IA suspendu" déjà commercialisée.

## Vision

Un ensemble de **skills agentiques autonomes** orchestrés via Claude API et le MCP server existant, qui exécutent des workflows CRM à haute fréquence **sans intervention humaine pendant leur exécution**. Un user déclenche un skill (clic, slash command, trigger automatique), l'agent exécute de bout en bout, rend un résultat. Les garde-fous sont architecturaux (RLS, whitelists, thresholds, undo), pas humains.

## Objectifs à 6 mois

- **O1** — 5 skills en production interne, utilisés quotidiennement par les 3 users
- **O2** — Réduction mesurable du temps passé sur actions répétitives (baseline à établir semaine 1)
- **O3** — 2 skills packagés et activables par tenant dans le SaaS client
- **O4** — Infrastructure réutilisable : 1 runtime, 1 tool registry, 1 système d'autorisation, 1 système de traces

## Non-objectifs (v1)

- Fine-tuning ou entraînement d'un modèle custom
- Collecte massive de clics UI pour dataset d'entraînement
- Framework multi-agents lourd (BMAD allégé, pas intégral)
- Human-in-the-loop pendant l'exécution d'un skill (explicitement exclu)
- Skills de type "chat généraliste" — tous les skills ont un scope borné

## Stakeholders

- **Users** : 3 fondateurs (= équipe produit + utilisateurs finaux)
- **Clients SaaS** : cible downstream, non décideurs v1
- **Décideur produit** : fondateur tech

## Contraintes

- Stack figée : Supabase (PostgreSQL + Auth + Edge Functions + Storage) + React 19 + shadcn-admin-kit
- Sécurité multi-tenant via RLS PostgreSQL : non-négociable côté SaaS
- MCP server déjà en production (`supabase/functions/mcp/`) : on enrichit, on ne réécrit pas
- Budget Claude API à surveiller : prompt caching obligatoire dès le premier skill
- Pas d'humain pour rattraper les erreurs en vol → guardrails techniques durcis

## Critères de succès mesurables

- Un user peut déclencher un skill en ≤ 3 actions (clic ou commande)
- 95ᵉ percentile de latence ≤ 15s pour un skill-run complet
- Coût médian / skill-run ≤ 0.05 USD (toutes stratégies de cache appliquées)
- Taux d'erreur technique < 2% sur 30 jours glissants
- Aucune régression des permissions RLS existantes (test automatisé)
- Toute action exécutée est rejouable depuis le trace (debuggabilité totale)

## Principe directeur "no human in the loop"

L'agent est autonome *dans un espace d'actions restreint par design* :
- Les actions destructives (delete, deal → lost, email envoyé vers adresse externe non-connue) sont **interdites** à l'agent, pas "à confirmer"
- Les actions réversibles (create, update, tag) sont **autorisées** mais tracées
- Les actions semi-destructives (move deal stage, merge contacts) sont **autorisées si réversibles dans les 24h** (undo via trace)
- Rate limits par user, par skill, par tenant
- Kill-switch global et par skill

Cette doctrine remplace l'approbation humaine par une combinaison : liste blanche + réversibilité + observabilité + seuils.
