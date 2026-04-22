-- Refresh CRM tag set.
--  1. Insert each CRM tag if absent (idempotent).
--  2. Remove legacy default tags ('football-fan', 'holiday-card', 'influencer',
--     'manager', 'musician', 'developer', 'investor') only when NO contact
--     references them — contacts keep tags they already wear.

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

delete from public.tags t
where t.name in (
  'football-fan', 'holiday-card', 'influencer', 'manager',
  'musician', 'developer', 'investor'
)
and not exists (
  select 1 from public.contacts c where t.id = any(c.tags)
);
