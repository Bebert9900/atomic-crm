import type { SkillRunEvent } from "@/lib/agenticClient";

export function SkillRunTrace({ events }: { events: SkillRunEvent[] }) {
  return (
    <ul className="space-y-1">
      {events.map((ev, i) => (
        <li key={i} className="font-mono text-xs">
          {renderEvent(ev)}
        </li>
      ))}
    </ul>
  );
}

function renderEvent(ev: SkillRunEvent): React.ReactNode {
  switch (ev.event) {
    case "text":
      return <span>{ev.data.content}</span>;
    case "tool_use":
      return (
        <span>
          → {ev.data.name}({shortJson(ev.data.args)})
        </span>
      );
    case "tool_result":
      return (
        <span className="text-muted-foreground">
          {" "}
          ← {shortJson(ev.data.result)}
        </span>
      );
    case "run.started":
      return (
        <span className="text-muted-foreground">
          started run #{ev.data.run_id}
          {ev.data.dry_run ? " (dry run)" : ""}
        </span>
      );
    case "run.done":
      return <span className="text-emerald-500">done</span>;
    case "run.error":
      return <span className="text-destructive">error: {ev.data.error}</span>;
    default:
      return <span>{JSON.stringify(ev)}</span>;
  }
}

function shortJson(r: unknown) {
  const s = JSON.stringify(r);
  return s.length > 120 ? s.slice(0, 120) + "…" : s;
}
