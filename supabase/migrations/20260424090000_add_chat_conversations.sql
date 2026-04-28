-- Agent chat: multi-turn conversations with the CRM assistant

create table public.chat_conversations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    tenant_id uuid,
    title text not null default 'Nouvelle conversation',
    context jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz
);

create index chat_conversations_user_updated_idx
    on public.chat_conversations (user_id, updated_at desc)
    where archived_at is null;

create table public.chat_messages (
    id bigint generated always as identity primary key,
    conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
    role text not null check (role in ('user','assistant','tool')),
    content text,
    tool_calls jsonb,
    tool_results jsonb,
    skill_run_id bigint references public.skill_runs(id) on delete set null,
    created_at timestamptz not null default now()
);

create index chat_messages_conv_idx
    on public.chat_messages (conversation_id, id);

create or replace function public.touch_chat_conversation()
returns trigger language plpgsql as $$
begin
    update public.chat_conversations
       set updated_at = now()
     where id = new.conversation_id;
    return new;
end;
$$;

create trigger chat_messages_touch_conv
after insert on public.chat_messages
for each row execute function public.touch_chat_conversation();

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

create policy chat_conversations_owner on public.chat_conversations
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy chat_messages_owner on public.chat_messages
    for all using (
        exists (
            select 1 from public.chat_conversations c
            where c.id = chat_messages.conversation_id and c.user_id = auth.uid()
        )
    ) with check (
        exists (
            select 1 from public.chat_conversations c
            where c.id = chat_messages.conversation_id and c.user_id = auth.uid()
        )
    );

grant select, insert, update, delete on public.chat_conversations to authenticated;
grant select, insert, update, delete on public.chat_messages to authenticated;
grant usage, select on all sequences in schema public to authenticated;
