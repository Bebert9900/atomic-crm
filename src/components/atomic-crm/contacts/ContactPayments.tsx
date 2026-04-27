import { useGetList, useRecordContext } from "ra-core";
import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  RefreshCcw,
  XCircle,
  Wallet,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { Contact, Payment } from "../types";

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

export const ContactPayments = () => {
  const record = useRecordContext<Contact>();

  const { data: payments, isPending } = useGetList<Payment>(
    "payments",
    {
      pagination: { page: 1, perPage: 50 },
      sort: { field: "occurred_at", order: "DESC" },
      filter: { contact_id: record?.id },
    },
    { enabled: !!record?.id },
  );

  if (!record) return null;

  if (isPending) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        Chargement des paiements…
      </div>
    );
  }

  if (!payments?.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Aucun paiement Stripe rattaché à ce contact.
          <div className="mt-1 text-xs">
            Les paiements sont liés automatiquement par email lorsque Stripe est
            configuré.
          </div>
        </CardContent>
      </Card>
    );
  }

  const ltvByCcy: Record<string, number> = {};
  for (const p of payments) {
    if (
      p.type.includes("succeeded") ||
      p.type === "invoice_paid" ||
      p.type === "charge_refunded"
    ) {
      const net = (p.amount ?? 0) - (p.amount_refunded ?? 0);
      ltvByCcy[p.currency] = (ltvByCcy[p.currency] ?? 0) + net;
    }
  }
  const ltvLabel = Object.entries(ltvByCcy)
    .map(([ccy, c]) => formatAmount(c, ccy))
    .join(" + ");

  return (
    <div className="flex flex-col gap-4 pt-2">
      {ltvLabel && (
        <div className="flex flex-col gap-1 px-3 py-2 rounded-md border bg-card max-w-fit">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" />
            Lifetime value (contact)
          </div>
          <div className="text-base font-semibold tabular-nums">{ltvLabel}</div>
        </div>
      )}

      <div className="flex flex-col divide-y divide-border rounded-md border">
        {payments.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <PaymentIcon type={p.type} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">
                {p.description ?? p.invoice_number ?? p.type.replace(/_/g, " ")}
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
    </div>
  );
};
