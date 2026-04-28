-- Triggers: enqueue scheduled actions on key DB events.

-- 1) When a recording transcription becomes ready → enqueue call_to_note
create or replace function public.enqueue_call_to_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
begin
    if (NEW.transcription_status in ('ready', 'completed'))
       and (OLD is null or OLD.transcription_status is distinct from NEW.transcription_status)
       and NEW.summary is not null then
        -- pick the sales user_id linked to the recording (best-effort)
        select user_id into v_user_id
        from public.sales where id = NEW.sales_id;
        insert into public.agentic_scheduled_actions
            (skill_id, input, run_at, idempotency_key, user_id)
        values (
            'call_to_note',
            jsonb_build_object('recording_id', NEW.id),
            now(),
            'call_to_note:rec_' || NEW.id,
            v_user_id
        )
        on conflict (idempotency_key) do nothing;
    end if;
    return NEW;
end;
$$;

drop trigger if exists trg_enqueue_call_to_note on public.contact_recordings;
create trigger trg_enqueue_call_to_note
    after insert or update of transcription_status, summary
    on public.contact_recordings
    for each row execute function public.enqueue_call_to_note();

-- 2) When an appointment is created or rescheduled in the future → enqueue pre_meeting_alert 30min before
create or replace function public.enqueue_pre_meeting_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
    v_alert_at timestamptz;
begin
    if NEW.start_at is null then
        return NEW;
    end if;
    v_alert_at := NEW.start_at - interval '30 minutes';
    if v_alert_at <= now() then
        return NEW;
    end if;
    select user_id into v_user_id
    from public.sales where id = NEW.sales_id;
    insert into public.agentic_scheduled_actions
        (skill_id, input, run_at, idempotency_key, user_id)
    values (
        'pre_meeting_alert',
        jsonb_build_object('appointment_id', NEW.id),
        v_alert_at,
        'pre_meeting_alert:appt_' || NEW.id,
        v_user_id
    )
    on conflict (idempotency_key) do update
        set run_at = excluded.run_at,
            status = 'pending',
            error_message = null
        where public.agentic_scheduled_actions.status in ('pending', 'error');
    return NEW;
end;
$$;

drop trigger if exists trg_enqueue_pre_meeting_alert on public.appointments;
create trigger trg_enqueue_pre_meeting_alert
    after insert or update of start_at
    on public.appointments
    for each row execute function public.enqueue_pre_meeting_alert();
