import { type Identifier, useGetIdentity, useNotify } from "ra-core";
import { useQueryClient } from "@tanstack/react-query";
import { CreateSheet } from "../misc/CreateSheet";
import { AppointmentInputs } from "./AppointmentInputs";

export interface AppointmentCreateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact_id?: Identifier | null;
  defaultStart?: string;
  defaultEnd?: string;
  defaultSource?: "manual" | "phone_call" | "email_campaign";
}

export const AppointmentCreateSheet = ({
  open,
  onOpenChange,
  contact_id,
  defaultStart,
  defaultEnd,
  defaultSource = "manual",
}: AppointmentCreateSheetProps) => {
  const { identity } = useGetIdentity();
  const notify = useNotify();
  const queryClient = useQueryClient();

  if (!identity) return null;

  const now = new Date();
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["appointments"] });
    queryClient.invalidateQueries({ queryKey: ["contacts"] });
    queryClient.invalidateQueries({ queryKey: ["contacts_summary"] });
    notify("Rendez-vous créé", { type: "success" });
    onOpenChange(false);
  };

  return (
    <CreateSheet
      resource="appointments"
      title={
        <span className="text-xl font-semibold truncate pr-10">
          Nouveau rendez-vous
        </span>
      }
      redirect={false}
      record={{
        title: "",
        contact_id: contact_id ?? null,
        start_at: defaultStart ?? now.toISOString(),
        end_at: defaultEnd ?? oneHourLater.toISOString(),
        source: defaultSource,
        status: "scheduled",
        sales_id: identity.id,
      }}
      mutationOptions={{
        onSuccess: handleSuccess,
      }}
      open={open}
      onOpenChange={onOpenChange}
    >
      <AppointmentInputs selectContact={contact_id == null} />
    </CreateSheet>
  );
};
