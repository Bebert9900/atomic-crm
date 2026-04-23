import { Droppable } from "@hello-pangea/dnd";
import { Plus } from "lucide-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { DevTask } from "../types";
import { DevTaskCard } from "./DevTaskCard";
import { findStatusLabel } from "./devTaskUtils";

export const DevTaskColumn = ({
  status,
  tasks,
}: {
  status: string;
  tasks: DevTask[];
}) => {
  const { devTaskStatuses } = useConfigurationContext();
  return (
    <div className="flex-1 pb-8 min-w-[240px]">
      <div className="flex items-center justify-between px-1 pb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">
            {findStatusLabel(devTaskStatuses, status)}
          </h3>
          <span className="text-xs text-muted-foreground">{tasks.length}</span>
        </div>
        <Button asChild size="icon" variant="ghost" className="h-6 w-6">
          <Link to={`/dev_tasks/create?status=${status}`}>
            <Plus className="w-3.5 h-3.5" />
          </Link>
        </Button>
      </div>
      <Droppable droppableId={status}>
        {(droppableProvided, snapshot) => (
          <div
            ref={droppableProvided.innerRef}
            {...droppableProvided.droppableProps}
            className={`flex flex-col rounded-2xl mt-1 gap-2 min-h-[60px] p-1 ${
              snapshot.isDraggingOver ? "bg-muted" : ""
            }`}
          >
            {tasks.map((task, index) => (
              <DevTaskCard key={task.id} task={task} index={index} />
            ))}
            {droppableProvided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
};
