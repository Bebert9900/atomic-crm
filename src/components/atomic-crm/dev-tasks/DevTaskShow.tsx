import { Archive, ArchiveRestore } from "lucide-react";
import {
  ShowBase,
  useGetList,
  useNotify,
  useRecordContext,
  useRedirect,
  useRefresh,
  useUpdate,
} from "ra-core";
import { DeleteButton } from "@/components/admin/delete-button";
import { EditButton } from "@/components/admin/edit-button";
import { ReferenceField } from "@/components/admin/reference-field";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

import { Markdown } from "../misc/Markdown";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { DevTask, DevTaskLabel, Sale } from "../types";
import { LabelPill } from "./LabelPill";
import { PriorityIcon } from "./PriorityIcon";
import {
  findPriorityConfig,
  findStatusLabel,
  formatDevTaskId,
} from "./devTaskUtils";

export const DevTaskShow = ({ open, id }: { open: boolean; id?: string }) => {
  const redirect = useRedirect();
  const handleClose = () => redirect("list", "dev_tasks");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="lg:max-w-4xl p-4 overflow-y-auto max-h-9/10 top-1/20 translate-y-0">
        {id ? (
          <ShowBase id={id} resource="dev_tasks">
            <DevTaskShowContent />
          </ShowBase>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

const initialsOf = (s: Sale) =>
  `${s.first_name?.[0] ?? ""}${s.last_name?.[0] ?? ""}`.toUpperCase() || "?";

const DevTaskShowContent = () => {
  const { devTaskStatuses, devTaskPriorities } = useConfigurationContext();
  const record = useRecordContext<DevTask>();

  const { data: allLabels } = useGetList<DevTaskLabel>(
    "dev_task_labels",
    { pagination: { page: 1, perPage: 100 } },
    { enabled: !!record?.label_ids?.length },
  );
  const { data: assignees } = useGetList<Sale>(
    "sales",
    {
      filter: { id: record?.assignee_id },
      pagination: { page: 1, perPage: 1 },
    },
    { enabled: !!record?.assignee_id },
  );

  if (!record) return null;
  const priority = findPriorityConfig(devTaskPriorities, record.priority);
  const labels = (allLabels ?? []).filter((l) =>
    (record.label_ids ?? []).includes(l.id),
  );
  const assignee = assignees?.[0];

  return (
    <div className="space-y-2">
      {record.archived_at ? <ArchivedBanner /> : null}
      <div className="flex justify-between items-start mb-6">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-xs text-muted-foreground">
            {formatDevTaskId(record.id)}
          </span>
          <h2 className="text-2xl font-semibold">{record.title}</h2>
        </div>
        <div className={`flex gap-2 ${record.archived_at ? "" : "pr-12"}`}>
          {record.archived_at ? (
            <>
              <UnarchiveButton record={record} />
              <DeleteButton />
            </>
          ) : (
            <>
              <ArchiveButton record={record} />
              <EditButton />
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-6 m-4">
        <Meta label="Statut">
          {findStatusLabel(devTaskStatuses, record.status)}
        </Meta>
        <Meta label="Priorité">
          <span className="inline-flex items-center gap-1">
            <PriorityIcon priority={priority} />
            {priority?.label}
          </span>
        </Meta>
        {record.due_date && (
          <Meta label="Échéance">
            {new Date(record.due_date).toLocaleDateString("fr-FR")}
          </Meta>
        )}
        {assignee && (
          <Meta label="Assigné à">
            <span className="inline-flex items-center gap-2">
              <Avatar className="w-5 h-5">
                {assignee.avatar?.src && (
                  <AvatarImage src={assignee.avatar.src} />
                )}
                <AvatarFallback className="text-[10px]">
                  {initialsOf(assignee)}
                </AvatarFallback>
              </Avatar>
              {assignee.first_name} {assignee.last_name}
            </span>
          </Meta>
        )}
      </div>

      {labels.length > 0 && (
        <div className="m-4 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Labels :</span>
          {labels.map((l) => (
            <LabelPill key={l.id} label={l} />
          ))}
        </div>
      )}

      {(record.contact_id || record.company_id || record.deal_id) && (
        <div className="m-4 flex flex-wrap gap-6">
          {record.contact_id && (
            <Meta label="Contact">
              <ReferenceField
                source="contact_id"
                reference="contacts_summary"
                link="show"
              />
            </Meta>
          )}
          {record.company_id && (
            <Meta label="Société">
              <ReferenceField
                source="company_id"
                reference="companies"
                link="show"
              />
            </Meta>
          )}
          {record.deal_id && (
            <Meta label="Affaire">
              <ReferenceField source="deal_id" reference="deals" link="show" />
            </Meta>
          )}
        </div>
      )}

      {record.description && (
        <div className="m-4">
          <Separator className="mb-4" />
          <Markdown>{record.description}</Markdown>
        </div>
      )}
    </div>
  );
};

const Meta = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col">
    <span className="text-xs text-muted-foreground tracking-wide">{label}</span>
    <span className="text-sm">{children}</span>
  </div>
);

const ArchivedBanner = () => (
  <div className="bg-orange-500 px-6 py-4">
    <h3 className="text-lg font-bold text-white">Ticket archivé</h3>
  </div>
);

const ArchiveButton = ({ record }: { record: DevTask }) => {
  const [update] = useUpdate();
  const redirect = useRedirect();
  const notify = useNotify();
  const refresh = useRefresh();
  const handleClick = () => {
    update(
      "dev_tasks",
      {
        id: record.id,
        data: { archived_at: new Date().toISOString() },
        previousData: record,
      },
      {
        onSuccess: () => {
          redirect("list", "dev_tasks");
          notify("Ticket archivé", { type: "info", undoable: false });
          refresh();
        },
        onError: () => notify("Erreur lors de l'archivage", { type: "error" }),
      },
    );
  };
  return (
    <Button
      onClick={handleClick}
      size="sm"
      variant="outline"
      className="flex items-center gap-2 h-9"
    >
      <Archive className="w-4 h-4" />
      Archiver
    </Button>
  );
};

const UnarchiveButton = ({ record }: { record: DevTask }) => {
  const [update] = useUpdate();
  const redirect = useRedirect();
  const notify = useNotify();
  const refresh = useRefresh();
  const handleClick = () => {
    update(
      "dev_tasks",
      {
        id: record.id,
        data: { archived_at: null },
        previousData: record,
      },
      {
        onSuccess: () => {
          redirect("list", "dev_tasks");
          notify("Ticket restauré", { type: "info", undoable: false });
          refresh();
        },
        onError: () =>
          notify("Erreur lors de la restauration", { type: "error" }),
      },
    );
  };
  return (
    <Button
      onClick={handleClick}
      size="sm"
      variant="outline"
      className="flex items-center gap-2 h-9"
    >
      <ArchiveRestore className="w-4 h-4" />
      Restaurer
    </Button>
  );
};
