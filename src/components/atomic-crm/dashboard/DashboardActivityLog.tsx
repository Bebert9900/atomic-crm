import { Zap } from "lucide-react";
import { useTranslate } from "ra-core";
import { Card } from "@/components/ui/card";

import { ActivityLog } from "../activity/ActivityLog";

export function DashboardActivityLog() {
  const translate = useTranslate();
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">
          {translate("crm.dashboard.latest_activity", {
            _: "Activité",
          })}
        </h2>
      </div>
      <ActivityLog pageSize={8} />
    </Card>
  );
}
