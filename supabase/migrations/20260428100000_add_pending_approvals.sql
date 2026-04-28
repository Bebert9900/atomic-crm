-- Pending approvals: agent registers an action serverside, frontend "approve" button
-- POSTs to /approvals/:id/execute which re-dispatches via tool registry.

create table public.agentic_pending_approvals (
    id uuid primary key default gen_random_uuid(),
    run_id bigint references public.skill_runs(id) on delete set null,
    conversation_id uuid references public.chat_conversations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    tenant_id uuid,
    kind text not null,
    payload jsonb not null,
    summary text,
    status text not null default 'pending',
    result jsonb,
    error_message text,
    expires_at timestamptz not null default (now() + interval '1 hour'),
    created_at timestamptz not null default now(),
    decided_at timestamptz
);

create index agentic_pending_approvals_user_status_idx
    on public.agentic_pending_approvals (user_id, status, expires_at);

alter table public.agentic_pending_approvals enable row level security;

create policy agentic_pending_approvals_owner
    on public.agentic_pending_approvals
    for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

grant select, insert, update on public.agentic_pending_approvals to authenticated;
