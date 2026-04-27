import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Wrench, Check, AlertCircle } from "lucide-react";

type ToolCall = { name: string; args: unknown; result?: unknown };

const labelFor: Record<string, string> = {
  search_contacts: "Recherche contacts",
  get_contact: "Lecture contact",
  search_deals: "Recherche deals",
  get_deal: "Lecture deal",
  search_companies: "Recherche sociétés",
  get_company: "Lecture société",
  search_tasks: "Recherche tâches",
  search_emails: "Recherche emails",
  get_recent_activity: "Activité récente",
  list_contact_notes: "Notes contact",
  list_deal_notes: "Notes deal",
  list_contact_emails: "Emails contact",
  list_contact_tasks: "Tâches contact",
  list_company_contacts: "Contacts société",
  list_company_deals: "Deals société",
  list_tags: "Tags",
  create_task: "Créer tâche",
  add_contact_note: "Note contact",
  add_deal_note: "Note deal",
};

function summarize(result: unknown): string | null {
  if (!result) return null;
  if (Array.isArray(result)) return `${result.length} résultat(s)`;
  if (typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (Array.isArray(r.items)) return `${r.items.length} résultat(s)`;
    if (typeof r.count === "number") return `${r.count} résultat(s)`;
    if (typeof r.id === "number" || typeof r.id === "string") return `#${r.id}`;
    if (typeof r.ok === "boolean") return r.ok ? "ok" : "erreur";
  }
  return null;
}

export function ToolTimeline({ calls }: { calls: ToolCall[] }) {
  const [open, setOpen] = useState(false);
  if (!calls.length) return null;
  return (
    <div className="w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded border bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
      >
        <ChevronDown
          className={cn("h-3 w-3 transition", open ? "" : "-rotate-90")}
        />
        <Wrench className="h-3 w-3" />
        <span className="font-medium">
          {calls.length} action{calls.length > 1 ? "s" : ""}
        </span>
        {!open && (
          <span className="truncate">
            · {calls.map((c) => labelFor[c.name] ?? c.name).join(", ")}
          </span>
        )}
      </button>
      {open && (
        <div className="mt-1 space-y-0.5 rounded border bg-muted/20 p-1.5">
          {calls.map((c, i) => {
            const done = c.result !== undefined;
            const isError =
              done &&
              typeof c.result === "object" &&
              c.result !== null &&
              "error" in (c.result as Record<string, unknown>);
            const summary = summarize(c.result);
            return (
              <details key={i} className="rounded bg-background px-1.5 py-1">
                <summary className="flex cursor-pointer items-center gap-1.5 text-[11px]">
                  {isError ? (
                    <AlertCircle className="h-3 w-3 text-destructive" />
                  ) : done ? (
                    <Check className="h-3 w-3 text-emerald-600" />
                  ) : (
                    <div className="h-3 w-3 animate-pulse rounded-full bg-primary" />
                  )}
                  <span className="font-medium">
                    {labelFor[c.name] ?? c.name}
                  </span>
                  {summary && (
                    <span className="text-muted-foreground">· {summary}</span>
                  )}
                </summary>
                <div className="mt-1 space-y-0.5 pl-4 font-mono text-[10px] text-muted-foreground">
                  <div>
                    <span className="text-primary">args:</span>{" "}
                    {JSON.stringify(c.args)}
                  </div>
                  {done && (
                    <div className="max-h-24 overflow-y-auto">
                      <span className="text-primary">result:</span>{" "}
                      {JSON.stringify(c.result).slice(0, 300)}
                      {JSON.stringify(c.result).length > 300 ? "…" : ""}
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
