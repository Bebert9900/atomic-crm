-- OAuth tokens per user for third-party providers (Anthropic Claude Code flow).
-- Tokens are sensitive: only the service role (edge functions) can read them.
-- Users can only query a derived is_connected status via a SECURITY DEFINER RPC.

create table public.user_oauth_tokens (
    user_id uuid not null references auth.users(id) on delete cascade,
    provider text not null check (provider in ('anthropic')),
    access_token text not null,
    refresh_token text,
    expires_at timestamptz,
    scopes text[] not null default '{}',
    subscription_type text,
    account_email text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, provider)
);

alter table public.user_oauth_tokens enable row level security;

-- No authenticated policy => authenticated users cannot SELECT/INSERT/UPDATE/DELETE directly.
-- Only service_role (bypasses RLS) can access this table, from edge functions.

create or replace function public.user_has_oauth_connection(p_provider text)
returns table(connected boolean, subscription_type text, account_email text, scopes text[])
language sql security definer set search_path = public as $$
    select true, t.subscription_type, t.account_email, t.scopes
      from public.user_oauth_tokens t
     where t.user_id = auth.uid()
       and t.provider = p_provider
       and (t.expires_at is null or t.expires_at > now() - interval '1 minute')
    union all
    select false, null::text, null::text, '{}'::text[]
     where not exists (
         select 1 from public.user_oauth_tokens
          where user_id = auth.uid() and provider = p_provider
     )
    limit 1;
$$;

grant execute on function public.user_has_oauth_connection(text) to authenticated;

create or replace function public.touch_oauth_tokens()
returns trigger language plpgsql as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger oauth_tokens_touch
before update on public.user_oauth_tokens
for each row execute function public.touch_oauth_tokens();
