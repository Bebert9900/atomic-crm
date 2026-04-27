import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Maximize2, X, Download, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TablePayload } from "./types";

function entityHref(
  type: TablePayload["entityType"],
  id: string | number,
): string | null {
  if (!type) return null;
  return `/${type === "company" ? "companies" : type + "s"}/${id}/show`;
}

export function TableBlock({ payload }: { payload: TablePayload }) {
  const [full, setFull] = useState(false);
  const cols = payload.columns.slice(0, full ? payload.columns.length : 4);
  const rows = payload.rows.slice(0, full ? payload.rows.length : 6);
  const more = payload.rows.length > rows.length;

  return (
    <div className="my-2 w-full rounded-md border bg-background">
      <div className="flex items-center justify-between border-b px-2 py-1 text-xs">
        <span className="font-medium truncate">
          {payload.title ?? "Résultats"}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => setFull(true)}
          title="Agrandir"
        >
          <Maximize2 className="h-3 w-3" />
        </Button>
      </div>
      <TableInner
        cols={cols}
        rows={rows}
        entityType={payload.entityType}
        rowLinkKey={payload.rowLinkKey}
      />
      {more && (
        <div
          className="border-t px-2 py-1 text-center text-[11px] text-muted-foreground cursor-pointer hover:bg-muted"
          onClick={() => setFull(true)}
        >
          +{payload.rows.length - rows.length} autres — cliquer pour tout voir
        </div>
      )}
      {full && (
        <FullTableModal payload={payload} onClose={() => setFull(false)} />
      )}
    </div>
  );
}

function TableInner({
  cols,
  rows,
  entityType,
  rowLinkKey,
  sortable = false,
}: {
  cols: TablePayload["columns"];
  rows: TablePayload["rows"];
  entityType?: TablePayload["entityType"];
  rowLinkKey?: string;
  sortable?: boolean;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av === bv) return 0;
      return (av > bv ? 1 : -1) * sort.dir;
    });
  }, [rows, sort]);
  return (
    <table className="w-full text-xs">
      <thead className="bg-muted/50">
        <tr>
          {cols.map((c) => (
            <th
              key={c.key}
              className={`px-2 py-1 text-${c.align ?? "left"} font-medium ${
                sortable ? "cursor-pointer hover:bg-muted" : ""
              }`}
              onClick={
                sortable
                  ? () =>
                      setSort((s) =>
                        s?.key === c.key
                          ? { key: c.key, dir: s.dir === 1 ? -1 : 1 }
                          : { key: c.key, dir: 1 },
                      )
                  : undefined
              }
            >
              <span className="inline-flex items-center gap-1">
                {c.label}
                {sortable && <ArrowUpDown className="h-3 w-3 opacity-40" />}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((r, i) => {
          const id = rowLinkKey ? r[rowLinkKey] : undefined;
          const href = id !== undefined ? entityHref(entityType, id) : null;
          return (
            <tr key={i} className="border-t last:border-b-0 hover:bg-muted/30">
              {cols.map((c, j) => {
                const v = r[c.key];
                const cell = (
                  <span
                    className={`block px-2 py-1 text-${c.align ?? "left"} truncate`}
                  >
                    {v ?? ""}
                  </span>
                );
                return (
                  <td key={c.key}>
                    {j === 0 && href ? (
                      <Link
                        to={href}
                        className="block text-primary hover:underline"
                      >
                        {cell}
                      </Link>
                    ) : (
                      cell
                    )}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function FullTableModal({
  payload,
  onClose,
}: {
  payload: TablePayload;
  onClose: () => void;
}) {
  const exportCsv = () => {
    const sep = ",";
    const header = payload.columns.map((c) => c.label).join(sep);
    const lines = payload.rows.map((r) =>
      payload.columns.map((c) => JSON.stringify(r[c.key] ?? "")).join(sep),
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(payload.title ?? "export").replace(/\s+/g, "_")}.csv`;
    a.click();
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="relative flex h-[85vh] w-[90vw] max-w-5xl flex-col overflow-hidden rounded-lg border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b px-4 py-2">
          <span className="font-medium">
            {payload.title ?? "Résultats"} ({payload.rows.length})
          </span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <Download className="mr-1 h-3 w-3" />
              CSV
            </Button>
            <Button size="icon" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <div className="flex-1 overflow-auto">
          <TableInner
            cols={payload.columns}
            rows={payload.rows}
            entityType={payload.entityType}
            rowLinkKey={payload.rowLinkKey}
            sortable
          />
        </div>
      </div>
    </div>
  );
}
