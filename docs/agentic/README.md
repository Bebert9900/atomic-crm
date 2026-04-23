# Agentic CRM — Index

Documentation d'intégration de la couche agentique dans Atomic CRM, structurée selon la **méthode BMAD** allégée (pas de cérémonies multi-agents lourdes pour une équipe de 3).

## Contexte

- **Équipe** : 3 personnes (sales + dev)
- **Double usage** : CRM interne *et* produit SaaS vendu aux clients
- **Principe directeur** : agent **autonome, pas de human-in-the-loop** pendant l'exécution. Les garde-fous sont architecturaux (RLS, whitelists, thresholds, circuit breaker, kill switch, shadow mode), pas humains.

## Artefacts

| Doc | Rôle |
|-----|------|
| [project-brief.md](./project-brief.md) | Problème, vision, objectifs, critères de succès |
| [prd.md](./prd.md) | Scope v1, skills prioritaires, exigences, guardrails |
| [architecture.md](./architecture.md) | Stack technique, composants, flux d'exécution, ADR |
| [stories/](./stories/) | Backlog détaillé, 16 stories auto-suffisantes |

## Backlog

### Epic A — Foundation (bloquant)
- [A.1](./stories/A.1-skill-runs-migration.md) — Migration `skill_runs` + RLS
- [A.2](./stories/A.2-agent-runtime-skeleton.md) — Squelette edge function `agent-runtime`
- [A.3](./stories/A.3-tool-registry.md) — Tool registry initial (25+ tools)
- [A.4](./stories/A.4-claude-api-wrapper.md) — Claude API wrapper + tool_use loop
- [A.5](./stories/A.5-frontend-skill-launcher.md) — Frontend SkillLauncher + SSE + trace

### Epic B — Skills v1
- [B.1](./stories/B.1-process-call-recording.md) — `process_call_recording`
- [B.2](./stories/B.2-handle-incoming-email.md) — `handle_incoming_email`
- [B.3](./stories/B.3-morning-brief.md) — `morning_brief`
- [B.4](./stories/B.4-next-best-action-deal.md) — `next_best_action_on_deal`
- [B.5](./stories/B.5-qualify-inbound-contact.md) — `qualify_inbound_contact`

### Epic C — Observability & ops
- [C.1](./stories/C.1-skill-runs-dashboard.md) — Dashboard interne skill_runs
- [C.2](./stories/C.2-rate-limiting.md) — Rate limiting durci + circuit breaker
- [C.3](./stories/C.3-kill-switch.md) — Kill switch global + shadow mode UI

### Epic D — SaaS enablement
- [D.1](./stories/D.1-agentic-enabled-flag.md) — Flag `agentic_enabled` par tenant
- [D.2](./stories/D.2-tenant-skill-activation.md) — UI admin activation skills
- [D.3](./stories/D.3-usage-billing.md) — Compteur d'usage + facturation

## Ordre d'implémentation recommandé

1. **A.1 → A.2 → A.3 → A.4 → A.5** (foundation séquentielle, bloquante)
2. **B.1** (valide la pipeline complète sur un skill à fort ROI)
3. **C.1 + C.3** en parallèle pour superviser B.1
4. **B.2 → B.3 → B.4 → B.5** (parallélisables)
5. **C.2** quand un 2e skill est en prod (circuit breaker devient utile)
6. **D.1 → D.2 → D.3** uniquement quand on s'attaque au packaging SaaS

## Garde-fous remplaçant le HITL

| Garde-fou | Story | Effet |
|-----------|-------|-------|
| Tool allowlist par skill | A.4 | Refuse toute tool hors whitelist |
| Max writes par skill | A.4 | Limite le volume d'écritures d'une run |
| Max iterations | A.4 | Évite boucles infinies |
| Réversibilité (undo) | A.3, A.4 | Tous les writes ont un handler undo |
| Rate limits (user/skill/tenant) | A.4, C.2 | Évite floods et cascades |
| Circuit breaker | C.2 | 5 erreurs consécutives → désactivation 1h |
| Kill switch (global + skill) | A.4, C.3 | Débranchement immédiat |
| Shadow mode | A.4, C.3 | Exécution sans écriture pour validation |
| Schema validation (input/output) | A.4 | Refuse structures incohérentes |
| Usage limits par tenant | D.3 | Évite surprises financières |

## Glossaire

- **Skill** : capacité composite invocable, déclarée par un manifest TypeScript
- **Tool** : opération atomique exposée à Claude via tool_use
- **Trace** : séquence d'events persistée dans `skill_runs.trace` (JSONB)
- **Run** : une instance d'exécution (1 ligne `skill_runs`)
- **Shadow mode** : exécution dry-run enregistrée, sans écriture réelle
- **Undo** : rollback des écritures d'une run via reparcours inverse du trace
- **Tenant** : un client du SaaS (isolé par RLS + `tenant_id`)
- **Circuit breaker** : mécanisme qui ouvre un skill après N erreurs consécutives
