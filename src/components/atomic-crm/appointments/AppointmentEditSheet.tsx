import { type Identifier, useNotify, useDelete, useRefresh } from "ra-core";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

import { EditSheet } from "../misc/EditSheet";
import { AppointmentInputs } from "./AppointmentInputs";

export interface AppointmentEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: Identifier;
}

export const AppointmentEditSheet = ({
  open,
  onOpenChange,
  appointmentId,
}: AppointmentEditSheetProps) => {
  const notify = useNotify();
  const refresh = useRefresh();
  const [deleteOne, { isPending: isDeleting }] = useDelete();

  const handleSuccess = () => {
    notify("Rendez-vous mis à jour", { type: "success" });
    refresh();
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!confirm("Supprimer ce rendez-vous ?")) return;
    deleteOne(
      "appointments",
      { id: appointmentId },
      {
        onSuccess: () => {
          notify("Rendez-vous supprimé", { type: "success" });
          refresh();
          onOpenChange(false);
        },
        onError: () => {
          notify("Échec de la suppression", { type: "error" });
        },
      },
    );
  };

  return (
    <EditSheet
      resource="appointments"
      id={appointmentId}
      title={
        <span className="text-xl font-semibold truncate pr-10">
          Modifier le rendez-vous
        </span>
      }
      redirect={false}
      mutationMode="pessimistic"
      mutationOptions={{
        onSuccess: handleSuccess,
      }}
      open={open}
      onOpenChange={onOpenChange}
      headerActions={
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDelete}
          disabled={isDeleting}
          title="Supprimer"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      }
    >
      <AppointmentInputs selectContact />
    </EditSheet>
  );
};
