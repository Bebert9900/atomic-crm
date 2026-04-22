# stripe-webhook

Receives Stripe events and mirrors them into `public.payments` and
`public.subscriptions`. Rows are linked to a company via
`companies.stripe_customer_id`.

## Setup

1. In Stripe dashboard, create a webhook endpoint pointing to
   `https://<project>.functions.supabase.co/stripe-webhook`.
2. Subscribe at least to:
   - `invoice.paid`, `invoice.payment_failed`
   - `charge.succeeded`, `charge.refunded`, `charge.failed`
   - `payment_intent.succeeded`, `payment_intent.payment_failed`
   - `customer.subscription.created|updated|deleted`
3. Copy the signing secret and set the following env vars on the function:
   - `STRIPE_SECRET_KEY` (sk_live_... or sk_test_...)
   - `STRIPE_WEBHOOK_SECRET` (whsec_...)
4. On each `companies` row you want to track, paste the Stripe customer id
   (`cus_xxx`) in the "Stripe customer ID" field.

## Idempotency

Each event is keyed by `stripe_event_id`. Stripe retries are safe: a duplicate
event updates the same row instead of inserting a new one.

## Local dev

```
npx supabase functions serve stripe-webhook --env-file .env.local
stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook
```
