-- Agentic circuit breaker state (Story C.2)

create table public.agentic_circuit_state (
    skill_id text primary key,
    state text not null default 'closed'
        check (state in ('closed','open','half_open')),
    opened_at timestamptz,
    last_check_at timestamptz not null default now(),
    consecutive_errors int not null default 0
);

alter table public.agentic_circuit_state enable row level security;

create policy "agentic_circuit_state_select_admin" on public.agentic_circuit_state
    for select to authenticated using (
        exists (
            select 1 from public.sales
            where user_id = auth.uid() and administrator
        )
    );

create policy "agentic_circuit_state_update_admin" on public.agentic_circuit_state
    for update to authenticated using (
        exists (
            select 1 from public.sales
            where user_id = auth.uid() and administrator
        )
    ) with check (
        exists (
            select 1 from public.sales
            where user_id = auth.uid() and administrator
        )
    );

create policy "agentic_circuit_state_service_all" on public.agentic_circuit_state
    for all to service_role using (true) with check (true);

grant select, update on public.agentic_circuit_state to authenticated;
grant all on public.agentic_circuit_state to service_role;
