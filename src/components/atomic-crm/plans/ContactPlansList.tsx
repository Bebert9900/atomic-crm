import { useGetList, useTranslate } from "ra-core";
import {
  FileText,
  ExternalLink,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import type { Identifier } from "ra-core";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { ContactPlan } from "../types";

const ERP_LABELS: Record<string, string> = {
  "erp-j": "ERP J – Seniors",
  "erp-l": "ERP L – Spectacles",
  "erp-m": "ERP M – Commerces",
  "erp-n": "ERP N – Restaurants",
  "erp-o": "ERP O – Hôtels",
  "erp-p": "ERP P – Discothèques",
  "erp-r": "ERP R – Enseignement",
  "erp-s": "ERP S – Bibliothèques",
  "erp-t": "ERP T – Expositions",
  "erp-u": "ERP U – Santé",
  "erp-v": "ERP V – Culte",
  "erp-w": "ERP W – Bureaux",
  "erp-x": "ERP X – Sports",
  "erp-y": "ERP Y – Musées",
  "erp-pa": "ERP PA – Plein air",
  "erp-ps": "ERP PS – Parkings",
  "non-erp": "Non ERP",
  custom: "Personnalisé",
};

const statusConfig: Record<string, { icon: typeof Clock; className: string }> =
  {
    draft: { icon: Clock, className: "text-yellow-600" },
    processing: { icon: Clock, className: "text-blue-600 animate-pulse" },
    completed: { icon: CheckCircle2, className: "text-green-600" },
    error: { icon: XCircle, className: "text-red-500" },
  };

function CompletionBar({ score }: { score: number | null }) {
  if (score == null) return null;
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums">
        {clamped}%
      </span>
    </div>
  );
}

export function ContactPlansList({ contactId }: { contactId: Identifier }) {
  const translate = useTranslate();
  const { data: plans, isPending } = useGetList<ContactPlan>("contact_plans", {
    filter: { contact_id: contactId },
    sort: { field: "updated_at", order: "DESC" },
    pagination: { page: 1, perPage: 50 },
  });

  if (isPending) return null;
  if (!plans?.length) {
    return (
      <p className="text-xs text-muted-foreground italic">
        {translate("resources.contact_plans.empty")}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {plans.map((plan) => {
        const StatusIcon =
          statusConfig[plan.status]?.icon ?? FileText;
        const statusClass =
          statusConfig[plan.status]?.className ?? "text-muted-foreground";

        return (
          <li
            key={plan.id}
            className="group rounded-lg border bg-card p-2 hover:shadow-sm transition-shadow"
          >
            <div className="flex gap-2">
              {/* Thumbnail */}
              {plan.thumbnail_url ? (
                <a
                  href={plan.preview_url ?? plan.thumbnail_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0"
                >
                  <img
                    src={plan.thumbnail_url}
                    alt={plan.name}
                    className="w-16 h-16 rounded object-cover border bg-muted"
                  />
                </a>
              ) : (
                <div className="w-16 h-16 rounded border bg-muted flex items-center justify-center shrink-0">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <StatusIcon
                          className={`h-3.5 w-3.5 shrink-0 ${statusClass}`}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {plan.status}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <span className="text-sm font-medium truncate">
                    {plan.name}
                  </span>
                  {plan.preview_url && (
                    <a
                      href={plan.preview_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </a>
                  )}
                </div>

                <div className="flex items-center gap-1.5 mt-0.5">
                  <Badge variant="secondary" className="text-[10px] px-1 py-0">
                    {ERP_LABELS[plan.plan_type] ?? plan.plan_type}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {plan.format} · {plan.orientation}
                  </span>
                </div>

                <div className="mt-1">
                  <CompletionBar score={plan.completion_score} />
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
