import { useQueryClient } from "@tanstack/react-query";
import {
  Form,
  useDataProvider,
  useListContext,
  useRedirect,
  type GetListResult,
} from "ra-core";
import { useSearchParams } from "react-router";
import { Create } from "@/components/admin/create";
import { SaveButton } from "@/components/admin/form";
import { FormToolbar } from "@/components/admin/simple-form";
import { Dialog, DialogContent } from "@/components/ui/dialog";

import type { DevTask } from "../types";
import { DevTaskInputs } from "./DevTaskInputs";

export const DevTaskCreate = ({ open }: { open: boolean }) => {
  const redirect = useRedirect();
  const dataProvider = useDataProvider();
  const { data: allTasks } = useListContext<DevTask>();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const defaultStatus = searchParams.get("status") ?? "backlog";

  const handleClose = () => redirect("/dev_tasks");

  const onSuccess = async (task: DevTask) => {
    if (!allTasks) {
      redirect("/dev_tasks");
      return;
    }
    const siblings = allTasks.filter(
      (t) => t.status === task.status && t.id !== task.id,
    );
    await Promise.all(
      siblings.map((old) =>
        dataProvider.update("dev_tasks", {
          id: old.id,
          data: { index: old.index + 1 },
          previousData: old,
        }),
      ),
    );
    const siblingsById = siblings.reduce(
      (acc, t) => ({ ...acc, [t.id]: { ...t, index: t.index + 1 } }),
      {} as Record<string, DevTask>,
    );
    queryClient.setQueriesData<GetListResult | undefined>(
      { queryKey: ["dev_tasks", "getList"] },
      (res) => {
        if (!res) return res;
        return {
          ...res,
          data: res.data.map((t: DevTask) => siblingsById[t.id] || t),
        };
      },
      { updatedAt: Date.now() },
    );
    redirect("/dev_tasks");
  };

  return (
    <Dialog open={open} onOpenChange={() => handleClose()}>
      <DialogContent className="lg:max-w-4xl overflow-y-auto max-h-9/10 top-1/20 translate-y-0">
        <Create resource="dev_tasks" mutationOptions={{ onSuccess }}>
          <Form
            defaultValues={{
              status: defaultStatus,
              priority: "none",
              index: 0,
              label_ids: [],
            }}
          >
            <DevTaskInputs />
            <FormToolbar>
              <SaveButton />
            </FormToolbar>
          </Form>
        </Create>
      </DialogContent>
    </Dialog>
  );
};
