import { useGetIdentity, useGetList } from "ra-core";
import { Link } from "react-router";
import {
  Wallet,
  TrendingUp,
  Repeat,
  ArrowRight,
  AlertTriangle,
  RefreshCcw,
  CreditCard,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { FinanceMetrics } from "../types";
import { formatCents, formatCentsByCurrency } from "./treasuryFormat";
import { useStripeTreasury } from "./useStripeTreasury";

const StatCard = ({
  icon: Icon,
  label,
  value,
  hint,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) => (
  <div
    className={cn(
      "flex flex-col gap-1 px-3 py-2 rounded-md border bg-card min-w-[150px]",
      className,
    )}
  >
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
    <div className="text-lg font-semibold tabular-nums">{value}</div>
    {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
  </div>
);

export const TreasuryBanner = () => {
  const { identity } = useGetIdentity();
  const isAdmin = !!(identity as unknown as { administrator?: boolean })
    ?.administrator;

  const treasuryQuery = useStripeTreasury(isAdmin);
  const { data: metricsList, isPending: metricsPending } =
    useGetList<FinanceMetrics>("finance_metrics", {
      pagination: { page: 1, perPage: 1 },
      sort: { field: "id", order: "ASC" },
    });
  const metrics = metricsList?.[0];

  if (!isAdmin) return null;

  // Loading skeleton
  if (treasuryQuery.isPending || metricsPending) {
    return (
      <Card className="mb-3">
        <CardContent className="p-4 flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
          Chargement de la trésorerie…
        </CardContent>
      </Card>
    );
  }

  const treasury = treasuryQuery.data;

  // Not configured / disabled state
  if (!treasury?.ok) {
    const message = !treasury?.configured
      ? "Stripe n'est pas encore branché. Renseigne les clés pour voir la trésorerie en temps réel."
      : !treasury?.enabled
        ? "L'intégration Stripe est configurée mais désactivée."
        : (treasury?.message ?? "Stripe indisponible");

    return (
      <Card className="mb-3 border-dashed">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-md bg-muted">
            {treasury?.configured ? (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            ) : (
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Trésorerie</p>
            <p className="text-xs text-muted-foreground">{message}</p>
          </div>
          <Link to="/settings/integrations">
            <Button variant="outline" size="sm">
              Configurer Stripe
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const ccy = metrics?.currency ?? "eur";
  const mrr = metrics?.mrr_cents ?? 0;
  const arr = metrics?.arr_cents ?? 0;
  const revenue30 = metrics?.revenue_30d_cents ?? 0;
  const refunded30 = metrics?.refunded_30d_cents ?? 0;
  const activeSubs = metrics?.active_subscriptions ?? 0;
  const churned = metrics?.churned_30d_count ?? 0;

  const available = treasury.balance?.available ?? {};
  const pending = treasury.balance?.pending ?? {};

  const nextPayout = treasury.next_payout;
  const recentPayouts = treasury.recent_payouts ?? [];

  return (
    <Card className="mb-3">
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Trésorerie en temps réel</h3>
            <Badge variant="outline" className="text-[10px]">
              Stripe
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {treasury.retrieved_at && (
              <span className="text-[11px] text-muted-foreground">
                MAJ{" "}
                {new Date(treasury.retrieved_at).toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => treasuryQuery.refetch()}
              disabled={treasuryQuery.isFetching}
            >
              <RefreshCcw
                className={cn(
                  "h-3.5 w-3.5",
                  treasuryQuery.isFetching && "animate-spin",
                )}
              />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatCard
            icon={Wallet}
            label="Solde disponible"
            value={formatCentsByCurrency(available)}
            hint={
              Object.keys(pending).length > 0
                ? `+ ${formatCentsByCurrency(pending)} en attente`
                : undefined
            }
            className="border-emerald-300/60 dark:border-emerald-700/60"
          />
          <StatCard
            icon={Repeat}
            label="MRR"
            value={formatCents(mrr, ccy)}
            hint={`${activeSubs} abonnement${activeSubs > 1 ? "s" : ""} actif${activeSubs > 1 ? "s" : ""}`}
          />
          <StatCard
            icon={TrendingUp}
            label="ARR"
            value={formatCents(arr, ccy)}
          />
          <StatCard
            icon={TrendingUp}
            label="Revenus 30j"
            value={formatCents(revenue30, ccy)}
            hint={
              refunded30 > 0
                ? `${formatCents(refunded30, ccy)} remboursés`
                : `${metrics?.payments_30d_count ?? 0} paiements`
            }
          />
          {churned > 0 && (
            <StatCard
              icon={AlertTriangle}
              label="Churn 30j"
              value={`${churned} sub${churned > 1 ? "s" : ""}`}
              className="border-rose-300/60 dark:border-rose-700/60"
            />
          )}
        </div>

        {(nextPayout || recentPayouts.length > 0) && (
          <div className="flex flex-col gap-1 pt-2 border-t">
            <p className="text-[11px] font-medium text-muted-foreground">
              Virements récents
            </p>
            <div className="flex flex-wrap gap-1.5">
              {recentPayouts.slice(0, 5).map((p) => (
                <Badge
                  key={p.id}
                  variant="outline"
                  className={cn(
                    "text-[11px] gap-1.5",
                    p.status === "paid" &&
                      "border-emerald-300/70 text-emerald-700 dark:border-emerald-700/70 dark:text-emerald-300",
                    (p.status === "pending" || p.status === "in_transit") &&
                      "border-sky-300/70 text-sky-700 dark:border-sky-700/70 dark:text-sky-300",
                    p.status === "failed" &&
                      "border-rose-300/70 text-rose-700 dark:border-rose-700/70 dark:text-rose-300",
                  )}
                  title={p.failure_message ?? p.description ?? ""}
                >
                  <span className="font-medium">
                    {formatCents(p.amount, p.currency)}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">
                    {p.arrival_date
                      ? new Date(p.arrival_date).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                        })
                      : "—"}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span>{p.status}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
