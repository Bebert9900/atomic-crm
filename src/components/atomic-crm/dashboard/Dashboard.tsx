import { useGetIdentity, useGetList, useTranslate } from "ra-core";

import type { Contact, ContactNote } from "../types";
import { PageHeader } from "../layout/PageHeader";
import { DashboardStepper } from "./DashboardStepper";
import { KpiCards } from "./KpiCards";
import { TodayTasks } from "./TodayTasks";
import { PipelinePulse } from "./PipelinePulse";
import { TodayAgenda } from "./TodayAgenda";
import { DashboardActivityLog } from "./DashboardActivityLog";
import { UnreadEmailsList } from "./UnreadEmailsList";

export const Dashboard = () => {
  const { identity } = useGetIdentity();
  const translate = useTranslate();

  const {
    data: dataContact,
    total: totalContact,
    isPending: isPendingContact,
  } = useGetList<Contact>("contacts", {
    pagination: { page: 1, perPage: 1 },
  });

  const { total: totalContactNotes, isPending: isPendingContactNotes } =
    useGetList<ContactNote>("contact_notes", {
      pagination: { page: 1, perPage: 1 },
    });

  const isPending = isPendingContact || isPendingContactNotes;

  if (isPending) {
    return null;
  }

  if (!totalContact) {
    return <DashboardStepper step={1} />;
  }

  if (!totalContactNotes) {
    return <DashboardStepper step={2} contactId={dataContact?.[0]?.id} />;
  }

  const firstName = identity?.fullName?.split(" ")[0] ?? "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={translate("crm.dashboard.welcome", {
          name: firstName,
          _: `Bon retour, ${firstName}`,
        })}
        subtitle={translate("crm.dashboard.subtitle", {
          _: "Voici ta priorité du jour",
        })}
      />

      {/* KPI row */}
      <KpiCards />

      {/* Main grid: 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <TodayTasks />
        </div>

        {/* Right column (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <UnreadEmailsList />
          <PipelinePulse />
          <TodayAgenda />
          <DashboardActivityLog />
        </div>
      </div>
    </div>
  );
};
