import type { Identifier } from "ra-core";

import type { DevTask, Task } from "../types";

export type SaleTaskProductivity = {
  assigned: number;
  completed: number;
  pending: number;
  overdue: number;
  completionRate: number;
};

export const emptySaleTaskProductivity: SaleTaskProductivity = {
  assigned: 0,
  completed: 0,
  pending: 0,
  overdue: 0,
  completionRate: 0,
};

const isOverdueDate = (
  dueDate: string | null | undefined,
  completed: boolean,
  now: Date,
) => {
  if (completed || !dueDate) return false;
  return new Date(dueDate).getTime() < now.getTime();
};

const finalizeRates = (
  metricsBySale: Map<Identifier, SaleTaskProductivity>,
) => {
  for (const metrics of metricsBySale.values()) {
    metrics.completionRate =
      metrics.assigned === 0
        ? 0
        : Math.round((metrics.completed / metrics.assigned) * 100);
  }
};

const bumpMetrics = (
  metricsBySale: Map<Identifier, SaleTaskProductivity>,
  saleId: Identifier,
  completed: boolean,
  overdue: boolean,
) => {
  const metrics = metricsBySale.get(saleId) ?? {
    ...emptySaleTaskProductivity,
  };
  metrics.assigned += 1;
  if (completed) {
    metrics.completed += 1;
  } else {
    metrics.pending += 1;
    if (overdue) metrics.overdue += 1;
  }
  metricsBySale.set(saleId, metrics);
};

export const buildSaleTaskProductivityMap = (
  tasks: Task[] = [],
  now: Date = new Date(),
) => {
  const metricsBySale = new Map<Identifier, SaleTaskProductivity>();

  for (const task of tasks) {
    if (task.sales_id == null) continue;
    const completed = task.done_date != null;
    bumpMetrics(
      metricsBySale,
      task.sales_id,
      completed,
      isOverdueDate(task.due_date, completed, now),
    );
  }

  finalizeRates(metricsBySale);
  return metricsBySale;
};

export const buildSaleDevTaskProductivityMap = (
  devTasks: DevTask[] = [],
  now: Date = new Date(),
) => {
  const metricsBySale = new Map<Identifier, SaleTaskProductivity>();

  for (const task of devTasks) {
    if (task.archived_at != null) continue;
    const assignees =
      task.assignee_ids && task.assignee_ids.length > 0
        ? task.assignee_ids
        : task.assignee_id != null
          ? [task.assignee_id]
          : [];

    if (assignees.length === 0) continue;

    const completed = task.status === "done";
    const overdue = isOverdueDate(task.due_date, completed, now);

    for (const saleId of assignees) {
      bumpMetrics(metricsBySale, saleId, completed, overdue);
    }
  }

  finalizeRates(metricsBySale);
  return metricsBySale;
};
