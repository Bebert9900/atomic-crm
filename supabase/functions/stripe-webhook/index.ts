import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "stripe";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
  throw new Error(
    "Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET env variable",
  );
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion,
  httpClient: Stripe.createFetchHttpClient(),
});

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
  stripeCustomerId: string | null,
  directEmail: string | null,
): Promise<Resolved> {
  // 1. Fast path: company already linked by stripe_customer_id
  const companyFromCustomer =
    await resolveCompanyIdByStripeCustomer(stripeCustomerId);

  // 2. Try to find a contact matching the event's email
  //    (directEmail is invoice.customer_email / receipt_email / etc.)
  let email = directEmail?.toLowerCase() ?? null;
  let contact = await resolveContactByEmail(email);

  // 3. Fallback: ask Stripe for the customer's email
  if (!contact && stripeCustomerId) {
    email = await fetchCustomerEmail(stripeCustomerId);
    contact = await resolveContactByEmail(email);
  }

  const companyId = companyFromCustomer ?? contact?.company_id ?? null;
  const contactId = contact?.id ?? null;

  // 4. Backfill companies.stripe_customer_id the first time we resolve it
  //    via email — next events will take the fast path.
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

async function upsertSubscription(sub: Stripe.Subscription) {
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const { companyId } = await resolveLink(customerId, null);
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

async function handleEvent(event: Stripe.Event) {
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
      const { companyId, contactId } = await resolveLink(customerId, piEmail);
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
      await upsertSubscription(sub);
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
      STRIPE_WEBHOOK_SECRET,
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
    await handleEvent(event);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Stripe webhook handler error", err);
    return new Response(`Handler error: ${err}`, { status: 500 });
  }
});
