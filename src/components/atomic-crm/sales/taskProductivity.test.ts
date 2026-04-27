import { describe, expect, it } from "vitest";

import {
  buildSaleDevTaskProductivityMap,
  buildSaleTaskProductivityMap,
} from "./taskProductivity";

describe("buildSaleTaskProductivityMap", () => {
  it("groups assigned, completed, pending and overdue tasks by salesperson", () => {
    const metricsBySale = buildSaleTaskProductivityMap(
      [
        {
          contact_id: 1,
          due_date: "2026-04-10T09:00:00.000Z",
          done_date: null,
          id: 1,
          sales_id: 10,
          text: "Relancer le prospect",
          type: "call",
        },
        {
          contact_id: 1,
          due_date: "2026-04-25T09:00:00.000Z",
          done_date: null,
          id: 2,
          sales_id: 10,
          text: "Préparer la démo",
          type: "demo",
        },
        {
          contact_id: 2,
          due_date: "2026-04-15T09:00:00.000Z",
          done_date: "2026-04-16T09:00:00.000Z",
          id: 3,
          sales_id: 10,
          text: "Envoyer le devis",
          type: "email",
        },
        {
          contact_id: 3,
          due_date: "2026-04-18T09:00:00.000Z",
          done_date: null,
          id: 4,
          sales_id: 11,
          text: "Qualifier le besoin",
          type: "call",
        },
        {
          contact_id: 4,
          due_date: "2026-04-12T09:00:00.000Z",
          done_date: null,
          id: 5,
          text: "Tâche non assignée",
          type: "none",
        },
      ],
      new Date("2026-04-20T12:00:00.000Z"),
    );

    expect(metricsBySale.get(10)).toEqual({
      assigned: 3,
      completed: 1,
      pending: 2,
      overdue: 1,
      completionRate: 33,
    });
    expect(metricsBySale.get(11)).toEqual({
      assigned: 1,
      completed: 0,
      pending: 1,
      overdue: 1,
      completionRate: 0,
    });
    expect(metricsBySale.size).toBe(2);
  });
});

describe("buildSaleDevTaskProductivityMap", () => {
  const baseDevTask = {
    description: null,
    priority: "medium",
    index: 0,
    label_ids: [],
    contact_id: null,
    company_id: null,
    deal_id: null,
    created_at: "2026-04-01T00:00:00.000Z",
    updated_at: "2026-04-01T00:00:00.000Z",
  };

  it("counts dev tasks per assignee using assignee_ids array", () => {
    const metricsBySale = buildSaleDevTaskProductivityMap(
      [
        {
          ...baseDevTask,
          id: 1,
          title: "Multi-assignee in progress",
          status: "in-progress",
          assignee_id: null,
          assignee_ids: [10, 11],
          due_date: null,
          archived_at: null,
        },
        {
          ...baseDevTask,
          id: 2,
          title: "Done task",
          status: "done",
          assignee_id: null,
          assignee_ids: [10],
          due_date: "2026-04-10",
          archived_at: null,
        },
        {
          ...baseDevTask,
          id: 3,
          title: "Overdue todo",
          status: "todo",
          assignee_id: null,
          assignee_ids: [11],
          due_date: "2026-04-15",
          archived_at: null,
        },
        {
          ...baseDevTask,
          id: 4,
          title: "Archived (ignored)",
          status: "todo",
          assignee_id: null,
          assignee_ids: [10],
          due_date: null,
          archived_at: "2026-04-05T00:00:00.000Z",
        },
        {
          ...baseDevTask,
          id: 5,
          title: "Unassigned (ignored)",
          status: "todo",
          assignee_id: null,
          assignee_ids: [],
          due_date: null,
          archived_at: null,
        },
        {
          ...baseDevTask,
          id: 6,
          title: "Legacy singular assignee",
          status: "in-review",
          assignee_id: 12,
          assignee_ids: [],
          due_date: null,
          archived_at: null,
        },
      ],
      new Date("2026-04-20T12:00:00.000Z"),
    );

    expect(metricsBySale.get(10)).toEqual({
      assigned: 2,
      completed: 1,
      pending: 1,
      overdue: 0,
      completionRate: 50,
    });
    expect(metricsBySale.get(11)).toEqual({
      assigned: 2,
      completed: 0,
      pending: 2,
      overdue: 1,
      completionRate: 0,
    });
    expect(metricsBySale.get(12)).toEqual({
      assigned: 1,
      completed: 0,
      pending: 1,
      overdue: 0,
      completionRate: 0,
    });
    expect(metricsBySale.size).toBe(3);
  });
});
