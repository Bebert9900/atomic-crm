import { useState } from "react";
import { Link } from "react-router-dom";
import { useDataProvider, useNotify } from "ra-core";
import {
  ArrowRight,
  Check,
  ListPlus,
  Mail,
  Phone,
  StickyNote,
  UserPlus,
  Wand2,
  Zap,
} from "lucide-react";
import type { ActionsPayload } from "./types";

const iconFor = {
  email: Mail,
  call: Phone,
  open: ArrowRight,
  complete: Check,
  assign: UserPlus,
  custom: Zap,
  update: Wand2,
  task: ListPlus,
  note: StickyNote,
} as const;

function entityHref(
  type: NonNullable<ActionsPayload["items"][number]["entity"]>["type"],
  id: string | number,
): string {
  const base = type === "company" ? "companies" : `${String(type)}s`;
  return `/${base}/${id}/show`;
}

export function ActionsBlock({ payload }: { payload: ActionsPayload }) {
  return (
    <div className="my-2 w-full rounded-md border bg-background">
      {payload.title && (
        <div className="border-b px-2 py-1 text-xs font-medium">
          {payload.title}
        </div>
      )}
      <ul className="divide-y">
        {payload.items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 px-2 py-1.5">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{it.label}</div>
              {it.reason && (
                <div className="text-[11px] text-muted-foreground truncate">
                  {it.reason}
                </div>
              )}
            </div>
            <div className="flex flex-shrink-0 items-center gap-0.5">
              {it.actions.map((a, j) => (
                <ActionButton
                  key={j}
                  action={a}
                  entity={it.entity}
                  itemLabel={it.label}
                />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

type ActionItem = ActionsPayload["items"][number];
type ActionDef = ActionItem["actions"][number];

function ActionButton({
  action,
  entity,
  itemLabel,
}: {
  action: ActionDef;
  entity?: ActionItem["entity"];
  itemLabel: string;
}) {
  const Icon = iconFor[action.kind] ?? Zap;
  const label = action.label ?? action.kind;
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const baseClass =
    "flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] hover:bg-muted disabled:opacity-50";

  const content = (
    <>
      <Icon className="h-3 w-3" />
      {done ? "Fait" : label}
    </>
  );

  // Navigation: open entity page
  if (action.kind === "open" && entity) {
    return (
      <Link to={entityHref(entity.type, entity.id)} className={baseClass}>
        {content}
      </Link>
    );
  }

  // External link / mailto / tel — generic url passthrough
  if (action.url) {
    return (
      <a
        href={action.url}
        target={action.url.startsWith("http") ? "_blank" : undefined}
        rel="noreferrer"
        className={baseClass}
      >
        {content}
      </a>
    );
  }

  // Direct write actions (with confirm)
  if (
    (action.kind === "update" ||
      action.kind === "task" ||
      action.kind === "note") &&
    entity
  ) {
    const exec = async () => {
      const summary = describe(action, itemLabel);
      if (!confirm(`Confirmer : ${summary} ?`)) return;
      setBusy(true);
      try {
        if (action.kind === "update" && action.patch) {
          const resource =
            entity.type === "company" ? "companies" : `${entity.type}s`;
          const previous = await dataProvider
            .getOne(resource, { id: entity.id })
            .catch(() => ({ data: { id: entity.id } }));
          await dataProvider.update(resource, {
            id: entity.id,
            data: action.patch,
            previousData: previous.data ?? { id: entity.id },
          });
        } else if (action.kind === "task" && action.task) {
          await dataProvider.create("tasks", {
            data: {
              ...action.task,
              [entity.type === "contact" ? "contact_id" : `${entity.type}_id`]:
                entity.id,
            },
          });
        } else if (action.kind === "note" && action.note) {
          const resource =
            entity.type === "deal" ? "dealNotes" : "contactNotes";
          await dataProvider.create(resource, {
            data: {
              text: action.note.text,
              [entity.type === "deal" ? "deal_id" : "contact_id"]: entity.id,
              date: new Date().toISOString(),
            },
          });
        }
        setDone(true);
        notify("Action appliquée", { type: "success" });
      } catch (err) {
        notify(`Erreur : ${err instanceof Error ? err.message : String(err)}`, {
          type: "error",
        });
      } finally {
        setBusy(false);
      }
    };
    return (
      <button
        className={baseClass}
        onClick={exec}
        disabled={busy || done}
        title={describe(action, itemLabel)}
      >
        {content}
      </button>
    );
  }

  return (
    <button className={baseClass} disabled>
      {content}
    </button>
  );
}

function describe(action: ActionDef, itemLabel: string): string {
  if (action.kind === "update" && action.patch) {
    const fields = Object.entries(action.patch)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    return `Mettre à jour ${itemLabel} (${fields})`;
  }
  if (action.kind === "task" && action.task) {
    return `Créer la tâche "${action.task.name}"`;
  }
  if (action.kind === "note" && action.note) {
    return `Ajouter une note sur ${itemLabel}`;
  }
  return action.label ?? action.kind;
}
