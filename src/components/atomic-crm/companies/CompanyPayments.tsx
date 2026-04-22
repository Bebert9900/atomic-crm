import { useGetList } from "ra-core";
import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  RefreshCcw,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Payment, Subscription } from "../types";

function formatAmount(cents: number | null | undefined, currency = "eur") {
  if (cents == null) return "—";
  const amount = cents / 100;
  try {
    return amount.toLocaleString("fr-FR", {
      style: "currency",
      currency: currency.toUpperCase(),
    });
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function PaymentIcon({ type }: { type: string }) {
  if (type.includes("refund"))
    return <RefreshCcw className="size-4 text-amber-500" />;
  if (type.includes("failed"))
    return <XCircle className="size-4 text-rose-500" />;
  if (type.includes("paid") || type.includes("succeeded"))
    return <CheckCircle2 className="size-4 text-emerald-500" />;
  return <CreditCard className="size-4 text-muted-foreground" />;
}

function SubscriptionStatusBadge({ status }: { status: string }) {
  const tone =
    status === "active" || status === "trialing"
      ? "bg-emerald-500/15 text-emerald-600"
      : status === "past_due" || status === "unpaid"
        ? "bg-amber-500/15 text-amber-600"
        : status === "canceled" || status === "incomplete_expired"
          ? "bg-muted text-muted-foreground"
          : "bg-muted text-foreground";
  return (
    <Badge variant="outline" className={`font-normal ${tone}`}>
      {status}
    </Badge>
  );
}

export const CompanyPayments = ({ companyId }: { companyId: number }) => {
  const { data: subscriptions, isPending: isSubsPending } =
    useGetList<Subscription>("subscriptions", {
      pagination: { page: 1, perPage: 20 },
      sort: { field: "created_at", order: "DESC" },
      filter: { company_id: companyId },
    });

  const { data: payments, isPending: isPayPending } = useGetList<Payment>(
    "payments",
    {
      pagination: { page: 1, perPage: 50 },
      sort: { field: "occurred_at", order: "DESC" },
      filter: { company_id: companyId },
    },
  );

  const isPending = isSubsPending || isPayPending;

  if (isPending) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        Chargement des paiements…
      </div>
    );
  }

  const hasSubs = (subscriptions?.length ?? 0) > 0;
  const hasPayments = (payments?.length ?? 0) > 0;

  if (!hasSubs && !hasPayments) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Aucun paiement Stripe rattaché à cette entreprise.
          <div className="mt-1 text-xs">
            Renseigne le Stripe customer ID dans la fiche pour commencer.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5 pt-2">
      {hasSubs && (
        <section>
          <h6 className="mb-2 text-sm font-semibold">Abonnements</h6>
          <div className="flex flex-col gap-2">
            {subscriptions!.map((sub) => (
              <Card key={sub.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {sub.product_name ?? "Abonnement"}
                      <SubscriptionStatusBadge status={sub.status} />
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {formatAmount(sub.amount, sub.currency ?? "eur")}
                      {sub.recurring_interval
                        ? ` / ${sub.recurring_interval}`
                        : ""}
                      {" · "}
                      Depuis {formatDate(sub.started_at ?? sub.created_at)}
                    </div>
                    {sub.current_period_end && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Période en cours jusqu'au{" "}
                        {formatDate(sub.current_period_end)}
                        {sub.cancel_at_period_end
                          ? " · résiliation programmée"
                          : ""}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {hasPayments && (
        <section>
          <h6 className="mb-2 text-sm font-semibold">
            Historique des paiements
          </h6>
          <div className="flex flex-col divide-y divide-border rounded-md border">
            {payments!.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <PaymentIcon type={p.type} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {p.description ??
                      p.invoice_number ??
                      p.type.replace(/_/g, " ")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(p.occurred_at)}
                    {p.status ? ` · ${p.status}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-semibold tabular-nums">
                    {formatAmount(p.amount, p.currency)}
                  </div>
                  {p.amount_refunded > 0 && (
                    <div className="text-[11px] text-amber-600">
                      remb. {formatAmount(p.amount_refunded, p.currency)}
                    </div>
                  )}
                </div>
                {(p.hosted_invoice_url || p.receipt_url) && (
                  <a
                    href={p.hosted_invoice_url ?? p.receipt_url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                    title="Ouvrir dans Stripe"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
