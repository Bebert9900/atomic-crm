import { useEffect, useMemo, useState } from "react";
import { useGetList, useLocaleState, useTranslate } from "ra-core";
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
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router";
import type { Appointment, DevTask, Task } from "../types";
import { AppointmentCreateSheet } from "./AppointmentCreateSheet";
import { AppointmentEditSheet } from "./AppointmentEditSheet";

type CalendarTimeZone = NonNullable<CalendarConfig["timezone"]>;

const DEFAULT_APPOINTMENT_START_HOUR = 9;
const DEFAULT_APPOINTMENT_DURATION_HOURS = 1;

const statusColors: Record<string, string> = {
  scheduled: "#22c55e",
  completed: "#3b82f6",
  cancelled: "#ef4444",
  task: "#f59e0b",
  dev_task: "#a855f7",
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
  const translate = useTranslate();
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

  const navigate = useNavigate();

  const { data: appointments } = useGetList<Appointment>("appointments", {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: "start_at", order: "ASC" },
  });
  const { data: tasks } = useGetList<Task>("tasks", {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: "due_date", order: "ASC" },
    filter: { "done_date@is": null },
  });
  const { data: devTasks } = useGetList<DevTask>("dev_tasks", {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: "due_date", order: "ASC" },
    filter: { "due_date@not.is": null, "archived_at@is": null },
  });

  const events = useMemo<CalendarEvent[]>(() => {
    const appointmentEvents = (appointments ?? []).map<CalendarEvent>((a) => ({
      id: `appointment:${a.id}`,
      title: a.title,
      start: appointmentDateTimeFromIso(a.start_at, timeZone),
      end: appointmentDateTimeFromIso(a.end_at, timeZone),
      description: a.description ?? "",
      location: a.location ?? "",
      calendarId: a.status,
    }));
    const taskEvents = (tasks ?? [])
      .filter((t) => t.due_date)
      .map<CalendarEvent>((t) => {
        const start = appointmentDateTimeFromIso(t.due_date, timeZone);
        const end = start.add({ minutes: 30 });
        return {
          id: `task:${t.id}`,
          title: `📋 ${t.text ?? "Tâche"}`,
          start,
          end,
          description: t.text ?? "",
          location: "",
          calendarId: "task",
        };
      });
    const devTaskEvents = (devTasks ?? [])
      .filter((t) => t.due_date)
      .map<CalendarEvent>((t) => {
        const d = new Date(t.due_date!);
        const iso = new Date(
          d.getFullYear(),
          d.getMonth(),
          d.getDate(),
          9,
          0,
          0,
        ).toISOString();
        const start = appointmentDateTimeFromIso(iso, timeZone);
        const end = start.add({ hours: 1 });
        return {
          id: `dev_task:${t.id}`,
          title: `🛠 ${t.title}`,
          start,
          end,
          description: t.description ?? "",
          location: "",
          calendarId: "dev_task",
        };
      });
    return [...appointmentEvents, ...taskEvents, ...devTaskEvents];
  }, [appointments, tasks, devTasks, timeZone]);

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
          container: "#dcfce7",
          onContainer: "#14532d",
        },
        darkColors: {
          main: statusColors.scheduled,
          container: "#14532d",
          onContainer: "#dcfce7",
        },
      },
      completed: {
        colorName: "completed",
        lightColors: {
          main: statusColors.completed,
          container: "#dbeafe",
          onContainer: "#1e3a8a",
        },
        darkColors: {
          main: statusColors.completed,
          container: "#1e3a8a",
          onContainer: "#dbeafe",
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
      task: {
        colorName: "task",
        lightColors: {
          main: statusColors.task,
          container: "#fef3c7",
          onContainer: "#78350f",
        },
        darkColors: {
          main: statusColors.task,
          container: "#78350f",
          onContainer: "#fef3c7",
        },
      },
      dev_task: {
        colorName: "dev_task",
        lightColors: {
          main: statusColors.dev_task,
          container: "#f3e8ff",
          onContainer: "#581c87",
        },
        darkColors: {
          main: statusColors.dev_task,
          container: "#581c87",
          onContainer: "#f3e8ff",
        },
      },
    },
    callbacks: {
      onEventClick: (event) => {
        const id = String(event.id);
        if (id.startsWith("appointment:")) {
          setEditId(id.slice("appointment:".length));
          return;
        }
        if (id.startsWith("dev_task:")) {
          navigate(`/dev_tasks/${id.slice("dev_task:".length)}/show`);
          return;
        }
        if (id.startsWith("task:")) {
          navigate(`/tasks`);
          return;
        }
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

  const handleCreateClick = () => {
    setDefaultStart(undefined);
    setDefaultEnd(undefined);
    setCreateOpen(true);
  };

  return (
    <div className="flex flex-col gap-0">
      <div
        className={cn(
          "calendar-wrapper rounded-lg border border-border bg-card overflow-hidden",
          "[&_.sx-react-calendar-wrapper]:h-full [&_.sx__calendar-wrapper]:h-full [&_.sx__calendar]:h-full",
          isDarkMode && "is-dark",
        )}
      >
        {/* Custom create button overlaid on calendar toolbar */}
        <div className="relative">
          <div className="absolute right-3 top-2.5 z-20">
            <button
              type="button"
              onClick={handleCreateClick}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
            >
              <span className="text-base leading-none">+</span>
              {translate("resources.appointments.action.create", {
                _: "Événement",
              })}
            </button>
          </div>
        </div>
        <div className="h-[700px]">
          <ScheduleXCalendar calendarApp={calendar} />
        </div>
      </div>

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
