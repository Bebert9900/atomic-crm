import type { Identifier } from "ra-core";

import type { Task } from "../types";

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

const isCompleted = (task: Task) => task.done_date != null;

const isOverdue = (task: Task, now: Date) => {
  if (isCompleted(task) || !task.due_date) {
    return false;
  }

  return new Date(task.due_date).getTime() < now.getTime();
};

export const buildSaleTaskProductivityMap = (
  tasks: Task[] = [],
  now: Date = new Date(),
) => {
  const metricsBySale = new Map<Identifier, SaleTaskProductivity>();

  for (const task of tasks) {
    if (task.sales_id == null) continue;

    const metrics = metricsBySale.get(task.sales_id) ?? {
      ...emptySaleTaskProductivity,
    };

    metrics.assigned += 1;

    if (isCompleted(task)) {
      metrics.completed += 1;
    } else {
      metrics.pending += 1;
      if (isOverdue(task, now)) {
        metrics.overdue += 1;
      }
    }

    metricsBySale.set(task.sales_id, metrics);
  }

  for (const metrics of metricsBySale.values()) {
    metrics.completionRate =
      metrics.assigned === 0
        ? 0
        : Math.round((metrics.completed / metrics.assigned) * 100);
  }

  return metricsBySale;
};
