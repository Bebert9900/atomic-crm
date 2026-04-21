import { useGetList } from "ra-core";
import { useMemo } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  startOfMonth,
  subMonths,
  isAfter,
  isBefore,
  differenceInDays,
} from "date-fns";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";

export const KpiCards = () => {
  const { currency } = useConfigurationContext();

  // Fetch deals from last 12 months for trend calculation
  const twelveMonthsAgo = useMemo(
    () => subMonths(new Date(), 12).toISOString(),
    [],
  );

  const { data: deals } = useGetList<Deal>("deals", {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: "created_at", order: "ASC" },
    filter: { "created_at@gte": twelveMonthsAgo },
  });

  const kpis = useMemo(() => {
    if (!deals) return null;

    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));

    // Pipeline ouvert = all active deals (not won/lost)
    const activeDeals = deals.filter(
      (d) => !["won", "lost"].includes(d.stage),
    );
    const pipelineTotal = activeDeals.reduce((s, d) => s + (d.amount || 0), 0);

    // Pipeline last month
    const activeDealsLastMonth = deals.filter(
      (d) =>
        !["won", "lost"].includes(d.stage) &&
        isBefore(new Date(d.created_at), thisMonthStart),
    );
    const pipelineLastMonth = activeDealsLastMonth.reduce(
      (s, d) => s + (d.amount || 0),
      0,
    );
    const pipelineTrend = pipelineLastMonth
      ? ((pipelineTotal - pipelineLastMonth) / pipelineLastMonth) * 100
      : 0;

    // Signé ce mois = won deals this month
    const wonThisMonth = deals.filter(
      (d) =>
        d.stage === "won" &&
        isAfter(new Date(d.updated_at || d.created_at), thisMonthStart),
    );
    const signedTotal = wonThisMonth.reduce((s, d) => s + (d.amount || 0), 0);

    const wonLastMonth = deals.filter(
      (d) =>
        d.stage === "won" &&
        isAfter(new Date(d.updated_at || d.created_at), lastMonthStart) &&
        isBefore(new Date(d.updated_at || d.created_at), thisMonthStart),
    );
    const signedLastMonth = wonLastMonth.reduce(
      (s, d) => s + (d.amount || 0),
      0,
    );
    const signedTrend = signedLastMonth
      ? ((signedTotal - signedLastMonth) / signedLastMonth) * 100
      : 0;

    // Taux de closing = won / (won + lost) over last 6 months
    const sixMonthsAgo = subMonths(now, 6);
    const recentDeals = deals.filter((d) =>
      isAfter(new Date(d.created_at), sixMonthsAgo),
    );
    const wonCount = recentDeals.filter((d) => d.stage === "won").length;
    const lostCount = recentDeals.filter((d) => d.stage === "lost").length;
    const closingRate =
      wonCount + lostCount > 0
        ? Math.round((wonCount / (wonCount + lostCount)) * 100)
        : 0;

    // Cycle moyen = avg days from created_at to updated_at for won deals
    const wonDeals = deals.filter((d) => d.stage === "won");
    const avgCycle =
      wonDeals.length > 0
        ? Math.round(
            wonDeals.reduce(
              (s, d) =>
                s +
                differenceInDays(
                  new Date(d.updated_at || d.created_at),
                  new Date(d.created_at),
                ),
              0,
            ) / wonDeals.length,
          )
        : 0;

    // Generate sparkline data (last 6 months)
    const sparklineData = generateSparkline(deals, 6);

    return {
      pipeline: {
        value: formatCurrency(pipelineTotal, currency),
        trend: pipelineTrend,
        sparkline: sparklineData.pipeline,
      },
      signed: {
        value: formatCurrency(signedTotal, currency),
        trend: signedTrend,
        sparkline: sparklineData.signed,
      },
      closing: {
        value: `${closingRate}`,
        unit: "%",
        trend: -2, // placeholder
        sparkline: sparklineData.closing,
      },
      cycle: {
        value: `${avgCycle}`,
        unit: "j",
        trend: -3, // placeholder
        sparkline: sparklineData.cycle,
      },
    };
  }, [deals, currency]);

  if (!kpis) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Pipeline ouvert"
        value={kpis.pipeline.value}
        trend={kpis.pipeline.trend}
        sparkline={kpis.pipeline.sparkline}
      />
      <KpiCard
        title="Signé ce mois"
        value={kpis.signed.value}
        trend={kpis.signed.trend}
        sparkline={kpis.signed.sparkline}
      />
      <KpiCard
        title="Taux de closing"
        value={kpis.closing.value}
        unit={kpis.closing.unit}
        trend={kpis.closing.trend}
        sparkline={kpis.closing.sparkline}
      />
      <KpiCard
        title="Cycle moyen (j)"
        value={kpis.cycle.value}
        unit={kpis.cycle.unit}
        trend={kpis.cycle.trend}
        sparkline={kpis.cycle.sparkline}
      />
    </div>
  );
};

