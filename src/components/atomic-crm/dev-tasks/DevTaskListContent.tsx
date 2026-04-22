import { DragDropContext, type OnDragEndResponder } from "@hello-pangea/dnd";
import isEqual from "lodash/isEqual";
import { useDataProvider, useListContext, type DataProvider } from "ra-core";
import { useEffect, useState } from "react";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { DevTask } from "../types";
import { DevTaskColumn } from "./DevTaskColumn";
import { getDevTasksByStatus, type DevTasksByStatus } from "./statuses";

export const DevTaskListContent = () => {
  const { devTaskStatuses } = useConfigurationContext();
  const {
    data: unorderedTasks,
    isPending,
    refetch,
  } = useListContext<DevTask>();
  const dataProvider = useDataProvider();

  const [tasksByStatus, setTasksByStatus] = useState<DevTasksByStatus>(
    getDevTasksByStatus([], devTaskStatuses),
  );

  useEffect(() => {
    if (unorderedTasks) {
      const next = getDevTasksByStatus(unorderedTasks, devTaskStatuses);
      if (!isEqual(next, tasksByStatus)) {
        setTasksByStatus(next);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unorderedTasks]);

  if (isPending) return null;

  const onDragEnd: OnDragEndResponder = (result) => {
    const { destination, source } = result;
    if (!destination) return;
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const sourceStatus = source.droppableId;
    const destinationStatus = destination.droppableId;
    const sourceTask = tasksByStatus[sourceStatus][source.index]!;
    const destinationTask = tasksByStatus[destinationStatus][
      destination.index
    ] ?? {
      status: destinationStatus,
      index: undefined,
    };

    setTasksByStatus(
      updateTaskStatusLocal(
        sourceTask,
        { status: sourceStatus, index: source.index },
        { status: destinationStatus, index: destination.index },
        tasksByStatus,
      ),
    );

    updateTaskStatus(sourceTask, destinationTask, dataProvider).then(() => {
      refetch();
    });
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {devTaskStatuses.map((status) => (
          <DevTaskColumn
            status={status.value}
            tasks={tasksByStatus[status.value] ?? []}
            key={status.value}
          />
        ))}
      </div>
    </DragDropContext>
  );
};

const updateTaskStatusLocal = (
  sourceTask: DevTask,
  source: { status: string; index: number },
  destination: { status: string; index?: number },
  tasksByStatus: DevTasksByStatus,
): DevTasksByStatus => {
  if (source.status === destination.status) {
    const column = [...tasksByStatus[source.status]];
    column.splice(source.index, 1);
    column.splice(destination.index ?? column.length + 1, 0, sourceTask);
    return { ...tasksByStatus, [destination.status]: column };
  }
  const sourceColumn = [...tasksByStatus[source.status]];
  const destinationColumn = [...tasksByStatus[destination.status]];
  sourceColumn.splice(source.index, 1);
  destinationColumn.splice(
    destination.index ?? destinationColumn.length + 1,
    0,
    sourceTask,
  );
  return {
    ...tasksByStatus,
    [source.status]: sourceColumn,
    [destination.status]: destinationColumn,
  };
};

const updateTaskStatus = async (
  source: DevTask,
  destination: { status: string; index?: number },
  dataProvider: DataProvider,
) => {
  if (source.status === destination.status) {
    const { data: columnTasks } = await dataProvider.getList<DevTask>(
      "dev_tasks",
      {
        sort: { field: "index", order: "ASC" },
        pagination: { page: 1, perPage: 200 },
        filter: { status: source.status, "archived_at@is": null },
      },
    );
    const destinationIndex = destination.index ?? columnTasks.length + 1;

    if (source.index > destinationIndex) {
      await Promise.all([
        ...columnTasks
          .filter((t) => t.index >= destinationIndex && t.index < source.index)
          .map((t) =>
            dataProvider.update("dev_tasks", {
              id: t.id,
              data: { index: t.index + 1 },
              previousData: t,
            }),
          ),
        dataProvider.update("dev_tasks", {
          id: source.id,
          data: { index: destinationIndex },
          previousData: source,
        }),
      ]);
    } else {
      await Promise.all([
        ...columnTasks
          .filter((t) => t.index <= destinationIndex && t.index > source.index)
          .map((t) =>
            dataProvider.update("dev_tasks", {
              id: t.id,
              data: { index: t.index - 1 },
              previousData: t,
            }),
          ),
        dataProvider.update("dev_tasks", {
          id: source.id,
          data: { index: destinationIndex },
          previousData: source,
        }),
      ]);
    }
  } else {
    const [{ data: sourceTasks }, { data: destinationTasks }] =
      await Promise.all([
        dataProvider.getList<DevTask>("dev_tasks", {
          sort: { field: "index", order: "ASC" },
          pagination: { page: 1, perPage: 200 },
          filter: { status: source.status, "archived_at@is": null },
        }),
        dataProvider.getList<DevTask>("dev_tasks", {
          sort: { field: "index", order: "ASC" },
          pagination: { page: 1, perPage: 200 },
          filter: { status: destination.status, "archived_at@is": null },
        }),
      ]);
    const destinationIndex = destination.index ?? destinationTasks.length + 1;

    await Promise.all([
      ...sourceTasks
        .filter((t) => t.index > source.index)
        .map((t) =>
          dataProvider.update("dev_tasks", {
            id: t.id,
            data: { index: t.index - 1 },
            previousData: t,
          }),
        ),
      ...destinationTasks
        .filter((t) => t.index >= destinationIndex)
        .map((t) =>
          dataProvider.update("dev_tasks", {
            id: t.id,
            data: { index: t.index + 1 },
            previousData: t,
          }),
        ),
      dataProvider.update("dev_tasks", {
        id: source.id,
        data: {
          index: destinationIndex,
          status: destination.status,
        },
        previousData: source,
      }),
    ]);
  }
};
