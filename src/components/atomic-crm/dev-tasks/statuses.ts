import type { ConfigurationContextValue } from "../root/ConfigurationContext";
import type { DevTask } from "../types";

export type DevTasksByStatus = Record<string, DevTask[]>;

export const getDevTasksByStatus = (
  unorderedTasks: DevTask[],
  devTaskStatuses: ConfigurationContextValue["devTaskStatuses"],
): DevTasksByStatus => {
  if (!devTaskStatuses) return {};
  const tasksByStatus: DevTasksByStatus = unorderedTasks.reduce(
    (acc, task) => {
      const status = devTaskStatuses.find((s) => s.value === task.status)
        ? task.status
        : devTaskStatuses[0].value;
      acc[status].push(task);
      return acc;
    },
    devTaskStatuses.reduce(
      (obj, status) => ({ ...obj, [status.value]: [] }),
      {} as DevTasksByStatus,
    ),
  );
  devTaskStatuses.forEach((status) => {
    tasksByStatus[status.value] = tasksByStatus[status.value].sort(
      (a, b) => b.index - a.index,
    );
  });
  return tasksByStatus;
};
