-- Agentic: tenant settings for SaaS enablement (Story D.1) + usage views (Story D.3)

create table public.tenant_settings (
    tenant_id uuid primary key,
    agentic_enabled boolean not null default false,
    agentic_enabled_skills text[] not null default '{}'::text[],
    agentic_usage_limits jsonb not null default
        '{"per_day":500,"per_month":10000,"max_cost_usd_per_month":100}'::jsonb,
    stripe_subscription_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists tenant_settings_agentic_enabled_idx
    on public.tenant_settings (agentic_enabled) where agentic_enabled;

alter table public.tenant_settings enable row level security;

create policy "tenant_settings_select_admin" on public.tenant_settings
    for select to authenticated using (
        exists (select 1 from public.sales
                where user_id = auth.uid() and administrator)
    );
create policy "tenant_settings_update_admin" on public.tenant_settings
    for update to authenticated using (
        exists (select 1 from public.sales
                where user_id = auth.uid() and administrator)
    ) with check (
        exists (select 1 from public.sales
                where user_id = auth.uid() and administrator)
    );
create policy "tenant_settings_insert_admin" on public.tenant_settings
    for insert to authenticated with check (
        exists (select 1 from public.sales
                where user_id = auth.uid() and administrator)
    );
create policy "tenant_settings_service_all" on public.tenant_settings
    for all to service_role using (true) with check (true);

grant select, insert, update on public.tenant_settings to authenticated;
grant all on public.tenant_settings to service_role;

-- Usage views (D.3)
create or replace view public.tenant_usage_daily with (security_invoker = on) as
select
    coalesce(tenant_id::text, 'internal') as tenant_key,
    tenant_id,
    date_trunc('day', started_at)::date as day,
    count(*) as runs,
    count(*) filter (where status = 'success') as successes,
    count(*) filter (where status = 'error') as errors,
    count(*) filter (where status = 'shadow') as shadow_runs,
    sum(input_tokens) as input_tokens,
    sum(output_tokens) as output_tokens,
    sum(cache_read_tokens) as cache_read_tokens,
    sum(cache_creation_tokens) as cache_creation_tokens,
    sum(cost_usd) as cost_usd
from public.skill_runs
group by 1, 2, 3;

create or replace view public.tenant_usage_monthly with (security_invoker = on) as
select
    coalesce(tenant_id::text, 'internal') as tenant_key,
    tenant_id,
    date_trunc('month', started_at)::date as month,
    count(*) as runs,
    sum(cost_usd) as cost_usd,
    sum(input_tokens + output_tokens) as total_tokens
from public.skill_runs
group by 1, 2, 3;

grant select on public.tenant_usage_daily to authenticated;
grant select on public.tenant_usage_monthly to authenticated;
