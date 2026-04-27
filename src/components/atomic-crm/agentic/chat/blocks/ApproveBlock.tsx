import { useState } from "react";
import { useDataProvider, useNotify } from "ra-core";
import { Check, Loader2, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ApprovePayload } from "./types";

export function ApproveBlock({ payload }: { payload: ApprovePayload }) {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [state, setState] = useState<"pending" | "applying" | "done" | "error">(
    "pending",
  );
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    setState("applying");
    setError(null);
    try {
      const a = payload.action;
      if (a.kind === "update") {
        const resource = a.entity === "company" ? "companies" : `${a.entity}s`;
        const previous = await dataProvider
          .getOne(resource, { id: a.id })
          .catch(() => ({ data: { id: a.id } }));
        await dataProvider.update(resource, {
          id: a.id,
          data: a.patch,
          previousData: previous.data ?? { id: a.id },
        });
      } else if (a.kind === "create") {
        await dataProvider.create(a.resource, { data: a.data });
      } else if (a.kind === "bulk_update") {
        const resource = a.entity === "company" ? "companies" : `${a.entity}s`;
        await dataProvider.updateMany(resource, {
          ids: a.ids,
          data: a.patch,
        });
      }
      setState("done");
      notify("Action appliquée", { type: "success" });
    } catch (err) {
      setState("error");
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      notify(`Erreur : ${msg}`, { type: "error" });
    }
  };

  return (
    <div className="my-2 w-full rounded-md border-2 border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/10">
      <div className="flex items-start gap-2 px-3 py-2 border-b border-amber-500/20">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
            Action à approuver
          </div>
          <div className="text-sm font-medium mt-0.5">{payload.title}</div>
          {payload.description && (
            <div className="text-xs text-muted-foreground mt-1">
              {payload.description}
            </div>
          )}
        </div>
      </div>

      {payload.diff && payload.diff.length > 0 && (
        <div className="px-3 py-2 border-b border-amber-500/20">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left font-normal pb-1">Champ</th>
                <th className="text-left font-normal pb-1">Avant</th>
                <th className="text-left font-normal pb-1">Après</th>
              </tr>
            </thead>
            <tbody>
              {payload.diff.map((d, i) => (
                <tr key={i}>
                  <td className="py-0.5 pr-2 font-medium">{d.field}</td>
                  <td className="py-0.5 pr-2 text-muted-foreground line-through">
                    {d.before ?? "—"}
                  </td>
                  <td className="py-0.5 font-medium text-emerald-700 dark:text-emerald-400">
                    {d.after}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 px-3 py-2">
        {state === "pending" && (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setState("done")}
              title="Refuser"
            >
              <X className="h-4 w-4 mr-1" />
              Refuser
            </Button>
            <Button size="sm" onClick={apply}>
              <Check className="h-4 w-4 mr-1" />
              Approuver
            </Button>
          </>
        )}
        {state === "applying" && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Application…
          </span>
        )}
        {state === "done" && (
          <span className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
            <Check className="h-3 w-3" />
            Traité
          </span>
        )}
        {state === "error" && (
          <span className="text-xs text-destructive">
            Échec : {error ?? "erreur inconnue"}
            <Button
              size="sm"
              variant="ghost"
              className="ml-2"
              onClick={() => setState("pending")}
            >
              Réessayer
            </Button>
          </span>
        )}
      </div>
    </div>
  );
}
