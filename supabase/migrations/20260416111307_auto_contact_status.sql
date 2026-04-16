set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.compute_contact_status(p_contact_id bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  score int := 0;
  has_won_deal boolean := false;
  active_deal_stage text;
  notes_last_30d int;
  notes_last_7d int;
  total_notes int;
  upcoming_appointments int;
  recent_appointments int;
  pending_tasks int;
  recordings_count int;
  last_activity_days int;
BEGIN
  -- Check for won deals (immediate in-contract)
  SELECT EXISTS(
    SELECT 1 FROM deals
    WHERE contact_ids @> ARRAY[p_contact_id]
      AND stage = 'won'
      AND archived_at IS NULL
  ) INTO has_won_deal;

  IF has_won_deal THEN
    RETURN 'in-contract';
  END IF;

  -- Notes in last 30 days
  SELECT count(*) INTO notes_last_30d FROM contact_notes
  WHERE contact_id = p_contact_id AND date > now() - interval '30 days';

  -- Notes in last 7 days
  SELECT count(*) INTO notes_last_7d FROM contact_notes
  WHERE contact_id = p_contact_id AND date > now() - interval '7 days';

  -- Total notes
  SELECT count(*) INTO total_notes FROM contact_notes
  WHERE contact_id = p_contact_id;

  -- Upcoming appointments (scheduled, in the future)
  SELECT count(*) INTO upcoming_appointments FROM appointments
  WHERE contact_id = p_contact_id AND status = 'scheduled' AND start_at > now();

  -- Recent appointments (last 14 days)
  SELECT count(*) INTO recent_appointments FROM appointments
  WHERE contact_id = p_contact_id AND status = 'completed'
    AND start_at > now() - interval '14 days';

  -- Pending tasks
  SELECT count(*) INTO pending_tasks FROM tasks
  WHERE contact_id = p_contact_id AND done_date IS NULL;

  -- Recordings
  SELECT count(*) INTO recordings_count FROM contact_recordings
  WHERE contact_id = p_contact_id;

  -- Active deal in advanced stage
  SELECT stage INTO active_deal_stage FROM deals
  WHERE contact_ids @> ARRAY[p_contact_id]
    AND archived_at IS NULL
    AND stage IN ('in-negociation', 'proposal-sent')
  LIMIT 1;

  -- Days since last activity
  SELECT EXTRACT(day FROM now() - GREATEST(
    COALESCE((SELECT max(date) FROM contact_notes WHERE contact_id = p_contact_id), '1970-01-01'::timestamptz),
    COALESCE((SELECT max(start_at) FROM appointments WHERE contact_id = p_contact_id), '1970-01-01'::timestamptz),
    COALESCE((SELECT max(created_at) FROM contact_recordings WHERE contact_id = p_contact_id), '1970-01-01'::timestamptz)
  ))::int INTO last_activity_days;

  -- Scoring
  score := score + notes_last_7d * 5;
  score := score + notes_last_30d * 2;
  score := score + total_notes;
  score := score + upcoming_appointments * 8;
  score := score + recent_appointments * 6;
  score := score + pending_tasks * 2;
  score := score + recordings_count * 3;

  IF active_deal_stage = 'in-negociation' THEN
    score := score + 15;
  ELSIF active_deal_stage = 'proposal-sent' THEN
    score := score + 10;
  END IF;

  -- Decay for inactivity
  IF last_activity_days > 60 THEN
    score := score - 10;
  ELSIF last_activity_days > 30 THEN
    score := score - 5;
  END IF;

  -- Map score to status
  IF score >= 15 THEN
    RETURN 'hot';
  ELSIF score >= 6 THEN
    RETURN 'warm';
  ELSE
    RETURN 'cold';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_contact_status_on_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contact_id bigint;
  new_status text;
  current_status text;
BEGIN
  -- Extract contact_id depending on the source table
  IF TG_TABLE_NAME = 'deals' THEN
    -- For deals, update all linked contacts
    DECLARE
      cid bigint;
      contact_ids_arr bigint[];
    BEGIN
      IF TG_OP = 'DELETE' THEN
        contact_ids_arr := OLD.contact_ids;
      ELSE
        contact_ids_arr := NEW.contact_ids;
      END IF;

      IF contact_ids_arr IS NOT NULL THEN
        FOREACH cid IN ARRAY contact_ids_arr LOOP
          new_status := compute_contact_status(cid);
          SELECT status INTO current_status FROM contacts WHERE id = cid;
          IF current_status IS DISTINCT FROM new_status THEN
            UPDATE contacts SET status = new_status WHERE id = cid;
          END IF;
        END LOOP;
      END IF;

      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END;
  END IF;

  -- For other tables, use contact_id column
  IF TG_OP = 'DELETE' THEN
    v_contact_id := OLD.contact_id;
  ELSE
    v_contact_id := NEW.contact_id;
  END IF;

  IF v_contact_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  new_status := compute_contact_status(v_contact_id);
  SELECT status INTO current_status FROM contacts WHERE id = v_contact_id;

  IF current_status IS DISTINCT FROM new_status THEN
    UPDATE contacts SET status = new_status WHERE id = v_contact_id;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$
;

CREATE TRIGGER update_contact_status_on_appointment AFTER INSERT OR DELETE OR UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.update_contact_status_on_activity();

CREATE TRIGGER update_contact_status_on_note AFTER INSERT OR DELETE ON public.contact_notes FOR EACH ROW EXECUTE FUNCTION public.update_contact_status_on_activity();

CREATE TRIGGER update_contact_status_on_recording AFTER INSERT ON public.contact_recordings FOR EACH ROW EXECUTE FUNCTION public.update_contact_status_on_activity();

CREATE TRIGGER update_contact_status_on_deal AFTER INSERT OR DELETE OR UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.update_contact_status_on_activity();

CREATE TRIGGER update_contact_status_on_task AFTER INSERT OR DELETE OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_contact_status_on_activity();


