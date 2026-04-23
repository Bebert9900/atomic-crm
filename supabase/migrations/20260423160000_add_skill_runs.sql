-- Agentic foundation (Story A.1)
-- Adds skill_runs table, append_skill_run_trace function, metrics view, RLS, grants.

-- Table
create table public.skill_runs (
    id bigint generated always as identity primary key,
    skill_id text not null,
    skill_version text not null,
    user_id uuid not null references auth.users(id),
    tenant_id uuid,
    input jsonb not null default '{}'::jsonb,
    trace jsonb not null default '[]'::jsonb,
    output jsonb,
    status text not null default 'running'
        check (status in ('running','success','error','cancelled','shadow')),
    dry_run boolean not null default false,
    input_tokens int,
    output_tokens int,
    cache_read_tokens int,
    cache_creation_tokens int,
    cost_usd numeric(10,6),
    error_code text,
    error_message text,
    model text,
    started_at timestamptz not null default now(),
    ended_at timestamptz
);

create index if not exists skill_runs_user_id_started_at_idx
    on public.skill_runs (user_id, started_at desc);
create index if not exists skill_runs_skill_id_started_at_idx
    on public.skill_runs (skill_id, started_at desc);
create index if not exists skill_runs_status_running_idx
    on public.skill_runs (status) where status = 'running';
create index if not exists skill_runs_tenant_id_started_at_idx
    on public.skill_runs (tenant_id, started_at desc) where tenant_id is not null;

-- Function: append a step to a run's trace (RLS enforced via auth.uid())
create or replace function public.append_skill_run_trace(
    p_run_id bigint,
    p_step jsonb
) returns void
    language sql
    security invoker
as $$
    update public.skill_runs
    set trace = trace || jsonb_build_array(p_step)
    where id = p_run_id and user_id = auth.uid();
$$;

-- View: hourly metrics over last 24h
create or replace view public.skill_runs_metrics_1d with (security_invoker = on) as
select
    skill_id,
    date_trunc('hour', started_at) as bucket,
    count(*) as runs,
    count(*) filter (where status = 'success') as successes,
    count(*) filter (where status = 'error') as errors,
    count(*) filter (where status = 'cancelled') as cancellations,
    count(*) filter (where dry_run) as dry_runs,
    avg(extract(epoch from ended_at - started_at))
        filter (where ended_at is not null) as avg_duration_s,
    percentile_disc(0.95) within group (order by extract(epoch from ended_at - started_at))
        filter (where ended_at is not null) as p95_duration_s,
    sum(cost_usd) as total_cost_usd,
    sum(input_tokens) as total_input_tokens,
    sum(output_tokens) as total_output_tokens
from public.skill_runs
where started_at > now() - interval '24 hours'
group by 1, 2;

-- RLS
alter table public.skill_runs enable row level security;

create policy "skill_runs_select_own" on public.skill_runs
    for select to authenticated using (user_id = auth.uid());
create policy "skill_runs_insert_own" on public.skill_runs
    for insert to authenticated with check (user_id = auth.uid());
create policy "skill_runs_update_own" on public.skill_runs
    for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "skill_runs_service_all" on public.skill_runs
    for all to service_role using (true) with check (true);

-- Grants
grant select, insert, update on public.skill_runs to authenticated;
grant all on public.skill_runs to service_role;
grant usage, select on sequence public.skill_runs_id_seq to authenticated;
grant select on public.skill_runs_metrics_1d to authenticated;

grant all on function public.append_skill_run_trace(bigint, jsonb) to authenticated;
grant all on function public.append_skill_run_trace(bigint, jsonb) to service_role;
