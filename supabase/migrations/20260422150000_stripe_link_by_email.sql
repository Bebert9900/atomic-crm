-- Allow attributing a payment to a specific contact (resolved by email from Stripe).

alter table public.payments
    add column if not exists contact_id bigint
        references public.contacts(id) on delete set null;

create index if not exists payments_contact_id_idx on public.payments (contact_id);
