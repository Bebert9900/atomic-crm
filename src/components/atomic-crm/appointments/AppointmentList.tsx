import { useEffect, useMemo, useState } from "react";
import { useGetList, useLocaleState } from "ra-core";
import { ScheduleXCalendar, useNextCalendarApp } from "@schedule-x/react";
import {
  createViewDay,
  createViewMonthGrid,
  createViewWeek,
  type CalendarConfig,
  type CalendarEvent,
} from "@schedule-x/calendar";
import "@schedule-x/theme-default/dist/index.css";

import { useTheme } from "@/components/admin/use-theme";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Appointment } from "../types";
import { AppointmentCreateSheet } from "./AppointmentCreateSheet";
import { AppointmentEditSheet } from "./AppointmentEditSheet";

type CalendarTimeZone = NonNullable<CalendarConfig["timezone"]>;

const DEFAULT_APPOINTMENT_START_HOUR = 9;
const DEFAULT_APPOINTMENT_DURATION_HOURS = 1;

const statusColors: Record<string, string> = {
  scheduled: "#3b82f6",
  completed: "#10b981",
  cancelled: "#ef4444",
};

const getCalendarTimeZone = (): CalendarTimeZone =>
  (Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC") as CalendarTimeZone;

const getCalendarLocale = (locale: string): string =>
  locale.startsWith("fr") ? "fr-FR" : "en-US";

const appointmentDateTimeFromIso = (
  iso: string,
  timeZone: CalendarTimeZone,
): Temporal.ZonedDateTime =>
  Temporal.Instant.from(iso).toZonedDateTimeISO(timeZone);

const toIsoString = (dateTime: Temporal.ZonedDateTime): string =>
  dateTime.toInstant().toString();

const getDefaultDateRange = (
  date: Temporal.PlainDate,
  timeZone: CalendarTimeZone,
) => {
  const start = Temporal.ZonedDateTime.from({
    year: date.year,
    month: date.month,
    day: date.day,
    hour: DEFAULT_APPOINTMENT_START_HOUR,
    timeZone,
  });
  const end = start.add({ hours: DEFAULT_APPOINTMENT_DURATION_HOURS });

  return {
    start: toIsoString(start),
    end: toIsoString(end),
  };
};

export const AppointmentList = () => {
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | number | null>(null);
  const [defaultStart, setDefaultStart] = useState<string | undefined>();
  const [defaultEnd, setDefaultEnd] = useState<string | undefined>();
  const [locale = "en"] = useLocaleState();
  const { theme } = useTheme();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const timeZone = useMemo(() => getCalendarTimeZone(), []);
  const calendarLocale = useMemo(() => getCalendarLocale(locale), [locale]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const syncTheme = () => {
      setIsDarkMode(
        theme === "dark" || (theme === "system" && mediaQuery.matches),
      );
    };

    syncTheme();
    mediaQuery.addEventListener("change", syncTheme);

    return () => {
      mediaQuery.removeEventListener("change", syncTheme);
    };
  }, [theme]);

  const { data: appointments } = useGetList<Appointment>("appointments", {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: "start_at", order: "ASC" },
  });

  const events = useMemo<CalendarEvent[]>(
    () =>
      (appointments ?? []).map((a) => ({
        id: String(a.id),
        title: a.title,
        start: appointmentDateTimeFromIso(a.start_at, timeZone),
        end: appointmentDateTimeFromIso(a.end_at, timeZone),
        description: a.description ?? "",
        location: a.location ?? "",
        calendarId: a.status,
      })),
    [appointments, timeZone],
  );

  const views: CalendarConfig["views"] = [
    createViewMonthGrid(),
    createViewWeek(),
    createViewDay(),
  ];

  const calendar = useNextCalendarApp({
    views,
    defaultView: "month-grid",
    locale: calendarLocale,
    timezone: timeZone,
    events,
    calendars: {
      scheduled: {
        colorName: "scheduled",
        lightColors: {
          main: statusColors.scheduled,
          container: "#dbeafe",
          onContainer: "#1e3a8a",
        },
        darkColors: {
          main: statusColors.scheduled,
          container: "#1e3a8a",
          onContainer: "#dbeafe",
        },
      },
      completed: {
        colorName: "completed",
        lightColors: {
          main: statusColors.completed,
          container: "#d1fae5",
          onContainer: "#064e3b",
        },
        darkColors: {
          main: statusColors.completed,
          container: "#064e3b",
          onContainer: "#d1fae5",
        },
      },
      cancelled: {
        colorName: "cancelled",
        lightColors: {
          main: statusColors.cancelled,
          container: "#fee2e2",
          onContainer: "#7f1d1d",
        },
        darkColors: {
          main: statusColors.cancelled,
          container: "#7f1d1d",
          onContainer: "#fee2e2",
        },
      },
    },
    callbacks: {
      onEventClick: (event) => {
        setEditId(event.id);
      },
      onClickDate: (date) => {
        const { start, end } = getDefaultDateRange(date, timeZone);
        setDefaultStart(start);
        setDefaultEnd(end);
        setCreateOpen(true);
      },
      onClickDateTime: (dateTime) => {
        setDefaultStart(toIsoString(dateTime));
        setDefaultEnd(
          toIsoString(
            dateTime.add({ hours: DEFAULT_APPOINTMENT_DURATION_HOURS }),
          ),
        );
        setCreateOpen(true);
      },
    },
  });

  // Refresh calendar events when data changes
  useEffect(() => {
    if (calendar) {
      calendar.events.set(events);
    }
  }, [events, calendar]);

  return (
    <div className="mt-2 mb-2 flex flex-col gap-4">
      <Card className="p-4">
        <div
          className={cn(
            "h-[700px] [&_.sx-react-calendar-wrapper]:h-full [&_.sx__calendar-wrapper]:h-full [&_.sx__calendar]:h-full",
            isDarkMode && "is-dark",
          )}
        >
          <ScheduleXCalendar calendarApp={calendar} />
        </div>
      </Card>

      <AppointmentCreateSheet
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setDefaultStart(undefined);
            setDefaultEnd(undefined);
          }
        }}
        defaultStart={defaultStart}
        defaultEnd={defaultEnd}
      />

      {editId != null && (
        <AppointmentEditSheet
          open={editId != null}
          onOpenChange={(open) => {
            if (!open) setEditId(null);
          }}
          appointmentId={editId}
        />
      )}
    </div>
  );
};
