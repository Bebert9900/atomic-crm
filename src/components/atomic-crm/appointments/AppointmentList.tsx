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
import type { Appointment, DevTask, Sale, Task } from "../types";
import { AppointmentCreateSheet } from "./AppointmentCreateSheet";
import { AppointmentEditSheet } from "./AppointmentEditSheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Fixed palette, cycled by sales id for deterministic per-user colors.
const USER_PALETTE = [
  { main: "#2563eb", light: "#dbeafe", dark: "#1e3a8a" }, // blue
  { main: "#dc2626", light: "#fee2e2", dark: "#7f1d1d" }, // red
  { main: "#16a34a", light: "#dcfce7", dark: "#14532d" }, // green
  { main: "#ea580c", light: "#ffedd5", dark: "#7c2d12" }, // orange
  { main: "#9333ea", light: "#f3e8ff", dark: "#581c87" }, // violet
  { main: "#0891b2", light: "#cffafe", dark: "#164e63" }, // cyan
  { main: "#db2777", light: "#fce7f3", dark: "#831843" }, // pink
  { main: "#ca8a04", light: "#fef9c3", dark: "#713f12" }, // amber
];

function colorForSaleId(id: number | string | null | undefined) {
  if (id == null) return USER_PALETTE[0];
  const n = typeof id === "number" ? id : Number(id);
  return USER_PALETTE[Math.abs(n) % USER_PALETTE.length];
}

function userCalendarId(saleId: number | string | null | undefined) {
  return saleId != null ? `user-${saleId}` : "user-none";
}

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

  const { data: sales } = useGetList<Sale>("sales", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "last_name", order: "ASC" },
  });

  const [hiddenSaleIds, setHiddenSaleIds] = useState<Set<number>>(new Set());

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
    const appointmentEvents = (appointments ?? [])
      .filter((a) => !hiddenSaleIds.has(Number(a.sales_id)))
      .map<CalendarEvent>((a) => ({
        id: `appointment:${a.id}`,
        title: a.title,
        start: appointmentDateTimeFromIso(a.start_at, timeZone),
        end: appointmentDateTimeFromIso(a.end_at, timeZone),
        description: a.description ?? "",
        location: a.location ?? "",
        calendarId: userCalendarId(a.sales_id),
      }));
    const taskEvents = (tasks ?? [])
      .filter((t) => t.due_date && !hiddenSaleIds.has(Number(t.sales_id)))
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
          calendarId: userCalendarId(t.sales_id),
        };
      });
    const devTaskEvents = (devTasks ?? [])
      .filter((t) => t.due_date)
      .flatMap<CalendarEvent>((t) => {
        const assignees = (
          (t.assignee_ids ?? []) as Array<number | string>
        ).map((n) => Number(n));
        const visibleAssignees = assignees.filter(
          (id) => !hiddenSaleIds.has(id),
        );
        if (assignees.length > 0 && visibleAssignees.length === 0) return [];
        const ownerSaleId = visibleAssignees[0] ?? assignees[0] ?? null;
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
        return [
          {
            id: `dev_task:${t.id}`,
            title: `🛠 ${t.title}`,
            start,
            end,
            description: t.description ?? "",
            location: "",
            calendarId: userCalendarId(ownerSaleId),
          },
        ];
      });
    return [...appointmentEvents, ...taskEvents, ...devTaskEvents];
  }, [appointments, tasks, devTasks, timeZone, hiddenSaleIds]);

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
      ...Object.fromEntries(
        (sales ?? []).map((s) => {
          const c = colorForSaleId(s.id);
          return [
            userCalendarId(s.id),
            {
              colorName: userCalendarId(s.id),
              lightColors: {
                main: c.main,
                container: c.light,
                onContainer: c.dark,
              },
              darkColors: {
                main: c.main,
                container: c.dark,
                onContainer: c.light,
              },
            },
          ];
        }),
      ),
      "user-none": {
        colorName: "user-none",
        lightColors: {
          main: "#64748b",
          container: "#e2e8f0",
          onContainer: "#1e293b",
        },
        darkColors: {
          main: "#94a3b8",
          container: "#334155",
          onContainer: "#f1f5f9",
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

  const toggleSale = (id: number) => {
    setHiddenSaleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <Card className="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground mr-1">Équipe :</span>
          {(sales ?? []).map((s) => {
            const c = colorForSaleId(s.id);
            const hidden = hiddenSaleIds.has(Number(s.id));
            return (
              <Button
                key={s.id}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => toggleSale(Number(s.id))}
                className={cn(
                  "h-7 px-2 text-xs gap-1.5 border",
                  hidden && "opacity-40",
                )}
                style={{
                  borderColor: c.main,
                  color: hidden ? undefined : c.main,
                }}
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: c.main }}
                />
                {s.first_name} {s.last_name}
              </Button>
            );
          })}
          {hiddenSaleIds.size > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setHiddenSaleIds(new Set())}
            >
              Tout afficher
            </Button>
          )}
        </div>
      </Card>
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
