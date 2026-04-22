import { describe, expect, it } from "vitest";

import { buildSaleTaskProductivityMap } from "./taskProductivity";

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
