import { useGetList } from "ra-core";
import { CalendarDays } from "lucide-react";
import { useState } from "react";
import type { Identifier } from "ra-core";

import type { Appointment } from "../types";
import { AppointmentEditSheet } from "./AppointmentEditSheet";

const statusLabels: Record<string, string> = {
  scheduled: "Planifié",
  completed: "Terminé",
  cancelled: "Annulé",
};

const statusClasses: Record<string, string> = {
  scheduled: "text-blue-600",
  completed: "text-green-600",
  cancelled: "text-red-500 line-through",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ContactAppointmentsList({
  contactId,
}: {
  contactId: Identifier;
}) {
  const [editId, setEditId] = useState<Identifier | null>(null);

  const { data: appointments, isPending } = useGetList<Appointment>(
    "appointments",
    {
      filter: { contact_id: contactId },
      sort: { field: "start_at", order: "DESC" },
      pagination: { page: 1, perPage: 50 },
    },
  );

  if (isPending) return null;
  if (!appointments?.length) return null;

  return (
    <>
      <ul className="flex flex-col gap-1">
        {appointments.map((a) => (
          <li
            key={a.id}
            className="flex items-start gap-2 cursor-pointer hover:bg-muted/50 rounded p-1"
            onClick={() => setEditId(a.id)}
          >
            <CalendarDays className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{a.title}</div>
              <div className="text-xs text-muted-foreground">
                {formatDateTime(a.start_at)}
                <span className={`ml-2 ${statusClasses[a.status] ?? ""}`}>
                  {statusLabels[a.status] ?? a.status}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {editId != null && (
        <AppointmentEditSheet
          open={editId != null}
          onOpenChange={(open) => {
            if (!open) setEditId(null);
          }}
          appointmentId={editId}
        />
      )}
    </>
  );
}
