import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { useNotify, useUpdate } from "ra-core";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import type { Task as TData } from "../types";

const APPROVAL_RE = /\[agent_approval:([0-9a-f-]{36})\]/i;

export function extractApprovalId(
  text: string | null | undefined,
): string | null {
  if (!text) return null;
  const m = text.match(APPROVAL_RE);
  return m ? m[1] : null;
}

export function TaskAgentApprovalActions({
  task,
  approvalId,
}: {
  task: TData;
  approvalId: string;
}) {
  const notify = useNotify();
  const [update] = useUpdate();
  const [state, setState] = useState<"pending" | "applying" | "done" | "error">(
    "pending",
  );
  const [error, setError] = useState<string | null>(null);

  const decide = async (action: "execute" | "reject") => {
    setState("applying");
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("not_authenticated");
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-runtime/approvals/${approvalId}/${action}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 240)}`);
      }
      // Mark task as done so it leaves the active list
      update("tasks", {
        id: task.id,
        data: { done_date: new Date().toISOString() },
        previousData: task,
      });
      setState("done");
      notify(action === "execute" ? "Action exécutée" : "Action refusée", {
        type: action === "execute" ? "success" : "info",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setState("error");
      notify(`Erreur : ${msg}`, { type: "error" });
    }
  };

  return (
    <div className="mt-2 flex items-center gap-2">
      {state === "pending" && (
        <>
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              void decide("execute");
            }}
          >
            <Check className="h-4 w-4 mr-1" />
            Valider
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              void decide("reject");
            }}
          >
            <X className="h-4 w-4 mr-1" />
            Refuser
          </Button>
          <span className="text-xs text-muted-foreground">
            (action de l'agent en attente de validation)
          </span>
        </>
      )}
      {state === "applying" && (
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          En cours…
        </span>
      )}
      {state === "done" && (
        <span className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
          <Check className="h-3 w-3" />
          Traité
        </span>
      )}
      {state === "error" && (
        <span className="text-xs text-destructive">
          Échec : {error}
          <Button
            size="sm"
            variant="ghost"
            className="ml-2"
            onClick={() => setState("pending")}
          >
            Réessayer
          </Button>
        </span>
      )}
    </div>
  );
}
