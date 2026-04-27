import type { DataProvider } from "ra-core";
import { track } from "./userActionsTracker";

const SKIP_RESOURCES = new Set([
  // Don't track noise from internals
  "user_actions",
  "skill_runs",
  "agent_custom_skills",
  "init_state",
  "configuration",
]);

function fields(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  return Object.keys(data as Record<string, unknown>).slice(0, 20);
}

/**
 * Wrap a DataProvider with mutation tracking. Reads are not tracked (too noisy).
 * Failures of the tracker never break the underlying call.
 */
export function withTracking<T extends DataProvider>(dp: T): T {
  const wrapped = { ...dp } as DataProvider;

  wrapped.create = async (resource, params) => {
    const result = await dp.create(resource, params);
    if (!SKIP_RESOURCES.has(resource)) {
      track("data.create", {
        resource,
        resource_id: (result?.data as { id?: string | number } | undefined)?.id,
        payload: { fields: fields(params.data) },
      });
    }
    return result;
  };

  wrapped.update = async (resource, params) => {
    const result = await dp.update(resource, params);
    if (!SKIP_RESOURCES.has(resource)) {
      track("data.update", {
        resource,
        resource_id: params.id,
        payload: { fields: fields(params.data) },
      });
    }
    return result;
  };

  wrapped.updateMany = async (resource, params) => {
    const result = await dp.updateMany(resource, params);
    if (!SKIP_RESOURCES.has(resource)) {
      track("data.update_many", {
        resource,
        payload: {
          ids: (params.ids ?? []).slice(0, 20),
          fields: fields(params.data),
        },
      });
    }
    return result;
  };

  wrapped.delete = async (resource, params) => {
    const result = await dp.delete(resource, params);
    if (!SKIP_RESOURCES.has(resource)) {
      track("data.delete", {
        resource,
        resource_id: params.id,
      });
    }
    return result;
  };

  wrapped.deleteMany = async (resource, params) => {
    const result = await dp.deleteMany(resource, params);
    if (!SKIP_RESOURCES.has(resource)) {
      track("data.delete_many", {
        resource,
        payload: { ids: (params.ids ?? []).slice(0, 20) },
      });
    }
    return result;
  };

  return wrapped as T;
}
