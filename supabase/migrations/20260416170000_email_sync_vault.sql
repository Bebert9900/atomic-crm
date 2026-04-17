-- Switch email password encryption to Supabase Vault
-- (app.settings.* GUCs are not allowed on Supabase-managed databases)

create or replace function public.encrypt_email_password(plain_password text)
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
      where name = 'email_encryption_key'
      limit 1;
    if encryption_key is null or encryption_key = '' then
        raise exception 'Email encryption key not configured in vault';
    end if;
    return encode(
        extensions.pgp_sym_encrypt(plain_password, encryption_key),
        'base64'
    );
end;
$$;

create or replace function public.decrypt_email_password(encrypted_password text)
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
      where name = 'email_encryption_key'
      limit 1;
    if encryption_key is null or encryption_key = '' then
        raise exception 'Email encryption key not configured in vault';
    end if;
    return extensions.pgp_sym_decrypt(
        decode(encrypted_password, 'base64'),
        encryption_key
    );
end;
$$;

revoke all on function public.encrypt_email_password(text) from public;
revoke all on function public.encrypt_email_password(text) from anon;
grant execute on function public.encrypt_email_password(text) to authenticated;
grant execute on function public.encrypt_email_password(text) to service_role;

revoke all on function public.decrypt_email_password(text) from public;
revoke all on function public.decrypt_email_password(text) from anon;
revoke all on function public.decrypt_email_password(text) from authenticated;
grant execute on function public.decrypt_email_password(text) to service_role;
