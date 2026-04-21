import { useGetList, useTranslate, useUpdate } from "ra-core";
import { useMemo } from "react";
import { format, isPast, isToday, isTomorrow, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import type { Task } from "../types";

export const TodayTasks = () => {
  const translate = useTranslate();

  const { data: tasks, isPending } = useGetList<Task>("tasks", {
    pagination: { page: 1, perPage: 50 },
    sort: { field: "due_date", order: "ASC" },
    filter: { "done_date@is": "null" },
  });

  const overdueCount = useMemo(() => {
    if (!tasks) return 0;
    return tasks.filter(
      (t) => t.due_date && isPast(new Date(t.due_date)) && !isToday(new Date(t.due_date)),
    ).length;
  }, [tasks]);

  if (isPending) return null;
  if (!tasks?.length) return null;

  // Show max 8 tasks, sorted: overdue first, then today, then upcoming
  const sorted = [...tasks].sort((a, b) => {
    const da = new Date(a.due_date);
    const db = new Date(b.due_date);
    return da.getTime() - db.getTime();
  }).slice(0, 8);

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">☑</span>
        <h2 className="text-base font-semibold flex-1">
          {translate("crm.dashboard.today_tasks", {
            _: "À faire aujourd'hui",
          })}
        </h2>
        {overdueCount > 0 && (
          <Badge variant="destructive" className="text-xs px-2 py-0.5">
            {overdueCount} en retard
          </Badge>
        )}
      </div>

      <ul className="flex flex-col gap-1">
        {sorted.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </ul>
    </Card>
  );
};

function TaskRow({ task }: { task: Task }) {
  const [update] = useUpdate();
  const dueDate = new Date(task.due_date);
  const overdue = isPast(dueDate) && !isToday(dueDate);
  const today = isToday(dueDate);
  const tomorrow = isTomorrow(dueDate);

  const handleToggle = () => {
    update("tasks", {
      id: task.id,
      data: { done_date: new Date().toISOString() },
      previousData: task,
    });
  };

  let dateLabel: string;
  let dateClass = "text-muted-foreground";

  if (overdue) {
    dateLabel = formatDistanceToNow(dueDate, { addSuffix: true, locale: fr });
    dateClass = "text-red-500 font-medium";
  } else if (today) {
    dateLabel = "Aujourd'hui";
    if (task.due_date.includes("T")) {
      dateLabel += ` · ${format(dueDate, "HH:mm")}`;
    }
  } else if (tomorrow) {
    dateLabel = "Demain";
    if (task.due_date.includes("T")) {
      dateLabel += ` · ${format(dueDate, "HH:mm")}`;
    }
  } else {
    dateLabel = format(dueDate, "dd/MM/yyyy");
  }

  const typeLabel = task.type && task.type !== "none" ? task.type : null;

  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-muted/50",
        overdue && "bg-red-500/5",
      )}
    >
      <Checkbox
        className="mt-0.5 shrink-0"
        onCheckedChange={handleToggle}
      />
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm", overdue && "text-red-600 dark:text-red-400")}>
          {task.text}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={cn("text-xs", dateClass)}>{dateLabel}</span>
          {typeLabel && (
            <>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">{typeLabel}</span>
            </>
          )}
        </div>
      </div>
    </li>
  );
}
