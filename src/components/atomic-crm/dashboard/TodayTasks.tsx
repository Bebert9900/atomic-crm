import { useGetIdentity, useGetList, useTranslate, useUpdate } from "ra-core";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import {
  format,
  isPast,
  isToday,
  isTomorrow,
  formatDistanceToNow,
} from "date-fns";
import { fr } from "date-fns/locale";
import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import type { DevTask, Task } from "../types";

export const TodayTasks = () => {
  const translate = useTranslate();
  const { identity } = useGetIdentity();

  const { data: tasks, isPending } = useGetList<Task>("tasks", {
    pagination: { page: 1, perPage: 50 },
    sort: { field: "due_date", order: "ASC" },
    filter: { "done_date@is": "null" },
  });

  const { data: devTasks } = useGetList<DevTask>(
    "dev_tasks",
    {
      pagination: { page: 1, perPage: 50 },
      sort: { field: "due_date", order: "ASC" },
      filter: {
        "assignee_ids@cs": identity ? `{${identity.id}}` : "{0}",
        "archived_at@is": null,
        "due_date@not.is": null,
      },
    },
    { enabled: !!identity },
  );

  const overdueCount = useMemo(() => {
    if (!tasks) return 0;
    const taskOverdue = tasks.filter(
      (t) =>
        t.due_date &&
        isPast(new Date(t.due_date)) &&
        !isToday(new Date(t.due_date)),
    ).length;
    const devOverdue = (devTasks ?? []).filter(
      (t) =>
        t.due_date &&
        isPast(new Date(t.due_date)) &&
        !isToday(new Date(t.due_date)),
    ).length;
    return taskOverdue + devOverdue;
  }, [tasks, devTasks]);

  if (isPending) return null;
  if (!tasks?.length && !devTasks?.length) return null;

  // Show max 8 tasks, sorted: overdue first, then today, then upcoming
  const sortedTasks = [...(tasks ?? [])]
    .sort((a, b) => {
      const da = new Date(a.due_date);
      const db = new Date(b.due_date);
      return da.getTime() - db.getTime();
    })
    .slice(0, 6);

  const sortedDevTasks = [...(devTasks ?? [])]
    .sort((a, b) => {
      const da = new Date(a.due_date!);
      const db = new Date(b.due_date!);
      return da.getTime() - db.getTime();
    })
    .slice(0, 4);

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
        {sortedTasks.map((task) => (
          <TaskRow key={`t-${task.id}`} task={task} />
        ))}
        {sortedDevTasks.map((t) => (
          <DevTaskRow key={`d-${t.id}`} devTask={t} />
        ))}
      </ul>
    </Card>
  );
};

function DevTaskRow({ devTask }: { devTask: DevTask }) {
  const navigate = useNavigate();
  const [doneOpen, setDoneOpen] = useState(false);
  const dueDate = new Date(devTask.due_date!);
  const overdue = isPast(dueDate) && !isToday(dueDate);
  const today = isToday(dueDate);
  const tomorrow = isTomorrow(dueDate);

  let dateLabel: string;
  let dateClass = "text-muted-foreground";
  if (overdue) {
    dateLabel = formatDistanceToNow(dueDate, { addSuffix: true, locale: fr });
    dateClass = "text-red-500 font-medium";
  } else if (today) {
    dateLabel = "Aujourd'hui";
  } else if (tomorrow) {
    dateLabel = "Demain";
  } else {
    dateLabel = format(dueDate, "dd/MM/yyyy");
  }

  return (
    <>
      <li
        className={cn(
          "flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-muted/50",
          overdue && "bg-red-500/5",
        )}
      >
        <Sparkles className="h-4 w-4 text-purple-500 mt-0.5 shrink-0" />
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => navigate(`/dev_tasks/${devTask.id}/show`)}
        >
          <p
            className={cn(
              "text-sm",
              overdue && "text-red-600 dark:text-red-400",
            )}
          >
            {devTask.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn("text-xs", dateClass)}>{dateLabel}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">Ticket dev</span>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
          onClick={(e) => {
            e.stopPropagation();
            setDoneOpen(true);
          }}
          title="Marquer comme fait"
        >
          <CheckCircle2 className="h-4 w-4" />
        </Button>
      </li>
      {doneOpen && (
        <MarkDoneDialog
          open={doneOpen}
          onOpenChange={setDoneOpen}
          kind="devtask"
          id={Number(devTask.id)}
          title={devTask.title}
          contactId={(devTask.contact_id as number | null) ?? null}
        />
      )}
    </>
  );
}

function TaskRow({ task }: { task: Task }) {
  const [doneOpen, setDoneOpen] = useState(false);
  const dueDate = new Date(task.due_date);
  const overdue = isPast(dueDate) && !isToday(dueDate);
  const today = isToday(dueDate);
  const tomorrow = isTomorrow(dueDate);

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
    <>
      <li
        className={cn(
          "flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-muted/50",
          overdue && "bg-red-500/5",
        )}
      >
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-sm",
              overdue && "text-red-600 dark:text-red-400",
            )}
          >
            {task.text}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn("text-xs", dateClass)}>{dateLabel}</span>
            {typeLabel && (
              <>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">
                  {typeLabel}
                </span>
              </>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
          onClick={() => setDoneOpen(true)}
          title="Marquer comme fait"
        >
          <CheckCircle2 className="h-4 w-4" />
        </Button>
      </li>
      {doneOpen && (
        <MarkDoneDialog
          open={doneOpen}
          onOpenChange={setDoneOpen}
          kind="task"
          id={Number(task.id)}
          title={task.text ?? undefined}
          contactId={(task.contact_id as number | null) ?? null}
        />
      )}
    </>
  );
}
