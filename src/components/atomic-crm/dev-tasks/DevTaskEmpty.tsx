import { Kanban } from "lucide-react";
import { matchPath, useLocation } from "react-router";
import { CreateButton } from "@/components/admin/create-button";

import useAppBarHeight from "../misc/useAppBarHeight";
import { DevTaskCreate } from "./DevTaskCreate";

export const DevTaskEmpty = () => {
  const location = useLocation();
  const matchCreate = matchPath("/dev_tasks/create", location.pathname);
  const appbarHeight = useAppBarHeight();

  return (
    <div
      className="flex flex-col justify-center items-center gap-6"
      style={{ height: `calc(100dvh - ${appbarHeight}px)` }}
    >
      <Kanban className="w-16 h-16 text-muted-foreground" />
      <div className="flex flex-col items-center gap-1">
        <h3 className="text-lg font-bold">Aucun ticket de dev</h3>
        <p className="text-sm text-center text-muted-foreground">
          Créez votre premier ticket pour commencer à suivre vos tâches de
          développement.
        </p>
      </div>
      <CreateButton label="Nouveau ticket" />
      <DevTaskCreate open={!!matchCreate} />
    </div>
  );
};
