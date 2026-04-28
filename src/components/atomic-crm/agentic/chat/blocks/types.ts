export type CrmBlock =
  | { kind: "table"; payload: TablePayload }
  | { kind: "dashboard"; payload: DashboardPayload }
  | { kind: "kanban"; payload: KanbanPayload }
  | { kind: "actions"; payload: ActionsPayload }
  | { kind: "fullscreen"; payload: FullscreenPayload }
  | { kind: "approve"; payload: ApprovePayload };

export type TablePayload = {
  title?: string;
  columns: { key: string; label: string; align?: "left" | "right" }[];
  rows: Array<Record<string, string | number>>;
  entityType?: "deal" | "contact" | "company" | "task";
  rowLinkKey?: string; // column holding the entity id for row navigation
};

export type DashboardPayload = {
  title?: string;
  kpis: {
    label: string;
    value: string | number;
    hint?: string;
    tone?: "ok" | "warn" | "bad";
  }[];
  bars?: { label: string; value: number; max?: number }[];
  sections?: { title: string; items: { label: string; value?: string }[] }[];
};

export type KanbanPayload = {
  title?: string;
  columns: {
    key: string;
    title: string;
    count?: number;
    amount?: string;
    deals: {
      id?: number | string;
      name: string;
      amount?: string;
      company?: string;
    }[];
  }[];
};

export type ActionsPayload = {
  title?: string;
  items: {
    label: string; // "Marie Dubois — Relance Acme"
    reason?: string; // "Décision prévue fin de mois"
    entity?: {
      type: "deal" | "contact" | "company" | "task";
      id: number | string;
    };
    actions: {
      kind:
        | "email"
        | "call"
        | "open"
        | "complete"
        | "assign"
        | "custom"
        | "update"
        | "task"
        | "note";
      label?: string;
      url?: string;
      /** For kind="update": fields to patch on the entity. */
      patch?: Record<string, string | number | boolean | null>;
      /** For kind="task": task title/template. */
      task?: { name: string; type?: string; due_date?: string };
      /** For kind="note": note text template. */
      note?: { text: string };
    }[];
  }[];
};

export type ApprovePayload = {
  title: string;
  description?: string;
  /** Visual list of changes shown before approval (key/before/after). */
  diff?: { field: string; before?: string | number; after: string | number }[];
  /**
   * Server-side approval id (preferred). When present, clicking Approve calls
   * `/agent-runtime/approvals/:id/execute` and the backend resolves + executes
   * the action via the tool registry. The `action` field below is then ignored.
   */
  approval_id?: string;
  /** Concrete action(s) to execute when user approves (legacy local fallback). */
  action?:
    | {
        kind: "update";
        entity: "deal" | "contact" | "company" | "task";
        id: number | string;
        patch: Record<string, string | number | boolean | null>;
      }
    | {
        kind: "create";
        resource: "tasks" | "contactNotes" | "dealNotes";
        data: Record<string, unknown>;
      }
    | {
        kind: "bulk_update";
        entity: "deal" | "contact" | "company" | "task";
        ids: (number | string)[];
        patch: Record<string, string | number | boolean | null>;
      };
};

export type FullscreenPayload = {
  title: string;
  sections?: { title: string; content: string }[];
  content?: string; // markdown
};
