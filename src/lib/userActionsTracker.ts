import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";

const SESSION_KEY = "agentic.session_id";
const FLUSH_INTERVAL_MS = 5_000;
const MAX_BUFFER = 20;

export type TrackOptions = {
  resource?: string;
  resource_id?: string | number;
  payload?: Record<string, unknown>;
  context?: Record<string, unknown>;
};

type QueuedAction = {
  session_id: string;
  occurred_at: string;
  action: string;
  resource: string | null;
  resource_id: string | null;
  payload: Record<string, unknown>;
  context: Record<string, unknown>;
  client_info: Record<string, unknown>;
};

let buffer: QueuedAction[] = [];
let flushTimer: number | null = null;
let cachedClientInfo: Record<string, unknown> | null = null;
let cachedToken: string | null = null;
let cachedTokenAt = 0;
const TOKEN_TTL_MS = 60_000;

function getSessionId(): string {
  if (typeof window === "undefined") return "ssr-noop";
  let id = window.sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(
      /[^a-zA-Z0-9-]/g,
      "",
    );
    window.sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function clientInfo(): Record<string, unknown> {
  if (cachedClientInfo) return cachedClientInfo;
  if (typeof window === "undefined") return {};
  cachedClientInfo = {
    user_agent: navigator.userAgent.slice(0, 200),
    screen: `${window.screen.width}x${window.screen.height}`,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: navigator.language,
  };
  return cachedClientInfo;
}

async function getToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && now - cachedTokenAt < TOKEN_TTL_MS) return cachedToken;
  try {
    const supabase = getSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    cachedToken = session?.access_token ?? null;
    cachedTokenAt = now;
    return cachedToken;
  } catch {
    return null;
  }
}

function endpoint(): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-runtime/actions`;
}

async function flush(): Promise<void> {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, buffer.length);
  if (flushTimer != null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
  const token = await getToken();
  if (!token) return; // user not logged in — drop silently
  try {
    await fetch(endpoint(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ actions: batch }),
      keepalive: true,
    });
  } catch {
    // Best-effort: tracking must never break the app
  }
}

function flushBeacon(): void {
  if (buffer.length === 0) return;
  if (!cachedToken) return;
  const batch = buffer.splice(0, buffer.length);
  try {
    const blob = new Blob(
      [JSON.stringify({ actions: batch, _bearer: cachedToken })],
      { type: "application/json" },
    );
    // Note: sendBeacon does not support Authorization header; fall back to
    // fetch with keepalive when token is available.
    void fetch(endpoint(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cachedToken}`,
        "Content-Type": "application/json",
      },
      body: blob,
      keepalive: true,
    });
  } catch {
    // ignore
  }
}

function scheduleFlush(): void {
  if (flushTimer != null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_INTERVAL_MS);
}

let unloadBound = false;
function ensureUnloadHook(): void {
  if (unloadBound || typeof window === "undefined") return;
  unloadBound = true;
  window.addEventListener("pagehide", flushBeacon);
  window.addEventListener("beforeunload", flushBeacon);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushBeacon();
  });
}

/**
 * Track a user action. Non-blocking, debounced, never throws.
 * Action names must match /^[a-z][a-z0-9_.]+$/.
 */
export function track(action: string, opts: TrackOptions = {}): void {
  if (typeof window === "undefined") return;
  if (!/^[a-z][a-z0-9_.]+$/.test(action)) {
    if (import.meta.env.DEV) {
      console.warn("track: invalid action name", action);
    }
    return;
  }
  ensureUnloadHook();
  buffer.push({
    session_id: getSessionId(),
    occurred_at: new Date().toISOString(),
    action,
    resource: opts.resource ?? null,
    resource_id:
      opts.resource_id == null
        ? null
        : typeof opts.resource_id === "number"
          ? String(opts.resource_id)
          : opts.resource_id,
    payload: opts.payload ?? {},
    context: opts.context ?? {},
    client_info: clientInfo(),
  });
  if (buffer.length >= MAX_BUFFER) {
    void flush();
  } else {
    scheduleFlush();
  }
}

export function getCurrentSessionId(): string {
  return getSessionId();
}

export function flushNow(): Promise<void> {
  return flush();
}
