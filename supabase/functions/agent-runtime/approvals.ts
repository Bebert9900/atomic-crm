import type { AuthInfo } from "./auth.ts";
import { makeSupabaseForUser } from "./runPersistence.ts";
import { tools as toolRegistry } from "../_shared/tools/registry.ts";
import { APPROVABLE_KINDS_LIST } from "../_shared/tools/approvals.ts";

type ApprovalRow = {
  id: string;
  user_id: string;
  kind: string;
  payload: Record<string, unknown>;
  status: string;
  expires_at: string;
};

export async function handleListApprovals(auth: AuthInfo): Promise<Response> {
  const supa = makeSupabaseForUser(auth.token);
  const { data, error } = await supa
    .from("agentic_pending_approvals")
    .select("id,kind,summary,payload,status,expires_at,created_at")
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ approvals: data ?? [] });
}

export async function handleExecuteApproval(
  auth: AuthInfo,
  approvalId: string,
): Promise<Response> {
  const supa = makeSupabaseForUser(auth.token);

  const { data: approval, error: loadErr } = await supa
    .from("agentic_pending_approvals")
    .select("id,user_id,kind,payload,status,expires_at")
    .eq("id", approvalId)
    .maybeSingle();
  if (loadErr) {
    return Response.json({ error: loadErr.message }, { status: 500 });
  }
  if (!approval) {
    return Response.json({ error: "approval_not_found" }, { status: 404 });
  }
  const a = approval as ApprovalRow;
  if (a.user_id !== auth.userId) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (a.status !== "pending") {
    return Response.json(
      { error: "already_decided", status: a.status },
      { status: 409 },
    );
  }
  if (new Date(a.expires_at).getTime() < Date.now()) {
    await supa
      .from("agentic_pending_approvals")
      .update({ status: "expired", decided_at: new Date().toISOString() })
      .eq("id", approvalId);
    return Response.json({ error: "expired" }, { status: 410 });
  }
  if (!APPROVABLE_KINDS_LIST.includes(a.kind as never)) {
    return Response.json({ error: "kind_not_allowed" }, { status: 400 });
  }

  const tool = toolRegistry[a.kind];
  if (!tool) {
    return Response.json({ error: "unknown_kind" }, { status: 400 });
  }

  let result: unknown;
  let executionError: string | null = null;
  try {
    const parsedArgs = tool.input_schema.parse(a.payload);
    result = await tool.handler(parsedArgs, {
      auth,
      supabase: supa,
      runId: 0,
      dryRun: false,
    });
  } catch (err) {
    executionError = err instanceof Error ? err.message : String(err);
  }

  const finalStatus = executionError ? "error" : "executed";
  await supa
    .from("agentic_pending_approvals")
    .update({
      status: finalStatus,
      result: executionError ? null : result,
      error_message: executionError,
      decided_at: new Date().toISOString(),
    })
    .eq("id", approvalId);

  if (executionError) {
    return Response.json(
      { status: "error", error: executionError },
      { status: 500 },
    );
  }
  return Response.json({ status: "executed", result });
}

export async function handleRejectApproval(
  auth: AuthInfo,
  approvalId: string,
): Promise<Response> {
  const supa = makeSupabaseForUser(auth.token);
  const { data, error } = await supa
    .from("agentic_pending_approvals")
    .update({ status: "rejected", decided_at: new Date().toISOString() })
    .eq("id", approvalId)
    .eq("user_id", auth.userId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) {
    return Response.json({ error: "not_found_or_decided" }, { status: 404 });
  }
  return Response.json({ status: "rejected" });
}
