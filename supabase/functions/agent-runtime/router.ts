import { validateToken } from "./auth.ts";
import { handleRun } from "./executeSkill.ts";
import { handleListSkills } from "./skills.ts";
import { handleListTools } from "./toolsHandler.ts";
import {
  handleCreateCustomSkill,
  handleDeleteCustomSkill,
  handleListCustomSkills,
  handleUpdateCustomSkill,
} from "./customSkills.ts";
import {
  handleOAuthExchange,
  handleOAuthRevoke,
  handleOAuthStatus,
} from "./oauthRoutes.ts";
import { handleRecordActions } from "./recordActions.ts";
import {
  handleExecuteApproval,
  handleListApprovals,
  handleRejectApproval,
} from "./approvals.ts";
import { handleSchedulerTick } from "./scheduler.ts";

export async function dispatch(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path.endsWith("/health") && req.method === "GET") {
    return Response.json({ ok: true, ts: new Date().toISOString() });
  }

  // Scheduler tick: service-role + custom header (no user auth)
  if (path.endsWith("/scheduler/tick") && req.method === "POST") {
    return handleSchedulerTick(req);
  }

  const auth = await validateToken(req);
  if (!auth) return new Response("Unauthorized", { status: 401 });

  if (path.endsWith("/skills") && req.method === "GET") {
    return handleListSkills(auth);
  }
  if (path.endsWith("/tools") && req.method === "GET") {
    return handleListTools(auth);
  }
  if (path.endsWith("/run") && req.method === "POST") {
    return handleRun(req, auth);
  }

  // Custom skills CRUD: /custom-skills and /custom-skills/:id
  const customMatch = path.match(/\/custom-skills(?:\/([0-9a-f-]+))?$/);
  if (customMatch) {
    const id = customMatch[1];
    if (!id && req.method === "GET") return handleListCustomSkills(auth);
    if (!id && req.method === "POST") return handleCreateCustomSkill(req, auth);
    if (id && req.method === "PUT")
      return handleUpdateCustomSkill(req, auth, id);
    if (id && req.method === "DELETE") return handleDeleteCustomSkill(auth, id);
  }

  if (path.endsWith("/actions") && req.method === "POST") {
    return handleRecordActions(req, auth);
  }

  // Approvals: /approvals (list), /approvals/:id/execute, /approvals/:id/reject
  const approveExec = path.match(/\/approvals\/([0-9a-f-]{36})\/execute$/);
  if (approveExec && req.method === "POST") {
    return handleExecuteApproval(auth, approveExec[1]);
  }
  const approveReject = path.match(/\/approvals\/([0-9a-f-]{36})\/reject$/);
  if (approveReject && req.method === "POST") {
    return handleRejectApproval(auth, approveReject[1]);
  }
  if (path.endsWith("/approvals") && req.method === "GET") {
    return handleListApprovals(auth);
  }

  if (path.endsWith("/oauth/anthropic/exchange") && req.method === "POST") {
    return handleOAuthExchange(req, auth);
  }
  if (path.endsWith("/oauth/anthropic/status") && req.method === "GET") {
    return handleOAuthStatus(auth);
  }
  if (path.endsWith("/oauth/anthropic/revoke") && req.method === "POST") {
    return handleOAuthRevoke(auth);
  }

  return new Response("Not Found", { status: 404 });
}
