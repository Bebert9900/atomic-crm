-- Per-user API keys for LLM providers (Anthropic, DeepSeek, OpenRouter, ...).
-- Pattern mirrors email_accounts: encryption via pgcrypto + Supabase Vault secret,
-- authenticated users manage their own row, decryption only for service_role.

create extension if not exists "pgcrypto" with schema "extensions";

-- Provision the encryption secret if missing. Generates a random 32-byte secret
-- on first run; can be overridden manually in the Vault UI.
do $$
declare
    existing text;
begin
    select decrypted_secret into existing
      from vault.decrypted_secrets
     where name = 'ai_keys_encryption_key'
     limit 1;
    if existing is null or existing = '' then
        perform vault.create_secret(
            encode(extensions.gen_random_bytes(32), 'base64'),
            'ai_keys_encryption_key',
            'Symmetric key for encrypting user-provided LLM API keys'
        );
    end if;
end $$;

create table public.user_api_keys (
    user_id uuid not null references auth.users(id) on delete cascade,
    provider text not null check (provider in ('anthropic', 'deepseek', 'openrouter')),
    encrypted_key text not null,
    label text,
    model text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, provider)
);

alter table public.user_api_keys enable row level security;

-- Authenticated users can manage their own row. The encrypted_key column is
-- opaque (ciphertext) — RLS prevents reading other users' rows; decryption is
-- service_role only.
create policy "users_select_own_keys"
    on public.user_api_keys for select
    to authenticated
    using (user_id = auth.uid());

create policy "users_insert_own_keys"
    on public.user_api_keys for insert
    to authenticated
    with check (user_id = auth.uid());

create policy "users_update_own_keys"
    on public.user_api_keys for update
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create policy "users_delete_own_keys"
    on public.user_api_keys for delete
    to authenticated
    using (user_id = auth.uid());

-- Encryption RPC: callable by authenticated users to encrypt their plaintext
-- key client-side before storing. Never persists the plaintext.
create or replace function public.encrypt_ai_key(plain_key text)
returns text
language plpgsql security definer
set search_path to ''
as $$
declare
    encryption_key text;
begin
    select decrypted_secret
      into encryption_key
      from vault.decrypted_secrets
     where name = 'ai_keys_encryption_key'
     limit 1;
    if encryption_key is null or encryption_key = '' then
        raise exception 'AI keys encryption secret not configured in vault';
    end if;
    return encode(
        extensions.pgp_sym_encrypt(plain_key, encryption_key),
        'base64'
    );
end;
$$;

-- Decryption RPC: service_role only (called from edge functions).
create or replace function public.decrypt_ai_key(encrypted_key text)
returns text
language plpgsql security definer
set search_path to ''
as $$
declare
    encryption_key text;
begin
    select decrypted_secret
      into encryption_key
      from vault.decrypted_secrets
     where name = 'ai_keys_encryption_key'
     limit 1;
    if encryption_key is null or encryption_key = '' then
        raise exception 'AI keys encryption secret not configured in vault';
    end if;
    return extensions.pgp_sym_decrypt(
        decode(encrypted_key, 'base64'),
        encryption_key
    );
end;
$$;

revoke all on function public.encrypt_ai_key(text) from public;
revoke all on function public.encrypt_ai_key(text) from anon;
grant execute on function public.encrypt_ai_key(text) to authenticated;
grant execute on function public.encrypt_ai_key(text) to service_role;

revoke all on function public.decrypt_ai_key(text) from public;
revoke all on function public.decrypt_ai_key(text) from anon;
revoke all on function public.decrypt_ai_key(text) from authenticated;
grant execute on function public.decrypt_ai_key(text) to service_role;

-- Auto-update updated_at on row changes.
create or replace function public.touch_user_api_keys()
returns trigger language plpgsql as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger user_api_keys_touch
before update on public.user_api_keys
for each row execute function public.touch_user_api_keys();
