import { useGetIdentity, useGetList, useTranslate } from "ra-core";
import { useNavigate } from "react-router";
import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import type { DevTask } from "../types";
import { PageHeader } from "../layout/PageHeader";
import { AddTask } from "./AddTask";
import { TasksListContent } from "./TasksListContent";

const MyDevTasks = () => {
  const { identity } = useGetIdentity();
  const navigate = useNavigate();
  const { data: devTasks } = useGetList<DevTask>(
    "dev_tasks",
    {
      filter: {
        "assignee_ids@cs": identity ? `{${identity.id}}` : "{0}",
        "archived_at@is": null,
      },
      sort: { field: "due_date", order: "ASC" },
      pagination: { page: 1, perPage: 50 },
    },
    { enabled: !!identity },
  );

  if (!devTasks?.length) return null;

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-purple-500" />
        <h3 className="text-sm font-semibold">
          Tickets dev qui me sont assignés ({devTasks.length})
        </h3>
      </div>
      <ul className="flex flex-col gap-2">
        {devTasks.map((t) => (
          <li
            key={t.id}
            className="border rounded-md p-2 hover:shadow-sm cursor-pointer flex items-center gap-2"
            onClick={() => navigate(`/dev_tasks/${t.id}/show`)}
          >
            <span className="font-mono text-[11px] text-muted-foreground">
              DEV-{t.id}
            </span>
            <span className="flex-1 text-sm truncate">{t.title}</span>
            {t.status && (
              <Badge variant="secondary" className="text-[10px]">
                {t.status}
              </Badge>
            )}
            {t.due_date && (
              <span className="text-[11px] text-muted-foreground">
                {new Date(t.due_date).toLocaleDateString("fr-FR")}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
};

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
      <MyDevTasks />
    </div>
  );
};

TasksPage.path = "/tasks";
