import { required } from "ra-core";
import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";
import { DateTimeInput } from "@/components/admin";

import { contactOptionText } from "../misc/ContactOption";

const sourceChoices = [
  { id: "manual", name: "Manuel" },
  { id: "phone_call", name: "Appel téléphonique" },
  { id: "email_campaign", name: "Campagne email" },
];

const statusChoices = [
  { id: "scheduled", name: "Planifié" },
  { id: "completed", name: "Terminé" },
  { id: "cancelled", name: "Annulé" },
];

export const AppointmentInputs = ({
  selectContact = true,
}: {
  selectContact?: boolean;
}) => {
  return (
    <div className="flex flex-col gap-4">
      <TextInput
        autoFocus
        source="title"
        label="Titre"
        validate={required()}
        helperText={false}
      />

      <TextInput
        source="description"
        label="Description"
        multiline
        helperText={false}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DateTimeInput
          source="start_at"
          label="Début"
          validate={required()}
          helperText={false}
        />
        <DateTimeInput
          source="end_at"
          label="Fin"
          validate={required()}
          helperText={false}
        />
      </div>

      <TextInput
        source="location"
        label="Lieu (ou lien visio)"
        helperText={false}
      />

      {selectContact && (
        <ReferenceInput source="contact_id" reference="contacts_summary">
          <AutocompleteInput
            label="Contact"
            optionText={contactOptionText}
            helperText={false}
            modal
          />
        </ReferenceInput>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SelectInput
          source="source"
          label="Source"
          choices={sourceChoices}
          defaultValue="manual"
          helperText={false}
        />
        <SelectInput
          source="status"
          label="Statut"
          choices={statusChoices}
          defaultValue="scheduled"
          helperText={false}
        />
      </div>
    </div>
  );
};
