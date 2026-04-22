import { ArrowDown, ArrowUp } from "lucide-react";
import { useGetList } from "ra-core";
import { Card } from "@/components/ui/card";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Contact, ContactNote, Deal } from "../types";
import { DashboardActivityLog } from "./DashboardActivityLog";
import { DashboardStepper } from "./DashboardStepper";
import { HotContacts } from "./HotContacts";
import { UnreadEmailsList } from "./UnreadEmailsList";

function KpiCard({
  label,
  value,
  suffix,
  delta,
  positive,
}: {
  label: string;
  value: string | number;
  suffix: string;
  delta: string;
  positive: boolean;
}) {
  return (
    <Card className="p-4 flex flex-col gap-1">
      <div className="text-[11.5px] text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <div className="text-[22px] font-semibold tabular-nums tracking-tight">
          {value}
        </div>
        <div className="text-[11.5px] text-muted-foreground">{suffix}</div>
      </div>
      <div className="flex items-center justify-between mt-1">
        <div
          className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
            positive ? "text-emerald-500" : "text-rose-500"
          }`}
        >
          {positive ? (
            <ArrowUp className="size-3" style={{ strokeWidth: 2.5 }} />
          ) : (
            <ArrowDown className="size-3" style={{ strokeWidth: 2.5 }} />
          )}
          <span>{delta}</span>
        </div>
      </div>
    </Card>
  );
}

function EmailsSection() {
  return <UnreadEmailsList />;
}

function KpiRow() {
  const { dealPipelineStatuses } = useConfigurationContext();
  const now = new Date();
  const startOfMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  ).toISOString();
  const startOfWeek = new Date(
    now.getTime() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: allDeals } = useGetList<Deal>("deals", {
    pagination: { page: 1, perPage: 500 },
    sort: { field: "updated_at", order: "DESC" },
  });

  const { total: contactsThisWeek } = useGetList<Contact>("contacts", {
    pagination: { page: 1, perPage: 1 },
    sort: { field: "created_at", order: "DESC" },
    filter: { "created_at@gte": startOfWeek },
  });

  const { total: totalContacts } = useGetList<Contact>("contacts", {
    pagination: { page: 1, perPage: 1 },
  });

  const exitStages = new Set([...(dealPipelineStatuses ?? []), "lost"]);
  const openDeals = (allDeals ?? []).filter((d) => !exitStages.has(d.stage));
  const wonDeals = (allDeals ?? []).filter((d) => d.stage === "won");

  const pipeline = openDeals.reduce((s, d) => s + (d.amount ?? 0), 0);

  const monthlyWon = wonDeals.filter(
    (d) => (d.updated_at ?? d.created_at) >= startOfMonth,
  );
  const closedAmount = monthlyWon.reduce((s, d) => s + (d.amount ?? 0), 0);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KpiCard
        label="Pipeline ouvert"
        value={(pipeline / 1000).toFixed(1)}
        suffix="k €"
        delta="actif"
        positive={true}
      />
      <KpiCard
        label="Signé ce mois"
        value={(closedAmount / 1000).toFixed(1)}
        suffix="k €"
        delta="ce mois"
        positive={closedAmount > 0}
      />
      <KpiCard
        label="Contacts ajoutés"
        value={contactsThisWeek ?? 0}
        suffix="cette sem."
        delta="+7j"
        positive={true}
      />
      <KpiCard
        label="Total contacts"
        value={totalContacts ?? 0}
        suffix="contacts"
        delta="CRM"
        positive={true}
      />
    </div>
  );
}

export const Dashboard = () => {
  const {
    data: dataContact,
    total: totalContact,
    isPending: isPendingContact,
  } = useGetList<Contact>("contacts", { pagination: { page: 1, perPage: 1 } });

  const { total: totalContactNotes, isPending: isPendingContactNotes } =
    useGetList<ContactNote>("contact_notes", {
      pagination: { page: 1, perPage: 1 },
    });

  const { isPending: isPendingDeal } = useGetList<Contact>("deals", {
    pagination: { page: 1, perPage: 1 },
  });

  const isPending = isPendingContact || isPendingContactNotes || isPendingDeal;

  if (isPending) return null;

  if (!totalContact) return <DashboardStepper step={1} />;
  if (!totalContactNotes)
    return <DashboardStepper step={2} contactId={dataContact?.[0]?.id} />;

  return (
    <div className="space-y-5">
      <KpiRow />

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-4">
          <HotContacts />
        </div>
        <div className="md:col-span-4">
          <DashboardActivityLog />
        </div>
        <div className="md:col-span-4">
          <EmailsSection />
        </div>
      </div>
    </div>
  );
};
