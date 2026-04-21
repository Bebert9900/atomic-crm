import { useGetList, useTranslate } from "ra-core";
import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";

export const PipelinePulse = () => {
  const translate = useTranslate();
  const { dealStages } = useConfigurationContext();

  const { data: deals } = useGetList<Deal>("deals", {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: "created_at", order: "ASC" },
  });

  const stageData = useMemo(() => {
    if (!deals || !dealStages) return [];

    // Only show active stages (not won/lost)
    const activeStages = dealStages.filter(
      (s) => !["won", "lost"].includes(s.value),
    );

    // Add "Gagné" at the end
    const wonStage = dealStages.find((s) => s.value === "won");

    const stages = [...activeStages];
    if (wonStage) stages.push(wonStage);

    return stages.map((stage) => {
      const stageDeals = deals.filter((d) => d.stage === stage.value);
      const amount = stageDeals.reduce((s, d) => s + (d.amount || 0), 0);
      return {
        label: stage.label,
        value: stage.value,
        amount,
        count: stageDeals.length,
      };
    });
  }, [deals, dealStages]);

  const totalDeals = useMemo(
    () => stageData.reduce((s, d) => s + d.count, 0),
    [stageData],
  );

  const maxAmount = useMemo(
    () => Math.max(...stageData.map((d) => d.amount), 1),
    [stageData],
  );

  if (!stageData.length) return null;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-semibold flex-1">Pulse pipeline</h2>
        <span className="text-xs text-muted-foreground">
          {totalDeals}{" "}
          {translate("resources.deals.name", {
            smart_count: totalDeals,
          }).toLowerCase()}
        </span>
      </div>

      <div className="flex items-end gap-3 h-32">
        {stageData.map((stage) => {
          const heightPct = Math.max(
            (stage.amount / maxAmount) * 100,
            4,
          );
          return (
            <div
              key={stage.value}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {formatCompact(stage.amount)}
              </span>
              <div className="w-full flex items-end" style={{ height: "80px" }}>
                <div
                  className={cn(
                    "w-full rounded-t transition-all",
                    getStageColor(stage.value),
                  )}
                  style={{ height: `${heightPct}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground text-center truncate w-full">
                {truncateLabel(stage.label)}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

/* ---------- helpers ---------- */

const STAGE_COLORS: Record<string, string> = {
  opportunity: "bg-blue-500/70",
  "proposal-sent": "bg-indigo-500/70",
  "in-negociation": "bg-violet-500/70",
  delayed: "bg-amber-500/70",
  won: "bg-emerald-500/70",
};

function getStageColor(value: string): string {
  return STAGE_COLORS[value] ?? "bg-primary/50";
}

function formatCompact(amount: number): string {
  if (amount >= 1000) return `${Math.round(amount / 1000)}k €`;
  return `${amount} €`;
}

function truncateLabel(label: string): string {
  if (label.length > 8) return label.slice(0, 6) + "…";
  return label;
}
