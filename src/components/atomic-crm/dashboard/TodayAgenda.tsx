import { useGetList, useTranslate } from "ra-core";
import { useMemo } from "react";
import { CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { Appointment } from "../types";

const STATUS_ACCENT: Record<string, string> = {
  scheduled: "border-l-blue-500",
  completed: "border-l-emerald-500",
  cancelled: "border-l-red-500",
};

export const TodayAgenda = () => {
  const translate = useTranslate();

  // Fetch today's appointments
  const todayStart = useMemo(
    () => new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
    [],
  );
  const todayEnd = useMemo(
    () => new Date(new Date().setHours(23, 59, 59, 999)).toISOString(),
    [],
  );

  const { data: appointments } = useGetList<Appointment>("appointments", {
    pagination: { page: 1, perPage: 20 },
    sort: { field: "start_at", order: "ASC" },
    filter: {
      "start_at@gte": todayStart,
      "start_at@lte": todayEnd,
    },
  });

  const todayFormatted = format(new Date(), "EEEE d MMMM", { locale: fr });

  if (!appointments?.length) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold flex-1">Agenda du jour</h2>
          <span className="text-xs text-muted-foreground capitalize">
            {todayFormatted}
          </span>
        </div>
        <p className="text-sm text-muted-foreground italic">
          {translate("crm.dashboard.no_appointments", {
            _: "Aucun rendez-vous aujourd'hui",
          })}
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-semibold flex-1">Agenda du jour</h2>
        <span className="text-xs text-muted-foreground capitalize">
          {todayFormatted}
        </span>
      </div>

      <ul className="flex flex-col gap-1">
        {appointments.map((apt) => (
          <AgendaItem key={apt.id} appointment={apt} />
        ))}
      </ul>
    </Card>
  );
};

function AgendaItem({ appointment }: { appointment: Appointment }) {
  const startTime = format(new Date(appointment.start_at), "HH:mm");
  const durationMinutes = Math.round(
    (new Date(appointment.end_at).getTime() -
      new Date(appointment.start_at).getTime()) /
      60000,
  );

  const durationLabel =
    durationMinutes >= 60
      ? `${Math.floor(durationMinutes / 60)} h ${durationMinutes % 60 ? `${durationMinutes % 60} min` : ""}`
      : `${durationMinutes} min`;

  const accentClass =
    STATUS_ACCENT[appointment.status] ?? "border-l-muted-foreground";

  return (
    <li
      className={cn(
        "flex gap-3 rounded-md border-l-2 pl-3 py-2 hover:bg-muted/50 transition-colors",
        accentClass,
      )}
    >
      <span className="text-sm font-medium tabular-nums text-muted-foreground w-12 shrink-0">
        {startTime}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{appointment.title}</p>
        <p className="text-xs text-muted-foreground">
          {appointment.location && `${appointment.location} · `}
          {durationLabel}
        </p>
      </div>
    </li>
  );
}
