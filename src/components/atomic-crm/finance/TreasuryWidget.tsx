import { useGetIdentity, useGetList } from "ra-core";
import { Link } from "react-router";
import { Wallet, ArrowRight, CreditCard, Repeat } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import type { FinanceMetrics } from "../types";
import { formatCents, formatCentsByCurrency } from "./treasuryFormat";
import { useStripeTreasury } from "./useStripeTreasury";

export const TreasuryWidget = () => {
  const { identity } = useGetIdentity();
  const isAdmin = !!(identity as unknown as { administrator?: boolean })
    ?.administrator;

  const treasuryQuery = useStripeTreasury(isAdmin);
  const { data: metricsList } = useGetList<FinanceMetrics>("finance_metrics", {
    pagination: { page: 1, perPage: 1 },
    sort: { field: "id", order: "ASC" },
  });
  const metrics = metricsList?.[0];

  if (!isAdmin) return null;

  const treasury = treasuryQuery.data;

  if (treasuryQuery.isPending) {
    return (
      <Card className="p-3 text-[12px] text-muted-foreground">Trésorerie…</Card>
    );
  }

  if (!treasury?.ok) {
    return (
      <Card className="p-3">
        <div className="flex items-start gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-medium">Trésorerie</div>
            <div className="text-[11px] text-muted-foreground">
              Stripe pas branché.
            </div>
          </div>
          <Link to="/settings/integrations">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]">
              Configurer
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  const ccy = metrics?.currency ?? "eur";
  const mrr = metrics?.mrr_cents ?? 0;
  const available = treasury.balance?.available ?? {};

  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 mb-2">
        <Wallet className="h-3.5 w-3.5" />
        <span className="text-[12.5px] font-medium">Trésorerie</span>
        <Link
          to="/deals"
          className="ml-auto text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
        >
          Détails <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[10.5px] text-muted-foreground">Solde dispo</div>
          <div className="text-[14px] font-semibold tabular-nums">
            {formatCentsByCurrency(available)}
          </div>
        </div>
        <div>
          <div className="text-[10.5px] text-muted-foreground inline-flex items-center gap-1">
            <Repeat className="h-3 w-3" /> MRR
          </div>
          <div className="text-[14px] font-semibold tabular-nums">
            {formatCents(mrr, ccy)}
          </div>
        </div>
      </div>
    </Card>
  );
};
