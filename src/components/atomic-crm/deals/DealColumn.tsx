import { Droppable } from "@hello-pangea/dnd";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";
import { findDealLabel } from "./dealUtils";
import { DealCard } from "./DealCard";

export const DealColumn = ({
  stage,
  deals,
}: {
  stage: string;
  deals: Deal[];
}) => {
  const totalAmount = deals.reduce((sum, deal) => sum + deal.amount, 0);
  const { dealStages, currency } = useConfigurationContext();
  return (
    <div className="flex-1 min-w-[220px] pb-8">
      <div className="flex flex-col items-center gap-0.5 mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide">
            {findDealLabel(dealStages, stage)}
          </h3>
          <span className="inline-flex items-center justify-center rounded-full bg-muted px-1.5 py-0 text-[11px] font-medium tabular-nums text-muted-foreground">
            {deals.length}
          </span>
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {totalAmount.toLocaleString("en-US", {
            notation: "compact",
            style: "currency",
            currency,
            currencyDisplay: "narrowSymbol",
            minimumSignificantDigits: 3,
          })}
        </p>
      </div>
      <Droppable droppableId={stage}>
        {(droppableProvided, snapshot) => (
          <div
            ref={droppableProvided.innerRef}
            {...droppableProvided.droppableProps}
            className={`flex flex-col rounded-xl min-h-[100px] p-1.5 gap-2 transition-colors ${
              snapshot.isDraggingOver
                ? "bg-primary/5 ring-1 ring-primary/20"
                : "bg-muted/30"
            }`}
          >
            {deals.map((deal, index) => (
              <DealCard key={deal.id} deal={deal} index={index} />
            ))}
            {droppableProvided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
};
