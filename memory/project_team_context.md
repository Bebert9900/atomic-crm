---
name: Team and product context
description: Équipe de 3, ce CRM est à la fois leur outil interne ET le CRM vendu dans leur SaaS. "IA suspendu" est une offre IA vendue aux clients, pas l'état de l'IA interne.
type: project
originSessionId: f2852700-d871-4a21-8b78-0046a73b7ba3
---
Équipe : 3 personnes, tous font sales + dev (pas de séparation stricte par rôle).

Ce repo (atomic-crm) sert à double usage :
- CRM interne de l'entreprise
- CRM intégré au SaaS qu'ils vendent à leurs clients

"IA suspendu" = une des solutions IA qu'ils proposent à leurs clients dans le SaaS (offre commerciale), pas une pause de l'IA en interne.

**Why:** corriger une mémoire antérieure qui disait "IA suspendue" au sens "mise en pause" — c'est en réalité un nom de produit.

**How to apply:** quand l'utilisateur parle d'intégrer de l'IA / agentique, distinguer deux contextes : (1) productivité interne pour l'équipe de 3, (2) features IA vendues aux clients du SaaS. Demander lequel si ambigu. Les features client-facing doivent respecter le modèle multi-tenant / RLS du SaaS.
