import { Link } from "react-router";
import { useCreatePath, useRecordContext, useTranslate } from "ra-core";
import { Card } from "@/components/ui/card";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Company } from "../types";
import { CompanyAvatar } from "./CompanyAvatar";
import { getTranslatedCompanySizeLabel } from "./getTranslatedCompanySizeLabel";
import { sizes } from "./sizes";

export const CompanyCard = (props: { record?: Company }) => {
  const createPath = useCreatePath();
  const record = useRecordContext<Company>(props);
  const translate = useTranslate();
  const { companySectors } = useConfigurationContext();
  if (!record) return null;

  const sector = companySectors.find((s) => s.value === record.sector);
  const sectorLabel = sector?.label ?? "";
  const sizeObj = sizes.find((s) => s.id === record.size);
  const sizeLabel = sizeObj
    ? getTranslatedCompanySizeLabel(sizeObj, translate)
    : "";

  const meta = [sectorLabel, sizeLabel].filter(Boolean).join(" · ");

  // Pipeline = approximation based on nb_deals (we don't have deal amounts here)
  // We'll show nb_deals and nb_contacts

  return (
    <Link
      to={createPath({
        resource: "companies",
        id: record.id,
        type: "show",
      })}
      className="no-underline"
    >
      <Card className="flex flex-col justify-between p-5 h-full hover:bg-muted/50 transition-colors">
        {/* Top: avatar + name + meta */}
        <div className="flex items-start gap-3 mb-4">
          <CompanyAvatar />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold truncate uppercase">
              {record.name}
            </h3>
            {meta && (
              <p className="text-xs text-muted-foreground truncate">{meta}</p>
            )}
          </div>
        </div>

        {/* Bottom: stats */}
        <div className="flex items-end gap-6">
          {record.nb_deals != null && (
            <div>
              <p className="text-[10px] text-muted-foreground font-medium">
                {translate("resources.deals.name", { smart_count: 2 })}
              </p>
              <p className="text-lg font-bold tabular-nums">{record.nb_deals}</p>
            </div>
          )}
          {record.nb_contacts != null && record.nb_contacts > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground font-medium">
                {translate("resources.contacts.name", { smart_count: 2 })}
              </p>
              <p className="text-lg font-bold tabular-nums">
                {record.nb_contacts}
              </p>
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
};
