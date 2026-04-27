import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseMessage } from "./parser";
import { TableBlock } from "./TableBlock";
import { DashboardBlock } from "./DashboardBlock";
import { KanbanBlock } from "./KanbanBlock";
import { ActionsBlock } from "./ActionsBlock";
import { FullscreenBlock } from "./FullscreenBlock";
import { ApproveBlock } from "./ApproveBlock";

export function MessageContent({ content }: { content: string }) {
  const parts = parseMessage(content);
  return (
    <>
      {parts.map((p, i) => {
        if (p.type === "text") {
          return (
            <div
              key={i}
              className="prose prose-sm max-w-none dark:prose-invert [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {p.content}
              </ReactMarkdown>
            </div>
          );
        }
        switch (p.block.kind) {
          case "table":
            return <TableBlock key={i} payload={p.block.payload} />;
          case "dashboard":
            return <DashboardBlock key={i} payload={p.block.payload} />;
          case "kanban":
            return <KanbanBlock key={i} payload={p.block.payload} />;
          case "actions":
            return <ActionsBlock key={i} payload={p.block.payload} />;
          case "fullscreen":
            return <FullscreenBlock key={i} payload={p.block.payload} />;
          case "approve":
            return <ApproveBlock key={i} payload={p.block.payload} />;
          default:
            return null;
        }
      })}
    </>
  );
}
