export type ParsedEmailNote = {
  from: string;
  to: string[];
  subject: string | null;
  body: string;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v))
    return v.map((x) => String(x)).filter((x) => x.length > 0);
  if (typeof v === "string" && v.trim().length > 0) return [v];
  return [];
}

export function parseEmailNote(text: string | null): ParsedEmailNote | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isPlainObject(parsed)) return null;
    const hasEmailShape =
      typeof parsed.from === "string" &&
      (typeof parsed.subject === "string" || typeof parsed.text === "string");
    if (!hasEmailShape) return null;
    return {
      from: String(parsed.from ?? "").trim(),
      to: toStringArray(parsed.to),
      subject: parsed.subject ? String(parsed.subject).trim() : null,
      body: String(parsed.text ?? "").trim(),
    };
  } catch {
    return null;
  }
}

export function parseInboundEmailNote(
  text: string | null,
): { subject: string; body: string } | null {
  if (!text) return null;
  const split = text.split(/\n\s*\n/);
  if (split.length < 2) return null;
  const [first, ...rest] = split;
  const subject = first.trim();
  const body = rest.join("\n\n").trim();
  if (!subject || !body) return null;
  if (subject.length > 200) return null;
  if (/^(https?:|{|\[|<)/i.test(subject)) return null;
  return { subject, body };
}
