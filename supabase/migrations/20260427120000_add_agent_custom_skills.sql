-- Custom skills authored from the UI by an admin. Loaded at runtime by the
-- agent-runtime edge function and merged with code-defined skills.
-- A custom skill with the same skill_id as a code skill OVERRIDES the code one
-- (useful to tweak prompts without redeploying).

create table public.agent_custom_skills (
    id uuid primary key default gen_random_uuid(),
    skill_id text not null unique,
    version text not null default '1.0.0',
    description text not null default '',
    model text not null,
    tools_allowed jsonb not null default '[]'::jsonb,
    max_iterations int not null default 8 check (max_iterations between 1 and 50),
    max_writes int not null default 4 check (max_writes between 0 and 50),
    rate_limit jsonb not null default '{"per_minute": 2, "per_hour": 20}'::jsonb,
    system_prompt text not null,
    enabled boolean not null default true,
    tenant_id uuid,
    created_by uuid not null references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint agent_custom_skills_skill_id_format
        check (skill_id ~ '^[a-z][a-z0-9_]{2,63}$')
);

create index agent_custom_skills_enabled_idx
    on public.agent_custom_skills (enabled)
    where enabled = true;

create index agent_custom_skills_tenant_idx
    on public.agent_custom_skills (tenant_id)
    where tenant_id is not null;

create or replace function public.touch_agent_custom_skills()
returns trigger language plpgsql as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger agent_custom_skills_touch
    before update on public.agent_custom_skills
    for each row execute function public.touch_agent_custom_skills();

alter table public.agent_custom_skills enable row level security;

-- Read: any authenticated CRM user can SEE the catalog (so the UI can render
-- the list everywhere). Sensitive data (system_prompt) is fine to show within
-- the team — same model as the rest of Atomic CRM.
create policy agent_custom_skills_select_authenticated
    on public.agent_custom_skills for select
    to authenticated
    using (true);

-- Write: only administrators can author/edit. The 'sales' table holds the
-- administrator flag; we resolve auth.uid() → sales.user_id → administrator.
create policy agent_custom_skills_write_admin
    on public.agent_custom_skills for all
    to authenticated
    using (
        exists (
            select 1 from public.sales s
             where s.user_id = auth.uid()
               and coalesce(s.administrator, false)
        )
    )
    with check (
        exists (
            select 1 from public.sales s
             where s.user_id = auth.uid()
               and coalesce(s.administrator, false)
        )
    );

grant select on public.agent_custom_skills to authenticated;
grant all on public.agent_custom_skills to service_role;
