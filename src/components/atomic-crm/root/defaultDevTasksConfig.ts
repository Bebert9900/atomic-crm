import type { DevTaskPriority, DevTaskStatus } from "../types";

export const defaultDevTaskStatuses: DevTaskStatus[] = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "À faire" },
  { value: "in-progress", label: "En cours" },
  { value: "in-review", label: "En revue" },
  { value: "done", label: "Terminé" },
  { value: "canceled", label: "Annulé" },
];

export const defaultDevTaskPriorities: DevTaskPriority[] = [
  {
    value: "none",
    label: "Aucune",
    icon: "SignalZero",
    colorClass: "text-muted-foreground",
  },
  {
    value: "urgent",
    label: "Urgent",
    icon: "AlertTriangle",
    colorClass: "text-red-600",
  },
  {
    value: "high",
    label: "Élevée",
    icon: "SignalHigh",
    colorClass: "text-orange-500",
  },
  {
    value: "medium",
    label: "Moyenne",
    icon: "SignalMedium",
    colorClass: "text-yellow-600",
  },
  {
    value: "low",
    label: "Faible",
    icon: "SignalLow",
    colorClass: "text-blue-500",
  },
];
