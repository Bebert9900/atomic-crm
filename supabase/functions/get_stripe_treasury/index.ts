import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "stripe";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

/**
 * Returns Stripe treasury snapshot for the CRM Affaires page / dashboard.
 * Reads credentials from `crm_integrations` row id='stripe' (no env var to provision).
 * Admin-only — verified server-side via `sales.administrator`.
 */
function errorResponse(
  status: number,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return new Response(
    JSON.stringify({ ok: false, status, message, ...extra }),
    {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    },
  );
}

async function getStripeConfig() {
  const { data, error } = await supabaseAdmin
    .from("crm_integrations")
    .select("*")
    .eq("id", "stripe")
    .single();
  if (error || !data) return null;
  const cfg = (data.config ?? {}) as Record<string, string>;
  if (!cfg.secret_key) return null;
  return {
    enabled: !!data.enabled,
    secret_key: cfg.secret_key,
    has_webhook_secret: !!cfg.webhook_secret,
  };
}

async function requireAdmin(
  req: Request,
): Promise<{ ok: true } | { ok: false; res: Response }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader)
    return {
      ok: false,
      res: errorResponse(401, "Missing Authorization header"),
    };
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SB_PUBLISHABLE_KEY") ??
      Deno.env.get("SUPABASE_ANON_KEY") ??
      "",
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user)
    return { ok: false, res: errorResponse(401, "Unauthorized") };
  const userId = data.user.id;
  const { data: sale } = await supabaseAdmin
    .from("sales")
    .select("administrator")
    .eq("user_id", userId)
    .maybeSingle();
  if (!sale?.administrator)
    return { ok: false, res: errorResponse(403, "Admin only") };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const adminCheck = await requireAdmin(req);
  if (!adminCheck.ok) return adminCheck.res;

  const cfg = await getStripeConfig();
  if (!cfg) {
    return new Response(
      JSON.stringify({
        ok: false,
        configured: false,
        message: "Stripe not configured",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
  if (!cfg.enabled) {
    return new Response(
      JSON.stringify({
        ok: false,
        configured: true,
        enabled: false,
        message: "Stripe disabled",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }

  const stripe = new Stripe(cfg.secret_key, {
    apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion,
    httpClient: Stripe.createFetchHttpClient(),
  });

  try {
    const [balance, payouts] = await Promise.all([
      stripe.balance.retrieve(),
      stripe.payouts.list({ limit: 5 }),
    ]);

    const sumAmounts = (arr: Array<{ amount: number; currency: string }>) => {
      const byCcy: Record<string, number> = {};
      for (const a of arr) {
        byCcy[a.currency] = (byCcy[a.currency] ?? 0) + a.amount;
      }
      return byCcy;
    };

    const available = sumAmounts(balance.available);
    const pending = sumAmounts(balance.pending);
    const inTransit = sumAmounts(
      (balance as unknown as { instant_available?: typeof balance.available })
        .instant_available ?? [],
    );

    const recentPayouts = payouts.data.map((p) => ({
      id: p.id,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      arrival_date: p.arrival_date
        ? new Date(p.arrival_date * 1000).toISOString()
        : null,
      method: p.method,
      description: p.description,
      failure_message: p.failure_message,
    }));

    const nextPayout =
      recentPayouts.find(
        (p) => p.status === "in_transit" || p.status === "pending",
      ) ?? null;

    return new Response(
      JSON.stringify({
        ok: true,
        configured: true,
        enabled: true,
        has_webhook_secret: cfg.has_webhook_secret,
        balance: { available, pending, in_transit: inTransit },
        next_payout: nextPayout,
        recent_payouts: recentPayouts,
        retrieved_at: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResponse(502, `Stripe API error: ${msg}`);
  }
});
