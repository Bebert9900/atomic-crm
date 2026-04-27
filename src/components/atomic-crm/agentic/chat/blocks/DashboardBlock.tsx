import { cn } from "@/lib/utils";
import type { DashboardPayload } from "./types";

const toneClass = {
  ok: "border-emerald-500/40 bg-emerald-500/10",
  warn: "border-amber-500/40 bg-amber-500/10",
  bad: "border-red-500/40 bg-red-500/10",
};

export function DashboardBlock({ payload }: { payload: DashboardPayload }) {
  return (
    <div className="my-2 w-full rounded-md border bg-background p-3">
      {payload.title && (
        <div className="mb-2 text-xs font-medium">{payload.title}</div>
      )}
      {payload.kpis.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {payload.kpis.map((k, i) => (
            <div
              key={i}
              className={cn(
                "rounded border p-2",
                k.tone ? toneClass[k.tone] : "border-border",
              )}
            >
              <div className="text-[10px] uppercase text-muted-foreground">
                {k.label}
              </div>
              <div className="text-lg font-semibold">{k.value}</div>
              {k.hint && (
                <div className="text-[10px] text-muted-foreground">
                  {k.hint}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {payload.bars && payload.bars.length > 0 && (
        <div className="mb-3 space-y-1">
          {payload.bars.map((b, i) => {
            const max = b.max ?? Math.max(...payload.bars!.map((x) => x.value));
            const pct = max > 0 ? (b.value / max) * 100 : 0;
            return (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-24 truncate text-muted-foreground">
                  {b.label}
                </span>
                <div className="relative h-3 flex-1 rounded bg-muted">
                  <div
                    className="absolute left-0 top-0 h-full rounded bg-primary/70"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-14 text-right tabular-nums">{b.value}</span>
              </div>
            );
          })}
        </div>
      )}
      {payload.sections?.map((s, i) => (
        <div key={i} className="mt-2 border-t pt-2">
          <div className="mb-1 text-xs font-medium">{s.title}</div>
          <div className="space-y-0.5 text-xs">
            {s.items.map((it, j) => (
              <div key={j} className="flex justify-between gap-2">
                <span className="text-muted-foreground">{it.label}</span>
                {it.value && (
                  <span className="font-medium tabular-nums">{it.value}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
