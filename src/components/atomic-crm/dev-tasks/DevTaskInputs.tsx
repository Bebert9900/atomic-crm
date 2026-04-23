import { required } from "ra-core";

import { AutocompleteArrayInput } from "@/components/admin/autocomplete-array-input";
import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import { DateInput } from "@/components/admin/date-input";
import { ReferenceArrayInput } from "@/components/admin/reference-array-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";
import { Separator } from "@/components/ui/separator";
import { useIsMobile } from "@/hooks/use-mobile";

import { useConfigurationContext } from "../root/ConfigurationContext";

export const DevTaskInputs = () => {
  const isMobile = useIsMobile();
  return (
    <div className="flex flex-col gap-8">
      <DevTaskMainInputs />
      <div className={`flex gap-6 ${isMobile ? "flex-col" : "flex-row"}`}>
        <DevTaskMetaInputs />
        <Separator orientation={isMobile ? "horizontal" : "vertical"} />
        <DevTaskLinkedInputs />
      </div>
    </div>
  );
};

const DevTaskMainInputs = () => (
  <div className="flex flex-col gap-4 flex-1">
    <TextInput source="title" validate={required()} helperText={false} />
    <TextInput
      source="description"
      multiline
      rows={6}
      helperText="Markdown supporté"
    />
  </div>
);

const DevTaskMetaInputs = () => {
  const { devTaskStatuses, devTaskPriorities } = useConfigurationContext();
  return (
    <div className="flex flex-col gap-4 flex-1">
      <h3 className="text-base font-medium">Détails</h3>
      <SelectInput
        source="status"
        choices={devTaskStatuses}
        optionText="label"
        optionValue="value"
        defaultValue="backlog"
        helperText={false}
        validate={required()}
      />
      <SelectInput
        source="priority"
        choices={devTaskPriorities}
        optionText="label"
        optionValue="value"
        defaultValue="none"
        helperText={false}
      />
      <ReferenceInput source="assignee_id" reference="sales">
        <AutocompleteInput
          optionText={(s) => `${s.first_name} ${s.last_name}`}
          label="Assigné à"
          helperText={false}
        />
      </ReferenceInput>
      <DateInput source="due_date" helperText={false} />
      <ReferenceArrayInput source="label_ids" reference="dev_task_labels">
        <AutocompleteArrayInput
          optionText="name"
          label="Labels"
          helperText={false}
        />
      </ReferenceArrayInput>
    </div>
  );
};

const DevTaskLinkedInputs = () => (
  <div className="flex flex-col gap-4 flex-1">
    <h3 className="text-base font-medium">Liens (optionnels)</h3>
    <ReferenceInput source="contact_id" reference="contacts_summary">
      <AutocompleteInput
        optionText={(c) => `${c.first_name} ${c.last_name}`}
        label="Contact"
        helperText={false}
      />
    </ReferenceInput>
    <ReferenceInput source="company_id" reference="companies">
      <AutocompleteInput optionText="name" label="Société" helperText={false} />
    </ReferenceInput>
    <ReferenceInput source="deal_id" reference="deals">
      <AutocompleteInput optionText="name" label="Affaire" helperText={false} />
    </ReferenceInput>
  </div>
);
