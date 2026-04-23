import { useMemo } from "react";
import { useGetList, useRecordContext, useTranslate } from "ra-core";
import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { ExportButton } from "@/components/admin/export-button";
import { List } from "@/components/admin/list";
import { SearchInput } from "@/components/admin/search-input";
import { Badge } from "@/components/ui/badge";

import { TopToolbar } from "../layout/TopToolbar";
import type { Sale, Task } from "../types";
import {
  buildSaleTaskProductivityMap,
  emptySaleTaskProductivity,
  type SaleTaskProductivity,
} from "./taskProductivity";

const SalesListActions = () => (
  <TopToolbar>
    <ExportButton />
    <CreateButton label="resources.sales.action.new" />
  </TopToolbar>
);

const filters = [<SearchInput source="q" alwaysOn />];

const OptionsField = (_props: { label?: string | boolean }) => {
  const record = useRecordContext();
  const translate = useTranslate();
  if (!record) return null;
  return (
    <div className="flex flex-row gap-1">
      {record.administrator && (
        <Badge
          variant="outline"
          className="border-blue-300 dark:border-blue-700"
        >
          {translate("resources.sales.fields.administrator")}
        </Badge>
      )}
      {record.disabled && (
        <Badge
          variant="outline"
          className="border-orange-300 dark:border-orange-700"
        >
          {translate("resources.sales.fields.disabled")}
        </Badge>
      )}
    </div>
  );
};

const TaskPerformanceField = ({
  metricsBySale,
  isPending,
}: {
  metricsBySale: Map<Sale["id"], SaleTaskProductivity>;
  isPending: boolean;
}) => {
  const record = useRecordContext<Sale>();
  const translate = useTranslate();

  if (!record) return null;
  if (isPending) {
    return (
      <span className="text-sm text-muted-foreground">
        {translate("crm.common.loading")}
      </span>
    );
  }

  const metrics = metricsBySale.get(record.id) ?? emptySaleTaskProductivity;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline">
        {translate("resources.sales.fields.assigned_tasks")}: {metrics.assigned}
      </Badge>
      <Badge
        variant="outline"
        className="border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300"
      >
        {translate("resources.sales.fields.completed_tasks")}:{" "}
        {metrics.completed}
      </Badge>
      <Badge
        variant="outline"
        className="border-sky-300 text-sky-700 dark:border-sky-700 dark:text-sky-300"
      >
        {translate("resources.sales.fields.pending_tasks")}: {metrics.pending}
      </Badge>
      {metrics.overdue > 0 && (
        <Badge
          variant="outline"
          className="border-rose-300 text-rose-700 dark:border-rose-700 dark:text-rose-300"
        >
          {translate("resources.sales.fields.overdue_tasks")}: {metrics.overdue}
        </Badge>
      )}
      <span className="text-xs text-muted-foreground">
        {translate("resources.sales.fields.completion_rate")}:{" "}
        {metrics.completionRate}%
      </span>
    </div>
  );
};

export function SalesList() {
  const { data: tasks, isPending: isTasksPending } = useGetList<Task>("tasks", {
    filter: {},
    pagination: { page: 1, perPage: 5000 },
    sort: { field: "id", order: "ASC" },
  });
  const metricsBySale = useMemo(
    () => buildSaleTaskProductivityMap(tasks),
    [tasks],
  );

  return (
    <List
      filters={filters}
      actions={<SalesListActions />}
      sort={{ field: "first_name", order: "ASC" }}
    >
      <DataTable>
        <DataTable.Col source="first_name" />
        <DataTable.Col source="last_name" />
        <DataTable.Col source="email" />
        <DataTable.Col label="resources.sales.fields.task_performance">
          <TaskPerformanceField
            metricsBySale={metricsBySale}
            isPending={isTasksPending}
          />
        </DataTable.Col>
        <DataTable.Col label={false}>
          <OptionsField />
        </DataTable.Col>
      </DataTable>
    </List>
  );
}
