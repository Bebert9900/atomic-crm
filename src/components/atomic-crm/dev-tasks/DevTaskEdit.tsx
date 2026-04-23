import {
  EditBase,
  Form,
  useEditContext,
  useNotify,
  useRecordContext,
  useRedirect,
} from "ra-core";
import { Link } from "react-router";
import { DeleteButton } from "@/components/admin/delete-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

import { FormToolbar } from "../layout/FormToolbar";
import type { DevTask } from "../types";
import { DevTaskInputs } from "./DevTaskInputs";
import { formatDevTaskId } from "./devTaskUtils";

export const DevTaskEdit = ({ open, id }: { open: boolean; id?: string }) => {
  const redirect = useRedirect();
  const notify = useNotify();

  const handleClose = () => {
    redirect("/dev_tasks", undefined, undefined, undefined, {
      _scrollToTop: false,
    });
  };

  return (
    <Dialog open={open} onOpenChange={() => handleClose()}>
      <DialogContent className="lg:max-w-4xl p-4 overflow-y-auto max-h-9/10 top-1/20 translate-y-0">
        {id ? (
          <EditBase
            id={id}
            resource="dev_tasks"
            mutationMode="pessimistic"
            mutationOptions={{
              onSuccess: () => {
                notify("Ticket mis à jour", {});
                redirect(
                  `/dev_tasks/${id}/show`,
                  undefined,
                  undefined,
                  undefined,
                  { _scrollToTop: false },
                );
              },
            }}
          >
            <EditHeader />
            <Form>
              <DevTaskInputs />
              <FormToolbar />
            </Form>
          </EditBase>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

function EditHeader() {
  const { defaultTitle } = useEditContext<DevTask>();
  const task = useRecordContext<DevTask>();
  if (!task) return null;
  return (
    <DialogTitle className="pb-0">
      <div className="flex justify-between items-start mb-8">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-muted-foreground">
            {formatDevTaskId(task.id)}
          </span>
          <h2 className="text-2xl font-semibold">{defaultTitle}</h2>
        </div>
        <div className="flex gap-2 pr-12">
          <DeleteButton />
          <Button asChild variant="outline" className="h-9">
            <Link to={`/dev_tasks/${task.id}/show`}>Retour</Link>
          </Button>
        </div>
      </div>
    </DialogTitle>
  );
}
