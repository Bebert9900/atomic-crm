import { datatype, lorem, random } from "faker/locale/en_US";

import {
  defaultDevTaskPriorities,
  defaultDevTaskStatuses,
} from "../../../root/defaultConfiguration";
import type { DevTask, DevTaskLabel } from "../../../types";
import type { Db } from "./types";
import { randomDate } from "./utils";

const LABELS: Omit<DevTaskLabel, "id" | "created_at">[] = [
  { name: "bug", color: "#ef4444" },
  { name: "feature", color: "#3b82f6" },
  { name: "tech", color: "#8b5cf6" },
  { name: "ui", color: "#ec4899" },
  { name: "backend", color: "#10b981" },
  { name: "urgent", color: "#f97316" },
];

export const generateDevTaskLabels = (): DevTaskLabel[] =>
  LABELS.map((l, id) => ({
    id,
    ...l,
    created_at: new Date().toISOString(),
  }));

export const generateDevTasks = (db: Db): DevTask[] => {
  const statuses = defaultDevTaskStatuses.map((s) => s.value);
  const priorities = defaultDevTaskPriorities.map((p) => p.value);
  const labelIds = (db.dev_task_labels ?? []).map((l) => l.id);
  const perStatus: Record<string, number> = {};

  return Array.from(Array(40).keys()).map<DevTask>((id) => {
    const status = random.arrayElement(statuses);
    perStatus[status] = (perStatus[status] ?? 0) + 1;
    const assignee = random.arrayElement(db.sales);
    const nbLabels = random.number({ min: 0, max: 2 });
    const label_ids = Array.from({ length: nbLabels }).map(() =>
      random.arrayElement(labelIds),
    );

    return {
      id,
      title: lorem.sentence().replace(/\.$/, ""),
      description: datatype.boolean() ? lorem.paragraph() : null,
      status,
      priority: random.arrayElement(priorities),
      index: perStatus[status],
      assignee_id: datatype.boolean() ? assignee.id : null,
      due_date: datatype.boolean()
        ? randomDate(
            new Date(),
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          )
            .toISOString()
            .slice(0, 10)
        : null,
      label_ids: Array.from(new Set(label_ids)),
      contact_id: null,
      company_id: null,
      deal_id: null,
      archived_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });
};
