-- Remove all scoring machinery: triggers, functions, view, tables, policies, grants.
-- Destroys historical score_events data. Irreversible.

drop trigger if exists score_company_insert        on public.companies;
drop trigger if exists score_contact_insert        on public.contacts;
drop trigger if exists score_contact_status_change on public.contacts;
drop trigger if exists score_contact_note_insert   on public.contact_notes;
drop trigger if exists score_task_done             on public.tasks;
drop trigger if exists score_deal_insert           on public.deals;
drop trigger if exists score_deal_stage_change     on public.deals;
drop trigger if exists score_dev_task_done         on public.dev_tasks;
drop trigger if exists score_dev_task_reopened     on public.dev_tasks;

drop view if exists public.management_scoreboard;

drop function if exists public.score_on_company_insert();
drop function if exists public.score_on_contact_insert();
drop function if exists public.score_on_contact_status_change();
drop function if exists public.score_on_contact_note_insert();
drop function if exists public.score_on_task_done();
drop function if exists public.score_on_deal_insert();
drop function if exists public.score_on_deal_stage_change();
drop function if exists public.score_on_dev_task_done();
drop function if exists public.score_on_dev_task_reopened();
drop function if exists public.emit_score_event(bigint, text, text, text, bigint, numeric, numeric, text, jsonb);
drop function if exists public.resolve_source_weight(text);
drop function if exists public.resolve_weight_class_value(text, numeric);
drop function if exists public.is_meaningful_note(text, jsonb[]);
drop function if exists public.resolve_lead_source(bigint, bigint, bigint);

drop table if exists public.score_events;
drop table if exists public.score_rules;
drop table if exists public.score_targets;
