--
-- Row Level Security
-- This file declares RLS policies for all tables.
--

-- Enable RLS on all tables
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_notes enable row level security;
alter table public.deals enable row level security;
alter table public.deal_notes enable row level security;
alter table public.sales enable row level security;
alter table public.tags enable row level security;
alter table public.tasks enable row level security;
alter table public.configuration enable row level security;
alter table public.favicons_excluded_domains enable row level security;

-- Companies
create policy "Enable read access for authenticated users" on public.companies for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.companies for insert to authenticated with check (true);
create policy "Enable update for authenticated users only" on public.companies for update to authenticated using (true) with check (true);
create policy "Company Delete Policy" on public.companies for delete to authenticated using (true);

-- Contacts
create policy "Enable read access for authenticated users" on public.contacts for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.contacts for insert to authenticated with check (true);
create policy "Enable update for authenticated users only" on public.contacts for update to authenticated using (true) with check (true);
create policy "Contact Delete Policy" on public.contacts for delete to authenticated using (true);

-- Contact Notes
create policy "Enable read access for authenticated users" on public.contact_notes for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.contact_notes for insert to authenticated with check (true);
create policy "Contact Notes Update policy" on public.contact_notes for update to authenticated using (true);
create policy "Contact Notes Delete Policy" on public.contact_notes for delete to authenticated using (true);

-- Deals
create policy "Enable read access for authenticated users" on public.deals for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.deals for insert to authenticated with check (true);
create policy "Enable update for authenticated users only" on public.deals for update to authenticated using (true) with check (true);
create policy "Deals Delete Policy" on public.deals for delete to authenticated using (true);

-- Deal Notes
create policy "Enable read access for authenticated users" on public.deal_notes for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.deal_notes for insert to authenticated with check (true);
create policy "Deal Notes Update Policy" on public.deal_notes for update to authenticated using (true);
create policy "Deal Notes Delete Policy" on public.deal_notes for delete to authenticated using (true);

-- Sales
create policy "Enable read access for authenticated users" on public.sales for select to authenticated using (true);

-- Tags
create policy "Enable read access for authenticated users" on public.tags for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.tags for insert to authenticated with check (true);
create policy "Enable update for authenticated users only" on public.tags for update to authenticated using (true);
create policy "Enable delete for authenticated users only" on public.tags for delete to authenticated using (true);

-- Tasks
create policy "Enable read access for authenticated users" on public.tasks for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.tasks for insert to authenticated with check (true);
create policy "Task Update Policy" on public.tasks for update to authenticated using (true);
create policy "Task Delete Policy" on public.tasks for delete to authenticated using (true);

-- Appointments
alter table public.appointments enable row level security;
create policy "Enable read access for authenticated users" on public.appointments for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.appointments for insert to authenticated with check (true);
create policy "Appointment Update Policy" on public.appointments for update to authenticated using (true);
create policy "Appointment Delete Policy" on public.appointments for delete to authenticated using (true);

-- Contact Recordings
alter table public.contact_recordings enable row level security;
create policy "Enable read access for authenticated users" on public.contact_recordings for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.contact_recordings for insert to authenticated with check (true);
create policy "Contact Recordings Update Policy" on public.contact_recordings for update to authenticated using (true);
create policy "Contact Recordings Delete Policy" on public.contact_recordings for delete to authenticated using (true);

-- Configuration (admin-only for writes)
create policy "Enable read for authenticated" on public.configuration for select to authenticated using (true);
create policy "Enable insert for admins" on public.configuration for insert to authenticated with check (public.is_admin());
create policy "Enable update for admins" on public.configuration for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Favicons excluded domains
create policy "Enable access for authenticated users only" on public.favicons_excluded_domains to authenticated using (true) with check (true);

-- Email Accounts (admin-only for writes, read for authenticated)
alter table public.email_accounts enable row level security;
create policy "Enable read for authenticated" on public.email_accounts for select to authenticated using (true);
create policy "Enable insert for admins" on public.email_accounts for insert to authenticated with check (public.is_admin());
create policy "Enable update for admins" on public.email_accounts for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Enable delete for admins" on public.email_accounts for delete to authenticated using (public.is_admin());

-- Email Messages
alter table public.email_messages enable row level security;
create policy "Enable read access for authenticated users" on public.email_messages for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.email_messages for insert to authenticated with check (true);
create policy "Email Messages Update Policy" on public.email_messages for update to authenticated using (true);
create policy "Email Messages Delete Policy" on public.email_messages for delete to authenticated using (true);

