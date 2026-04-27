import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "stripe";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

/**
 * Reads Stripe credentials from `crm_integrations` row id='stripe'.
 * Pattern aligned with PostHog/BillionMail integrations: admins paste the
 * keys in the CRM Settings → Intégrations page; no env var to provision.
 */
type StripeConfig = {
  enabled: boolean;
  secret_key: string;
  webhook_secret: string;
};

async function getStripeConfig(): Promise<StripeConfig | null> {
  const { data, error } = await supabaseAdmin
    .from("crm_integrations")
    .select("*")
    .eq("id", "stripe")
    .single();
  if (error || !data) return null;
  const cfg = (data.config ?? {}) as Record<string, string>;
  if (!cfg.secret_key || !cfg.webhook_secret) return null;
  return {
    enabled: !!data.enabled,
    secret_key: cfg.secret_key,
    webhook_secret: cfg.webhook_secret,
  };
}

const cryptoProvider = Stripe.createSubtleCryptoProvider();

type Resolved = {
  companyId: number | null;
  contactId: number | null;
};

async function resolveCompanyIdByStripeCustomer(
  stripeCustomerId: string | null,
): Promise<number | null> {
  if (!stripeCustomerId) return null;
  const { data } = await supabaseAdmin
    .from("companies")
    .select("id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();
  return data?.id ?? null;
}

async function resolveContactByEmail(
  email: string | null,
): Promise<{ id: number; company_id: number | null } | null> {
  if (!email) return null;
  const normalized = email.toLowerCase();
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("id, company_id")
    .contains("email_jsonb", JSON.stringify([{ email: normalized }]))
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function fetchCustomerEmail(
  stripe: Stripe,
  stripeCustomerId: string | null,
): Promise<string | null> {
  if (!stripeCustomerId) return null;
  try {
    const cust = await stripe.customers.retrieve(stripeCustomerId);
    if ("deleted" in cust && cust.deleted) return null;
    return (cust as Stripe.Customer).email?.toLowerCase() ?? null;
  } catch (err) {
    console.error("Failed to retrieve Stripe customer", stripeCustomerId, err);
    return null;
  }
}

async function resolveLink(
  stripe: Stripe,
  stripeCustomerId: string | null,
  directEmail: string | null,
): Promise<Resolved> {
  const companyFromCustomer =
    await resolveCompanyIdByStripeCustomer(stripeCustomerId);

  let email = directEmail?.toLowerCase() ?? null;
  let contact = await resolveContactByEmail(email);

  if (!contact && stripeCustomerId) {
    email = await fetchCustomerEmail(stripe, stripeCustomerId);
    contact = await resolveContactByEmail(email);
  }

  const companyId = companyFromCustomer ?? contact?.company_id ?? null;
  const contactId = contact?.id ?? null;

  if (stripeCustomerId && !companyFromCustomer && contact?.company_id != null) {
    await supabaseAdmin
      .from("companies")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", contact.company_id)
      .is("stripe_customer_id", null);
  }

  return { companyId, contactId };
}

async function upsertPayment(row: Record<string, unknown>) {
  return supabaseAdmin
    .from("payments")
    .upsert(row, { onConflict: "stripe_event_id" });
}

async function upsertSubscription(stripe: Stripe, sub: Stripe.Subscription) {
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const { companyId } = await resolveLink(stripe, customerId, null);
  const item = sub.items.data[0];
  const price = item?.price;
  const productName =
    typeof price?.product === "string"
      ? null
      : ((price?.product as Stripe.Product | undefined)?.name ?? null);

  return supabaseAdmin.from("subscriptions").upsert(
    {
      stripe_subscription_id: sub.id,
      stripe_customer_id: customerId,
      company_id: companyId,
      status: sub.status,
      product_name: productName,
      amount: price?.unit_amount ?? null,
      currency: price?.currency ?? "eur",
      recurring_interval: price?.recurring?.interval ?? null,
      current_period_start: sub.current_period_start
        ? new Date(sub.current_period_start * 1000).toISOString()
        : null,
      current_period_end: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end: !!sub.cancel_at_period_end,
      canceled_at: sub.canceled_at
        ? new Date(sub.canceled_at * 1000).toISOString()
        : null,
      started_at: sub.start_date
        ? new Date(sub.start_date * 1000).toISOString()
        : null,
      metadata: sub.metadata ?? {},
    },
    { onConflict: "stripe_subscription_id" },
  );
}

async function upsertPayout(eventId: string, payout: Stripe.Payout) {
  return supabaseAdmin.from("stripe_payouts").upsert(
    {
      stripe_payout_id: payout.id,
      stripe_event_id: eventId,
      amount: payout.amount,
      currency: payout.currency,
      status: payout.status,
      arrival_date: payout.arrival_date
        ? new Date(payout.arrival_date * 1000).toISOString()
        : null,
      description: payout.description ?? null,
      failure_code: payout.failure_code ?? null,
      failure_message: payout.failure_message ?? null,
      method: payout.method ?? null,
      type: payout.type ?? null,
      metadata: payout.metadata ?? {},
      occurred_at: new Date().toISOString(),
    },
    { onConflict: "stripe_event_id" },
  );
}

async function handleEvent(stripe: Stripe, event: Stripe.Event) {
  const eventId = event.id;
  const occurredAt = new Date(event.created * 1000).toISOString();

  switch (event.type) {
    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.payment_succeeded": {
      const inv = event.data.object as Stripe.Invoice;
      const customerId =
        typeof inv.customer === "string"
          ? inv.customer
          : (inv.customer?.id ?? null);
      const { companyId, contactId } = await resolveLink(
        stripe,
        customerId,
        inv.customer_email ?? null,
      );
      await upsertPayment({
        stripe_event_id: eventId,
        stripe_object_id: inv.id,
        stripe_customer_id: customerId,
        company_id: companyId,
        contact_id: contactId,
        type: event.type.replace(".", "_"),
        status: inv.status,
        amount: inv.amount_paid ?? inv.amount_due ?? 0,
        currency: inv.currency ?? "eur",
        description:
          inv.description ?? inv.lines?.data?.[0]?.description ?? null,
        invoice_number: inv.number ?? null,
        hosted_invoice_url: inv.hosted_invoice_url ?? null,
        occurred_at: occurredAt,
        metadata: {
          subscription: inv.subscription ?? null,
          customer_email: inv.customer_email ?? null,
        },
      });
      break;
    }

    case "charge.succeeded":
    case "charge.refunded":
    case "charge.failed": {
      const ch = event.data.object as Stripe.Charge;
      const customerId =
        typeof ch.customer === "string"
          ? ch.customer
          : (ch.customer?.id ?? null);
      const chargeEmail = ch.receipt_email ?? ch.billing_details?.email ?? null;
      const { companyId, contactId } = await resolveLink(
        stripe,
        customerId,
        chargeEmail,
      );
      await upsertPayment({
        stripe_event_id: eventId,
        stripe_object_id: ch.id,
        stripe_customer_id: customerId,
        company_id: companyId,
        contact_id: contactId,
        type: event.type.replace(".", "_"),
        status: ch.status,
        amount: ch.amount,
        amount_refunded: ch.amount_refunded ?? 0,
        currency: ch.currency,
        description: ch.description ?? null,
        receipt_url: ch.receipt_url ?? null,
        occurred_at: occurredAt,
        metadata: {
          payment_intent: ch.payment_intent ?? null,
          refunded: !!ch.refunded,
          customer_email: chargeEmail,
        },
      });
      break;
    }

    case "payment_intent.succeeded":
    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const customerId =
        typeof pi.customer === "string"
          ? pi.customer
          : (pi.customer?.id ?? null);
      const piEmail = pi.receipt_email ?? null;
      const { companyId, contactId } = await resolveLink(
        stripe,
        customerId,
        piEmail,
      );
      await upsertPayment({
        stripe_event_id: eventId,
        stripe_object_id: pi.id,
        stripe_customer_id: customerId,
        company_id: companyId,
        contact_id: contactId,
        type: event.type.replace(".", "_"),
        status: pi.status,
        amount: pi.amount_received ?? pi.amount ?? 0,
        currency: pi.currency,
        description: pi.description ?? null,
        occurred_at: occurredAt,
        metadata: {
          latest_charge: pi.latest_charge ?? null,
          customer_email: piEmail,
        },
      });
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await upsertSubscription(stripe, sub);
      break;
    }

    case "payout.created":
    case "payout.paid":
    case "payout.failed":
    case "payout.canceled":
    case "payout.updated": {
      const payout = event.data.object as Stripe.Payout;
      await upsertPayout(eventId, payout);
      break;
    }

    default:
      // Ignore unhandled events; they simply won't produce rows.
      break;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const cfg = await getStripeConfig();
  if (!cfg) {
    return new Response(
      "Stripe integration is not configured. Set keys in CRM Settings → Intégrations.",
      { status: 503 },
    );
  }
  if (!cfg.enabled) {
    return new Response("Stripe integration is disabled.", { status: 503 });
  }

  const stripe = new Stripe(cfg.secret_key, {
    apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion,
    httpClient: Stripe.createFetchHttpClient(),
  });

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      cfg.webhook_secret,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    console.error("Stripe signature verification failed", err);
    return new Response(`Signature verification failed: ${err}`, {
      status: 400,
    });
  }

  try {
    await handleEvent(stripe, event);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Stripe webhook handler error", err);
    return new Response(`Handler error: ${err}`, { status: 500 });
  }
});
