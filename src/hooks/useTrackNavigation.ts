import { useEffect, useRef } from "react";
import { useLocation, useParams } from "react-router-dom";
import { track } from "@/lib/userActionsTracker";

function inferEntity(path: string, id: string | undefined) {
  if (path.startsWith("/contacts/") && id)
    return { entity_type: "contact", entity_id: id };
  if (path.startsWith("/deals/") && id)
    return { entity_type: "deal", entity_id: id };
  if (path.startsWith("/companies/") && id)
    return { entity_type: "company", entity_id: id };
  if (path.startsWith("/dev_tasks/") && id)
    return { entity_type: "dev_task", entity_id: id };
  if (path.startsWith("/appointments/") && id)
    return { entity_type: "appointment", entity_id: id };
  return {};
}

/**
 * Fires a `nav.visit` event whenever the current pathname changes.
 * Mounted once (Layout) — tracks the entire app.
 */
export function useTrackNavigation(): void {
  const location = useLocation();
  const params = useParams();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    const path = location.pathname;
    if (path === lastPath.current) return;
    lastPath.current = path;
    const entity = inferEntity(path, params.id as string | undefined);
    track("nav.visit", {
      payload: { path },
      context: entity,
    });
  }, [location.pathname, params.id]);
}
