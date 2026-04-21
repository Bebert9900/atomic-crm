import { useTranslate } from "ra-core";
import { Card } from "@/components/ui/card";

import { PageHeader } from "../layout/PageHeader";
import { AddTask } from "./AddTask";
import { TasksListContent } from "./TasksListContent";

export const TasksPage = () => {
  const translate = useTranslate();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={translate("crm.sidebar.my_tasks", { _: "Mes tâches" })}
        subtitle={translate("crm.tasks.subtitle", {
          _: "Toutes vos tâches en cours",
        })}
      >
        <AddTask display="chip" selectContact />
      </PageHeader>
      <Card className="p-6">
        <TasksListContent />
      </Card>
    </div>
  );
};