-- Email Sync State (admin-only)
alter table public.email_sync_state enable row level security;
create policy "Enable read for authenticated" on public.email_sync_state for select to authenticated using (true);
create policy "Enable insert for service role" on public.email_sync_state for insert to service_role with check (true);
create policy "Enable update for service role" on public.email_sync_state for update to service_role using (true);

-- Dev Tasks
alter table public.dev_tasks enable row level security;
create policy "Enable read access for authenticated users" on public.dev_tasks for select to authenticated using (true);
create policy "Enable insert for authenticated users" on public.dev_tasks for insert to authenticated with check (true);
create policy "Enable update for authenticated users" on public.dev_tasks for update to authenticated using (true) with check (true);
create policy "Enable delete for authenticated users" on public.dev_tasks for delete to authenticated using (true);

alter table public.dev_task_labels enable row level security;
create policy "Enable read access for authenticated users" on public.dev_task_labels for select to authenticated using (true);
create policy "Enable insert for authenticated users" on public.dev_task_labels for insert to authenticated with check (true);
create policy "Enable update for authenticated users" on public.dev_task_labels for update to authenticated using (true) with check (true);
create policy "Enable delete for authenticated users" on public.dev_task_labels for delete to authenticated using (true);

-- Stripe payments & subscriptions (read-only for authenticated, writes reserved to service role via webhook)
alter table public.payments enable row level security;
create policy "Enable read for authenticated" on public.payments for select to authenticated using (true);
create policy "Enable insert for service role" on public.payments for insert to service_role with check (true);
create policy "Enable update for service role" on public.payments for update to service_role using (true) with check (true);
create policy "Enable delete for service role" on public.payments for delete to service_role using (true);

alter table public.subscriptions enable row level security;
create policy "Enable read for authenticated" on public.subscriptions for select to authenticated using (true);
create policy "Enable insert for service role" on public.subscriptions for insert to service_role with check (true);
create policy "Enable update for service role" on public.subscriptions for update to service_role using (true) with check (true);
create policy "Enable delete for service role" on public.subscriptions for delete to service_role using (true);

-- Agentic: skill_runs — user-scoped (each user sees only their own runs)
alter table public.skill_runs enable row level security;
create policy "skill_runs_select_own" on public.skill_runs
    for select to authenticated using (user_id = auth.uid());
create policy "skill_runs_insert_own" on public.skill_runs
    for insert to authenticated with check (user_id = auth.uid());
create policy "skill_runs_update_own" on public.skill_runs
    for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "skill_runs_service_all" on public.skill_runs
    for all to service_role using (true) with check (true);

-- Agentic: circuit breaker (admins only via app; service_role for runtime)
alter table public.agentic_circuit_state enable row level security;
create policy "agentic_circuit_state_select_admin" on public.agentic_circuit_state
    for select to authenticated using (
        exists (select 1 from public.sales
                where user_id = auth.uid() and administrator)
    );
create policy "agentic_circuit_state_update_admin" on public.agentic_circuit_state
    for update to authenticated using (
        exists (select 1 from public.sales
                where user_id = auth.uid() and administrator)
    ) with check (
        exists (select 1 from public.sales
                where user_id = auth.uid() and administrator)
    );
create policy "agentic_circuit_state_service_all" on public.agentic_circuit_state
    for all to service_role using (true) with check (true);

-- Agentic: tenant settings (admins only)
alter table public.tenant_settings enable row level security;
create policy "tenant_settings_select_admin" on public.tenant_settings
    for select to authenticated using (
        exists (select 1 from public.sales
                where user_id = auth.uid() and administrator)
    );
create policy "tenant_settings_update_admin" on public.tenant_settings
    for update to authenticated using (
        exists (select 1 from public.sales
                where user_id = auth.uid() and administrator)
    ) with check (
        exists (select 1 from public.sales
                where user_id = auth.uid() and administrator)
    );
create policy "tenant_settings_insert_admin" on public.tenant_settings
    for insert to authenticated with check (
        exists (select 1 from public.sales
                where user_id = auth.uid() and administrator)
    );
create policy "tenant_settings_service_all" on public.tenant_settings
    for all to service_role using (true) with check (true);
