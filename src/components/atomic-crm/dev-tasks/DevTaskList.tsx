import { useGetIdentity, useListContext } from "ra-core";
import { matchPath, useLocation } from "react-router";

import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import { CreateButton } from "@/components/admin/create-button";
import { List } from "@/components/admin/list";
import { ReferenceInput } from "@/components/admin/reference-input";
import { FilterButton } from "@/components/admin/filter-form";
import { SearchInput } from "@/components/admin/search-input";
import { SelectInput } from "@/components/admin/select-input";

import { TopToolbar } from "../layout/TopToolbar";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { DevTaskCreate } from "./DevTaskCreate";
import { DevTaskEdit } from "./DevTaskEdit";
import { DevTaskEmpty } from "./DevTaskEmpty";
import { DevTaskListContent } from "./DevTaskListContent";
import { DevTaskShow } from "./DevTaskShow";

const DevTaskList = () => {
  const { identity } = useGetIdentity();
  const { devTaskStatuses, devTaskPriorities } = useConfigurationContext();

  if (!identity) return null;

  const filters = [
    <SearchInput source="title@ilike" alwaysOn />,
    <SelectInput
      source="status"
      choices={devTaskStatuses}
      optionText="label"
      optionValue="value"
    />,
    <SelectInput
      source="priority"
      choices={devTaskPriorities}
      optionText="label"
      optionValue="value"
    />,
    <ReferenceInput source="assignee_id" reference="sales">
      <AutocompleteInput
        optionText={(s) => `${s.first_name} ${s.last_name}`}
        label="Assigné à"
      />
    </ReferenceInput>,
  ];

  return (
    <List
      perPage={200}
      filter={{ "archived_at@is": null }}
      sort={{ field: "index", order: "DESC" }}
      filters={filters}
      actions={<DevTaskActions />}
      pagination={null}
      title={false}
    >
      <DevTaskLayout />
    </List>
  );
};

const DevTaskLayout = () => {
  const location = useLocation();
  const matchCreate = matchPath("/dev_tasks/create", location.pathname);
  const matchShow = matchPath("/dev_tasks/:id/show", location.pathname);
  const matchEdit = matchPath("/dev_tasks/:id", location.pathname);

  const { data, isPending, filterValues } = useListContext();
  const hasFilters = filterValues && Object.keys(filterValues).length > 0;

  if (isPending) return null;
  if (!data?.length && !hasFilters) {
    return <DevTaskEmpty />;
  }

  return (
    <div className="w-full">
      <DevTaskListContent />
      <DevTaskCreate open={!!matchCreate} />
      <DevTaskEdit
        open={!!matchEdit && !matchCreate}
        id={matchEdit?.params.id}
      />
      <DevTaskShow open={!!matchShow} id={matchShow?.params.id} />
    </div>
  );
};

const DevTaskActions = () => (
  <TopToolbar>
    <FilterButton />
    <CreateButton label="Nouveau ticket" />
  </TopToolbar>
);

export default DevTaskList;
