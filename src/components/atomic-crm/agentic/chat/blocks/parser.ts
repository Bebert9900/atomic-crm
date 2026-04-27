import type { CrmBlock } from "./types";

const FENCE_RE =
  /```crm:(table|dashboard|kanban|actions|fullscreen|approve)\s*\n([\s\S]*?)```/g;

export type MessagePart =
  | { type: "text"; content: string }
  | { type: "block"; block: CrmBlock };

export function parseMessage(raw: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let lastIdx = 0;
  FENCE_RE.lastIndex = 0;
  for (const match of raw.matchAll(FENCE_RE)) {
    const start = match.index ?? 0;
    if (start > lastIdx) {
      const txt = raw.slice(lastIdx, start);
      if (txt.trim()) parts.push({ type: "text", content: txt });
    }
    const kind = match[1] as CrmBlock["kind"];
    const body = match[2];
    try {
      const payload = JSON.parse(body);
      parts.push({ type: "block", block: { kind, payload } as CrmBlock });
    } catch {
      parts.push({
        type: "text",
        content: "```crm:" + kind + "\n" + body + "```",
      });
    }
    lastIdx = start + match[0].length;
  }
  if (lastIdx < raw.length) {
    const txt = raw.slice(lastIdx);
    if (txt.trim()) parts.push({ type: "text", content: txt });
  }
  if (parts.length === 0) parts.push({ type: "text", content: raw });
  return parts;
}
