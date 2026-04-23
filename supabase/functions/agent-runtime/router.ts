import { validateToken } from "./auth.ts";
import { handleRun } from "./executeSkill.ts";
import { handleListSkills } from "./skills.ts";

export async function dispatch(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path.endsWith("/health") && req.method === "GET") {
    return Response.json({ ok: true, ts: new Date().toISOString() });
  }

  const auth = await validateToken(req);
  if (!auth) return new Response("Unauthorized", { status: 401 });

  if (path.endsWith("/skills") && req.method === "GET") {
    return handleListSkills(auth);
  }
  if (path.endsWith("/run") && req.method === "POST") {
    return handleRun(req, auth);
  }
  // Reserved for future stories:
  //   POST /rerun/:id  (C.1 replay)
  //   POST /undo/:id   (A.3 undo handler)
  return new Response("Not Found", { status: 404 });
}
