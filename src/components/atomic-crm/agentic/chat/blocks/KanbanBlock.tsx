import { Link } from "react-router-dom";
import type { KanbanPayload } from "./types";

export function KanbanBlock({ payload }: { payload: KanbanPayload }) {
  return (
    <div className="my-2 w-full rounded-md border bg-background p-2">
      {payload.title && (
        <div className="mb-2 text-xs font-medium">{payload.title}</div>
      )}
      <div className="flex gap-2 overflow-x-auto">
        {payload.columns.map((col) => (
          <div
            key={col.key}
            className="flex min-w-[140px] flex-col rounded bg-muted/50 p-1.5"
          >
            <div className="mb-1 flex items-center justify-between px-1 text-[10px] uppercase">
              <span className="font-medium">{col.title}</span>
              <span className="text-muted-foreground tabular-nums">
                {col.count ?? col.deals.length}
                {col.amount ? ` · ${col.amount}` : ""}
              </span>
            </div>
            <div className="space-y-1">
              {col.deals.map((d, i) => {
                const inner = (
                  <div className="cursor-pointer rounded border bg-background p-1.5 text-[11px] hover:border-primary">
                    <div className="truncate font-medium">{d.name}</div>
                    <div className="flex justify-between text-muted-foreground">
                      {d.company && (
                        <span className="truncate">{d.company}</span>
                      )}
                      {d.amount && (
                        <span className="tabular-nums">{d.amount}</span>
                      )}
                    </div>
                  </div>
                );
                return d.id !== undefined ? (
                  <Link key={i} to={`/deals/${d.id}/show`}>
                    {inner}
                  </Link>
                ) : (
                  <div key={i}>{inner}</div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
