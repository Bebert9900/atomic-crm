# Story D.2 — UI admin pour activer skills par tenant

**Epic**: D. SaaS enablement
**Status**: Ready
**Estimation**: 4h
**Depends on**: D.1 (table `tenant_settings`), C.1 (page agentique)
**Blocks**: D.3

## Contexte business

Page admin où un super-admin (ou le self-service d'un tenant) peut activer/désactiver des skills. UI minimale mais fonctionnelle.

## Contexte technique

- Pour v1, la page est dans `/settings/agentic/tenants` réservée aux admins globaux
- Self-service par tenant : décalée en v1.1 (nécessite tenant-aware auth complet)
- Gère : toggle global agentic_enabled, liste de skills cochables, édition des limites

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `src/components/atomic-crm/settings/TenantSettingsPage.tsx` | Créer |
| `src/components/atomic-crm/settings/TenantSettingsForm.tsx` | Créer |
| `src/components/atomic-crm/settings/AgenticPage.tsx` | Ajouter lien |
| `src/App.tsx` | Route `/settings/agentic/tenants` |

## Spec UI

### Page `/settings/agentic/tenants`

- List des tenants (ra-core `<List resource="tenant_settings">`)
  - Colonnes : tenant_id, agentic_enabled, skills_count, monthly_cost (vue agrégée)
- Click → page d'édition `<TenantSettingsForm>`

### Formulaire

Sections :
1. **Activation globale** — switch `agentic_enabled`
2. **Skills activés** — liste multi-select parmi les skills existants (ex: MultiSelect shadcn)
3. **Limits** — 3 inputs numériques : per_day, per_month, max_cost_usd_per_month
4. **Stripe link** — input texte `stripe_subscription_id` (readonly si automatisé)

```tsx
import { Edit, SimpleForm, TextInput, BooleanInput, NumberInput } from "@/components/admin";
import { useListSkills } from "@/hooks/useListSkills";
import { MultiSelectInput } from "@/components/admin/multi-select-input";

export function TenantSettingsForm() {
  const skills = useListSkills();
  return (
    <Edit resource="tenant_settings">
      <SimpleForm>
        <TextInput source="tenant_id" disabled />
        <BooleanInput source="agentic_enabled" label="Enable agentic features" />
        <MultiSelectInput
          source="agentic_enabled_skills"
          label="Enabled skills"
          choices={skills.map((s) => ({ id: s.id, name: s.id }))}
        />
        <NumberInput source="agentic_usage_limits.per_day" label="Runs / day" />
        <NumberInput source="agentic_usage_limits.per_month" label="Runs / month" />
        <NumberInput source="agentic_usage_limits.max_cost_usd_per_month" label="Max cost (USD) / month" />
        <TextInput source="stripe_subscription_id" />
      </SimpleForm>
    </Edit>
  );
}
```

### Resource dans `<CRM>`

`tenant_settings` doit être exposée comme resource par le dataProvider. Si pas déjà fait, ajouter :
```tsx
<Resource name="tenant_settings" list={TenantSettingsList} edit={TenantSettingsForm} />
```
avec les composants `TenantSettingsList` (List + Datagrid) et `TenantSettingsForm` (Edit).

### List

```tsx
import { List, Datagrid, TextField, BooleanField, FunctionField } from "@/components/admin";

export function TenantSettingsList() {
  return (
    <List resource="tenant_settings">
      <Datagrid rowClick="edit">
        <TextField source="tenant_id" />
        <BooleanField source="agentic_enabled" />
        <FunctionField label="Skills"
          render={(r: any) => `${r.agentic_enabled_skills?.length ?? 0}`} />
        <TextField source="agentic_usage_limits.per_month" label="Runs/mo" />
        <TextField source="stripe_subscription_id" />
      </Datagrid>
    </List>
  );
}
```

## Critères d'acceptation

- [ ] Page `/settings/agentic/tenants` accessible admins uniquement
- [ ] Création manuelle d'une row `tenant_settings` possible via UI
- [ ] Toggle `agentic_enabled` persiste
- [ ] Multi-select skills à jour avec les skills réellement enregistrés
- [ ] Validation : per_day ≤ per_month, valeurs ≥ 0
- [ ] Changement prend effet en <30s (délai cache runtime)
- [ ] `make typecheck` passe

## Risques / pièges

- `MultiSelectInput` : vérifier qu'il existe déjà dans `components/admin/` ; sinon créer un wrapper autour de shadcn `Select` + `Checkbox`
- Pas de mécanisme Stripe auto v1 : le champ `stripe_subscription_id` est éditable à la main
- Cache runtime : documenter que les changes ne sont pas instantanés

## Done

- Commit : `feat(agentic): add tenant settings admin UI`
- 1 tenant de test créé + skills activés + run réussi avec gate OK
