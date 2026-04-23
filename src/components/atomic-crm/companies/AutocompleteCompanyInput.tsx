import { useRef, useState } from "react";
import type { InputProps } from "ra-core";
import type { PopoverProps } from "@radix-ui/react-popover";
import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import { useIsMobile } from "@/hooks/use-mobile";

import { CompanyQuickCreateDialog } from "./CompanyQuickCreateDialog";
import type { Company } from "../types";

type CompanyResolver = (company: Company | undefined) => void;

export const AutocompleteCompanyInput = ({
  validate,
  label,
  modal,
}: Pick<InputProps, "validate" | "label"> & Pick<PopoverProps, "modal">) => {
  const isMobile = useIsMobile();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [initialName, setInitialName] = useState("");
  const resolverRef = useRef<CompanyResolver | null>(null);

  const handleCreateCompany = (name?: string) => {
    return new Promise<Company | undefined>((resolve) => {
      resolverRef.current = resolve;
      setInitialName(name ?? "");
      setDialogOpen(true);
    });
  };

  const handleCreated = (company: Company) => {
    resolverRef.current?.(company);
    resolverRef.current = null;
  };

  const handleCancel = () => {
    resolverRef.current?.(undefined);
    resolverRef.current = null;
  };

  return (
    <>
      <AutocompleteInput
        label={label}
        optionText="name"
        helperText={false}
        onCreate={handleCreateCompany}
        createItemLabel="resources.companies.autocomplete.create_item"
        createLabel="resources.companies.autocomplete.create_label"
        validate={validate}
        modal={modal ?? isMobile}
      />
      <CompanyQuickCreateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialName={initialName}
        onCreated={handleCreated}
        onCancel={handleCancel}
      />
    </>
  );
};
