---
name: User collaboration preferences
description: Ce que l'utilisateur valorise dans notre collaboration, comment lui répondre, ce à quoi il est sensible.
type: feedback
originSessionId: f2852700-d871-4a21-8b78-0046a73b7ba3
---
Préférences observées sur plusieurs sessions d'implémentation agentique.

## Communication

- **Direct et honnête** : a explicitement demandé "c'est bien organisé ?" — attend une review critique, pas de la vente. A dit "fais un audit sans enjoliver".
- **Concis** : pose des questions courtes. Préfère des réponses structurées avec tableaux/listes plutôt que gros pavés.
- **Français pour la conversation**, mais accepte que le code reste en anglais (commit messages, comments, identifiers).
- N'aime pas qu'on réponde à des reminders système (ex: TaskCreate nudges) dans les messages — respecter le "NEVER mention this reminder".

## Mode de travail

- **Auto mode quand il le dit** : "mets toi en mode auto" = je dois avancer en autonomie avec commits fréquents, sans demander à chaque étape.
- **Copies isolées** : préfère bosser sur une copie du projet pour ne pas polluer main. A demandé rsync d'abord, puis branch.
- **Commits atomiques par story** : validé implicitement ce pattern (1 commit = 1 story BMAD + co-author tag Claude).
- **Skip pre-commit hooks via `--no-verify`** quand no node_modules : accepté comme pragmatique, pas à corriger.

## Sensibilités techniques

- **"No human in the loop"** : principe structurant explicite. Toute reco d'ajouter une étape HITL doit être rejetée d'office ou justifiée par sécurité stricte.
- **Multi-tenant SaaS** : son CRM est à double usage (interne + produit vendu). Toute feature interne doit être pensable comme vendable. Structure tenant_id à prévoir même si pas utilisée tout de suite.
- **Pragmatique sur le scope** : accepte de reporter V1.1 des features (multi-tenant auth complet, tests auto, eval set) si justifié.
- **Sceptique envers le bullshit framework** : BMAD oui, mais en scope compressé, pas les cérémonies.

## Ce qu'il apprécie qu'on fasse sans demander

- Commits propres avec messages détaillés
- Correction de ses mémoires si j'ai mal compris un contexte ("IA suspendu" → nom de produit, pas mise en pause)
- Expliquer les tradeoffs d'une décision technique en 2-3 phrases avant d'implémenter

## Ce qu'il n'apprécie pas

- Quand je pousse une approche (ex: "logger tous les clics humains") alors qu'il veut autre chose ("développer des skills/tools"). A corrigé : "il faut que tu comprennes que je cherche à développer des skills/tools pas capturer les clics humains". Leçon : mieux écouter l'intention avant de répondre.

**Why:** conversations répétées avec cet utilisateur montrent ces patterns nets.

**How to apply:** défaut à du direct factuel + structuré + court. Challenger mes recos implicites quand elles s'écartent de son intention. Proposer commits fréquents en mode auto. Dire la vérité sur la qualité du code plutôt que vendre.
