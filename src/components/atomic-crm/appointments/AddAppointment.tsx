import { Plus } from "lucide-react";
import { useRecordContext } from "ra-core";
import { useState } from "react";
import { Button } from "@/components/ui/button";

import type { Contact } from "../types";
import { AppointmentCreateSheet } from "./AppointmentCreateSheet";

export const AddAppointment = () => {
  const contact = useRecordContext<Contact>();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="my-2">
        <Button
          variant="outline"
          className="h-6 cursor-pointer"
          onClick={() => setOpen(true)}
          size="sm"
        >
          <Plus className="w-4 h-4" />
          Ajouter un RDV
        </Button>
      </div>

      <AppointmentCreateSheet
        open={open}
        onOpenChange={setOpen}
        contact_id={contact?.id}
      />
    </>
  );
};