/* ---------- KPI Card ---------- */

function KpiCard({
  title,
  value,
  unit,
  trend,
  sparkline,
}: {
  title: string;
  value: string;
  unit?: string;
  trend: number;
  sparkline: number[];
}) {
  const isPositive = trend >= 0;

  return (
    <Card className="p-4 flex flex-col gap-2">
      <p className="text-xs text-muted-foreground font-medium">{title}</p>
      <div className="flex items-end justify-between">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold tabular-nums">{value}</span>
          {unit && (
            <span className="text-sm text-muted-foreground font-medium">
              {unit}
            </span>
          )}
        </div>
        <Sparkline data={sparkline} positive={isPositive} />
      </div>
      <div className="flex items-center gap-1">
        {isPositive ? (
          <TrendingUp className="h-3 w-3 text-emerald-500" />
        ) : (
          <TrendingDown className="h-3 w-3 text-red-500" />
        )}
        <span
          className={cn(
            "text-xs font-medium",
            isPositive ? "text-emerald-500" : "text-red-500",
          )}
        >
          {isPositive ? "↑" : "↓"} {Math.abs(Math.round(trend * 10) / 10)}%
        </span>
      </div>
    </Card>
  );
}

/* ---------- Mini Sparkline (SVG) ---------- */

function Sparkline({
  data,
  positive,
}: {
  data: number[];
  positive: boolean;
}) {
  if (!data.length) return null;

  const width = 64;
  const height = 24;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
    >
      <polyline
        points={points}
        fill="none"
        stroke={positive ? "#10b981" : "#ef4444"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ---------- helpers ---------- */

function formatCurrency(amount: number, currency: string): string {
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(1).replace(/\.0$/, "")} k €`;
  }
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function generateSparkline(
  deals: Deal[],
  months: number,
): {
  pipeline: number[];
  signed: number[];
  closing: number[];
  cycle: number[];
} {
  const now = new Date();
  const result = {
    pipeline: [] as number[],
    signed: [] as number[],
    closing: [] as number[],
    cycle: [] as number[],
  };

  for (let i = months - 1; i >= 0; i--) {
    const monthStart = startOfMonth(subMonths(now, i));
    const monthEnd = startOfMonth(subMonths(now, i - 1));

    const monthDeals = deals.filter(
      (d) =>
        isAfter(new Date(d.created_at), monthStart) &&
        isBefore(new Date(d.created_at), monthEnd),
    );

    result.pipeline.push(
      monthDeals
        .filter((d) => !["won", "lost"].includes(d.stage))
        .reduce((s, d) => s + (d.amount || 0), 0),
    );

    result.signed.push(
      monthDeals
        .filter((d) => d.stage === "won")
        .reduce((s, d) => s + (d.amount || 0), 0),
    );

    const won = monthDeals.filter((d) => d.stage === "won").length;
    const lost = monthDeals.filter((d) => d.stage === "lost").length;
    result.closing.push(won + lost > 0 ? (won / (won + lost)) * 100 : 0);

    const wonCycles = monthDeals
      .filter((d) => d.stage === "won")
      .map((d) =>
        differenceInDays(
          new Date(d.updated_at || d.created_at),
          new Date(d.created_at),
        ),
      );
    result.cycle.push(
      wonCycles.length > 0
        ? wonCycles.reduce((s, v) => s + v, 0) / wonCycles.length
        : 0,
    );
  }

  return result;
}
