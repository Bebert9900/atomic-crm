---
name: BMAD method — scope that fit this user
description: L'utilisateur a demandé BMAD pour structurer l'agentique. Ce qui a été livré vs ce qui a été volontairement omis, et ce qu'il a validé.
type: feedback
originSessionId: f2852700-d871-4a21-8b78-0046a73b7ba3
---
L'utilisateur connait la méthode BMAD (Brian Madison's agentic planning framework). Il a demandé explicitement "utilise la méthode BMAD" pour structurer le projet agentique.

## Ce qui a été livré

- Planning phase compressée en 3 docs séquentiels (Analyst/PM/Architect inline dans une seule session)
- 16 stories auto-suffisantes au format BMAD story file : contexte business + contexte technique + fichiers impactés + spec code + AC + tests + risques + done
- README index + ROLLOUT.md pour le rollout

## Ce qui a été volontairement omis (et validé par l'user)

- Personas distincts formalisés (Scrum Master agent, QA agent, UX Expert)
- Cérémonies scrum-like
- Sharding automatique via outil BMAD CLI
- `front-end-spec.md` dédié (intégré dans chaque story)
- `testing-strategy.md`, `qa-checklist.md` séparés
- `deployment-runbook.md` — reporté, à écrire après le 1er run réel

**Why:** équipe de 3 personnes. Overkill d'appliquer le framework complet. L'utilisateur a explicitement dit que BMAD full était overkill après que je lui aie expliqué.

**How to apply:** pour cet utilisateur, BMAD = story files auto-suffisantes + PRD + Architecture + Project Brief. Pas de cérémonies. Pas de personas multiples. Le vrai apport BMAD qu'il valorise = **le story file auto-suffisant** (permet de reprendre le boulot à froid, idéal pour paralléliser Claude Code sessions).
