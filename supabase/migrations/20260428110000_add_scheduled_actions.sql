-- Scheduled actions for the proactive agent (Sprint 3).
-- A worker (agentic-scheduler edge fn, pg_cron-driven) polls due rows and POSTs
-- to /agent-runtime/run.

create table public.agentic_scheduled_actions (
    id bigserial primary key,
    skill_id text not null,
    input jsonb not null default '{}'::jsonb,
    run_at timestamptz not null,
    status text not null default 'pending',
    -- Use idempotency_key to dedupe (e.g. "pre_meeting_alert:appt_42").
    idempotency_key text unique,
    user_id uuid references auth.users(id) on delete cascade,
    tenant_id uuid,
    result jsonb,
    error_message text,
    attempts smallint not null default 0,
    created_at timestamptz not null default now(),
    started_at timestamptz,
    ended_at timestamptz
);

create index agentic_scheduled_actions_due_idx
    on public.agentic_scheduled_actions (status, run_at)
    where status = 'pending';

create index agentic_scheduled_actions_user_idx
    on public.agentic_scheduled_actions (user_id, run_at desc);

alter table public.agentic_scheduled_actions enable row level security;

create policy agentic_scheduled_actions_owner
    on public.agentic_scheduled_actions
    for select
    using (user_id = auth.uid());

create policy agentic_scheduled_actions_owner_insert
    on public.agentic_scheduled_actions
    for insert
    with check (user_id = auth.uid());

create policy agentic_scheduled_actions_owner_update
    on public.agentic_scheduled_actions
    for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

grant select, insert, update on public.agentic_scheduled_actions to authenticated;
grant usage, select on sequence public.agentic_scheduled_actions_id_seq to authenticated;
