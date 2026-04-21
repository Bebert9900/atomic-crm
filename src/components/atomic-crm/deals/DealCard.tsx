import { Draggable } from "@hello-pangea/dnd";
import { useRedirect, RecordContextProvider } from "ra-core";
import { ReferenceField } from "@/components/admin/reference-field";
import { NumberField } from "@/components/admin/number-field";
import { SelectField } from "@/components/admin/select-field";
import { Card, CardContent } from "@/components/ui/card";

import { CompanyAvatar } from "../companies/CompanyAvatar";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";

export const DealCard = ({ deal, index }: { deal: Deal; index: number }) => {
  if (!deal) return null;

  return (
    <Draggable draggableId={String(deal.id)} index={index}>
      {(provided, snapshot) => (
        <DealCardContent provided={provided} snapshot={snapshot} deal={deal} />
      )}
    </Draggable>
  );
};

export const DealCardContent = ({
  provided,
  snapshot,
  deal,
}: {
  provided?: any;
  snapshot?: any;
  deal: Deal;
}) => {
  const { dealCategories, currency } = useConfigurationContext();
  const redirect = useRedirect();
  const handleClick = () => {
    redirect(`/deals/${deal.id}/show`, undefined, undefined, undefined, {
      _scrollToTop: false,
    });
  };

  return (
    <div
      className="cursor-pointer"
      {...provided?.draggableProps}
      {...provided?.dragHandleProps}
      ref={provided?.innerRef}
      onClick={handleClick}
    >
      <RecordContextProvider value={deal}>
        <Card
          className={`py-2.5 transition-all duration-200 border ${
            snapshot?.isDragging
              ? "opacity-90 rotate-1 shadow-lg ring-2 ring-primary/20"
              : "shadow-sm hover:shadow-md hover:border-primary/30"
          }`}
        >
          <CardContent className="px-3 flex flex-col gap-1.5">
            <div className="flex items-start gap-2">
              <ReferenceField
                source="company_id"
                reference="companies"
                link={false}
              >
                <CompanyAvatar width={20} height={20} />
              </ReferenceField>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate leading-tight">
                  {deal.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  <ReferenceField
                    source="company_id"
                    reference="companies"
                    link={false}
                  />
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold tabular-nums">
                <NumberField
                  source="amount"
                  options={{
                    notation: "compact",
                    style: "currency",
                    currency,
                    currencyDisplay: "narrowSymbol",
                    minimumSignificantDigits: 3,
                  }}
                />
              </span>
              {deal.category && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  <SelectField
                    source="category"
                    choices={dealCategories}
                    optionText="label"
                    optionValue="value"
                  />
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </RecordContextProvider>
    </div>
  );
};
