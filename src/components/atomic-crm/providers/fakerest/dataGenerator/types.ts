import type {
  Company,
  Contact,
  ContactNote,
  Deal,
  DealNote,
  DevTask,
  DevTaskLabel,
  Sale,
  Tag,
  Task,
} from "../../../types";
import type { ConfigurationContextValue } from "../../../root/ConfigurationContext";

export interface Db {
  companies: Company[];
  contacts: Contact[];
  contact_notes: ContactNote[];
  deals: Deal[];
  deal_notes: DealNote[];
  dev_tasks: DevTask[];
  dev_task_labels: DevTaskLabel[];
  sales: Sale[];
  tags: Tag[];
  tasks: Task[];
  configuration: Array<{ id: number; config: ConfigurationContextValue }>;
}
