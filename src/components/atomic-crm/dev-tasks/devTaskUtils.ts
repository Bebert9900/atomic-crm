import type { DevTaskPriority, DevTaskStatus } from "../types";

export const formatDevTaskId = (id: number | string | undefined) => {
  if (id === undefined || id === null) return "DEV-?";
  return `DEV-${id}`;
};

export const findStatusLabel = (statuses: DevTaskStatus[], value: string) =>
  statuses.find((s) => s.value === value)?.label ?? value;

export const findPriorityConfig = (
  priorities: DevTaskPriority[],
  value: string,
) => priorities.find((p) => p.value === value) ?? priorities[0];
