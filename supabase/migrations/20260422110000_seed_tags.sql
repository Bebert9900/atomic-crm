-- Seed CRM-relevant tags.
-- Strategy:
--  1. Insert each CRM tag only if no existing tag with the same name is present
--     (idempotent, safe to re-run).
--  2. Delete legacy default tags ('football-fan', 'holiday-card', 'influencer',
--     'manager', 'musician', 'developer', 'investor') only when NO contact
--     references them. Contacts with a legacy tag keep it intact.
-- Nothing is dropped or renamed destructively, so this migration is reversible
-- in practice: removed defaults can be reinserted manually if needed.

with crm_tags(name, color) as (
  values
    ('client',         '#d1fae5'),
    ('prospect',       '#dbeafe'),
    ('decision-maker', '#ede9fe'),
    ('demo-faite',     '#fef3c7'),
    ('partenaire',     '#fce7f3'),
    ('churn-risk',     '#fee2e2'),
    ('referral',       '#e0f2fe'),
    ('revendeur',      '#f3f4f6'),
    ('saas-signup',    '#ecfdf5'),
    ('inbound',        '#f0fdf4')
)
insert into public.tags (name, color)
select c.name, c.color
from crm_tags c
where not exists (
  select 1 from public.tags t where t.name = c.name
);

-- Remove legacy default tags ONLY if unused by any contact.
delete from public.tags t
where t.name in (
  'football-fan', 'holiday-card', 'influencer', 'manager',
  'musician', 'developer', 'investor'
)
and not exists (
  select 1 from public.contacts c where t.id = any(c.tags)
);
