import type { AuthInfo } from "./auth.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_BATCH = 50;
const ACTION_RE = /^[a-z][a-z0-9_.]{1,63}$/;

type IncomingAction = {
  session_id?: string;
  occurred_at?: string;
  action?: string;
  resource?: string | null;
  resource_id?: string | number | null;
  payload?: unknown;
  context?: unknown;
  client_info?: unknown;
};

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SB_ADMIN_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function sanitize(
  a: IncomingAction,
  userId: string,
): null | {
  user_id: string;
  session_id: string;
  occurred_at: string;
  action: string;
  resource: string | null;
  resource_id: string | null;
  payload: Record<string, unknown>;
  context: Record<string, unknown>;
  client_info: Record<string, unknown>;
} {
  if (!a.session_id || typeof a.session_id !== "string") return null;
  if (a.session_id.length < 8 || a.session_id.length > 64) return null;
  if (!a.action || typeof a.action !== "string") return null;
  if (!ACTION_RE.test(a.action)) return null;
  return {
    user_id: userId,
    session_id: a.session_id,
    occurred_at: a.occurred_at ?? new Date().toISOString(),
    action: a.action,
    resource: typeof a.resource === "string" ? a.resource : null,
    resource_id:
      a.resource_id == null
        ? null
        : typeof a.resource_id === "number"
          ? String(a.resource_id)
          : typeof a.resource_id === "string"
            ? a.resource_id
            : null,
    payload:
      a.payload && typeof a.payload === "object"
        ? (a.payload as Record<string, unknown>)
        : {},
    context:
      a.context && typeof a.context === "object"
        ? (a.context as Record<string, unknown>)
        : {},
    client_info:
      a.client_info && typeof a.client_info === "object"
        ? (a.client_info as Record<string, unknown>)
        : {},
  };
}

export async function handleRecordActions(
  req: Request,
  auth: AuthInfo,
): Promise<Response> {
  let body: { actions?: IncomingAction[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const list = body.actions;
  if (!Array.isArray(list) || list.length === 0) {
    return Response.json({ error: "missing_actions" }, { status: 400 });
  }
  if (list.length > MAX_BATCH) {
    return Response.json(
      { error: "batch_too_large", max: MAX_BATCH },
      { status: 400 },
    );
  }

  const rows = list
    .map((a) => sanitize(a, auth.userId))
    .filter((r): r is NonNullable<ReturnType<typeof sanitize>> => r !== null);

  if (rows.length === 0) {
    return Response.json({ inserted: 0, rejected: list.length });
  }

  const { error } = await admin().from("user_actions").insert(rows);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({
    inserted: rows.length,
    rejected: list.length - rows.length,
  });
}
