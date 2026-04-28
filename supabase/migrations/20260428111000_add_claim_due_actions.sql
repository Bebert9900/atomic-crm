-- Atomic claim of due scheduled actions: marks them 'running' and increments attempts.
create or replace function public.agentic_claim_due_actions(p_limit int default 5)
returns table (
    id bigint,
    skill_id text,
    input jsonb,
    user_id uuid,
    attempts smallint
)
language plpgsql
security definer
set search_path = public
as $$
begin
    return query
    with claimed as (
        update public.agentic_scheduled_actions a
        set status = 'running',
            started_at = now(),
            attempts = a.attempts + 1
        where a.id in (
            select s.id
            from public.agentic_scheduled_actions s
            where s.status = 'pending'
              and s.run_at <= now()
            order by s.run_at asc
            limit p_limit
            for update skip locked
        )
        returning a.id, a.skill_id, a.input, a.user_id, a.attempts
    )
    select * from claimed;
end;
$$;

revoke all on function public.agentic_claim_due_actions(int) from public;
grant execute on function public.agentic_claim_due_actions(int) to service_role;
