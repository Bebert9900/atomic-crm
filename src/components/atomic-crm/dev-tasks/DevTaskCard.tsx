import { Draggable } from "@hello-pangea/dnd";
import { CalendarDays } from "lucide-react";
import { RecordContextProvider, useGetList, useRedirect } from "ra-core";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { DevTask, DevTaskLabel, Sale } from "../types";
import { LabelPill } from "./LabelPill";
import { PriorityIcon } from "./PriorityIcon";
import { findPriorityConfig, formatDevTaskId } from "./devTaskUtils";

export const DevTaskCard = ({
  task,
  index,
}: {
  task: DevTask;
  index: number;
}) => {
  if (!task) return null;
  return (
    <Draggable draggableId={String(task.id)} index={index}>
      {(provided, snapshot) => (
        <DevTaskCardContent
          task={task}
          provided={provided}
          snapshot={snapshot}
        />
      )}
    </Draggable>
  );
};

const initialsOf = (s: Sale) =>
  `${s.first_name?.[0] ?? ""}${s.last_name?.[0] ?? ""}`.toUpperCase() || "?";

const isOverdue = (dueDate: string | null) => {
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dueDate) < today;
};

export const DevTaskCardContent = ({
  task,
  provided,
  snapshot,
}: {
  task: DevTask;
  provided?: any;
  snapshot?: any;
}) => {
  const { devTaskPriorities } = useConfigurationContext();
  const redirect = useRedirect();
  const priority = findPriorityConfig(devTaskPriorities, task.priority);

  const labelIds = task.label_ids ?? [];
  const { data: allLabels } = useGetList<DevTaskLabel>(
    "dev_task_labels",
    { pagination: { page: 1, perPage: 100 } },
    { enabled: labelIds.length > 0 },
  );
  const labels = (allLabels ?? []).filter((l) => labelIds.includes(l.id));

  const assigneeIds = (task.assignee_ids ?? []) as number[];
  const { data: assignees } = useGetList<Sale>(
    "sales",
    {
      filter: { "id@in": `(${assigneeIds.join(",") || 0})` },
      pagination: { page: 1, perPage: 20 },
    },
    { enabled: assigneeIds.length > 0 },
  );
  const resolvedAssignees = assignees ?? [];

  const handleClick = () => {
    redirect(`/dev_tasks/${task.id}/show`, undefined, undefined, undefined, {
      _scrollToTop: false,
    });
  };

  const visibleLabels = labels.slice(0, 3);
  const extraLabels = labels.length - visibleLabels.length;

  return (
    <div
      className="cursor-pointer"
      {...provided?.draggableProps}
      {...provided?.dragHandleProps}
      ref={provided?.innerRef}
      onClick={handleClick}
    >
      <RecordContextProvider value={task}>
        <Card
          className={`px-3 py-2 gap-1 transition-all duration-200 ${
            snapshot?.isDragging
              ? "opacity-90 transform rotate-1 shadow-lg"
              : "shadow-sm hover:shadow-md"
          }`}
        >
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <PriorityIcon priority={priority} />
            <span className="font-mono">{formatDevTaskId(task.id)}</span>
            {task.due_date ? (
              <span
                className={`ml-auto inline-flex items-center gap-1 ${
                  isOverdue(task.due_date) ? "text-red-600" : ""
                }`}
              >
                <CalendarDays className="w-3 h-3" />
                {new Date(task.due_date).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            ) : null}
          </div>
          <p className="text-sm font-medium line-clamp-2">{task.title}</p>
          {(visibleLabels.length > 0 || resolvedAssignees.length > 0) && (
            <div className="flex items-center justify-between gap-2 mt-1">
              <div className="flex items-center gap-1 flex-wrap">
                {visibleLabels.map((label) => (
                  <LabelPill key={label.id} label={label} />
                ))}
                {extraLabels > 0 && (
                  <span className="text-[11px] text-muted-foreground">
                    +{extraLabels}
                  </span>
                )}
              </div>
              {resolvedAssignees.length > 0 && (
                <div className="flex -space-x-1.5 shrink-0">
                  {resolvedAssignees.slice(0, 3).map((a) => (
                    <Avatar
                      key={a.id}
                      className="w-5 h-5 border border-background"
                    >
                      {a.avatar?.src && <AvatarImage src={a.avatar.src} />}
                      <AvatarFallback className="text-[10px]">
                        {initialsOf(a)}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {resolvedAssignees.length > 3 && (
                    <span className="text-[10px] text-muted-foreground ml-1">
                      +{resolvedAssignees.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      </RecordContextProvider>
    </div>
  );
};
