import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Sparkles,
  RefreshCcw,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import { useSkillRun } from "@/hooks/useSkillRun";
import type { CustomSkillDraft } from "./CustomSkillsPanel";

type SessionRow = {
  user_id: string;
  session_id: string;
  started_at: string;
  ended_at: string;
  action_count: number;
  distinct_actions: number;
  resources_touched: string[] | null;
};

type ActionRow = {
  id: number;
  occurred_at: string;
  action: string;
  resource: string | null;
  resource_id: string | null;
  payload: Record<string, unknown>;
  context: Record<string, unknown>;
};

type Props = {
  onSuggested: (draft: CustomSkillDraft) => void;
};

export function ActivityPanel({ onSuggested }: Props) {
  const [filter, setFilter] = useState("");
  const {
    data: sessions = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["user_action_sessions"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("user_action_sessions")
        .select("*")
        .order("ended_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
    refetchInterval: 30_000,
  });

  const filtered = useMemo(() => {
    if (!filter) return sessions;
    const f = filter.toLowerCase();
    return sessions.filter(
      (s) =>
        s.session_id.toLowerCase().includes(f) ||
        (s.resources_touched ?? []).some((r) =>
          (r ?? "").toLowerCase().includes(f),
        ),
    );
  }, [sessions, filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground flex-1 min-w-[200px]">
          Sessions des dernières activités. Clique sur une session pour voir la
          séquence d'actions, puis « Suggérer un skill » pour générer un draft
          via Claude.
        </p>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrer (resource, session_id)…"
          className="max-w-xs"
        />
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCcw className="h-4 w-4 mr-1.5" />
          Recharger
        </Button>
      </div>

      {error ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5" />
            <div>
              Impossible de charger les sessions :{" "}
              {String((error as Error).message)}
              <p className="text-xs text-muted-foreground mt-1">
                Vérifie que la migration <code>user_actions</code> est
                appliquée.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Chargement…
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground italic">
            Aucune session capturée pour l'instant. Navigue dans le CRM (les
            créations / modifications / navigations sont trackées
            automatiquement).
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => (
            <SessionItem
              key={s.session_id}
              session={s}
              onSuggested={onSuggested}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionItem({
  session,
  onSuggested,
}: {
  session: SessionRow;
  onSuggested: (draft: CustomSkillDraft) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: actions } = useQuery({
    queryKey: ["user_actions", session.session_id],
    enabled: open,
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("user_actions")
        .select(
          "id, occurred_at, action, resource, resource_id, payload, context",
        )
        .eq("session_id", session.session_id)
        .order("occurred_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ActionRow[];
    },
  });
  const durationMin = Math.max(
    1,
    Math.round(
      (new Date(session.ended_at).getTime() -
        new Date(session.started_at).getTime()) /
        60_000,
    ),
  );

  return (
    <Card>
      <CardHeader
        className="py-3 cursor-pointer hover:bg-muted/40"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0" />
          )}
          <CardTitle className="text-sm font-mono break-all flex-1">
            {session.session_id.slice(0, 12)}…
          </CardTitle>
          <Badge variant="secondary" className="text-[10px]">
            {session.action_count} actions
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {durationMin} min
          </Badge>
          <span className="text-[11px] text-muted-foreground hidden md:inline">
            {new Date(session.started_at).toLocaleString()}
          </span>
        </div>
        {(session.resources_touched ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1.5 ml-6">
            {(session.resources_touched ?? []).slice(0, 8).map((r) => (
              <Badge key={r} variant="outline" className="text-[10px]">
                {r}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>

      {open && (
        <CardContent className="space-y-3 pt-0">
          <div className="border rounded max-h-72 overflow-auto bg-muted/20 text-xs font-mono">
            {actions === undefined ? (
              <div className="p-3 text-muted-foreground">Chargement…</div>
            ) : actions.length === 0 ? (
              <div className="p-3 text-muted-foreground italic">
                Aucune action.
              </div>
            ) : (
              <ul>
                {actions.map((a) => (
                  <li
                    key={a.id}
                    className="border-b last:border-b-0 px-2 py-1.5"
                  >
                    <span className="text-muted-foreground">
                      {new Date(a.occurred_at).toLocaleTimeString()}
                    </span>{" "}
                    <span className="text-primary">{a.action}</span>
                    {a.resource && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {a.resource}
                        {a.resource_id ? `#${a.resource_id}` : ""}
                      </span>
                    )}
                    {a.payload && Object.keys(a.payload).length > 0 && (
                      <span className="text-muted-foreground/70">
                        {" "}
                        {JSON.stringify(a.payload).slice(0, 80)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <SuggestSkillButton
            sessionId={session.session_id}
            onSuggested={onSuggested}
          />
        </CardContent>
      )}
    </Card>
  );
}

function SuggestSkillButton({
  sessionId,
  onSuggested,
}: {
  sessionId: string;
  onSuggested: (draft: CustomSkillDraft) => void;
}) {
  const [hint, setHint] = useState("");
  const { run, status, output, error, runId } = useSkillRun();

  const launch = () => {
    void run("suggest_skill_from_session", {
      session_id: sessionId,
      user_intent_hint: hint || undefined,
    });
  };

  // When a successful run lands, project its output to a CustomSkillDraft.
  if (status === "success" && output && typeof output === "object") {
    const o = output as Record<string, unknown> & {
      skill_id?: string;
      description?: string;
      model?: string;
      tools_allowed?: string[];
      max_iterations?: number;
      max_writes?: number;
      rate_limit?: { per_minute: number; per_hour: number };
      system_prompt?: string;
      rationale?: string;
      warnings?: string[];
    };
    return (
      <div className="space-y-2 border rounded p-3 bg-muted/30">
        <div className="text-xs font-medium flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Draft généré (run #
          {runId})
        </div>
        <div className="text-xs">
          <div>
            <strong>id</strong> :{" "}
            <span className="font-mono">{o.skill_id}</span>
          </div>
          <div>
            <strong>tools</strong> : {(o.tools_allowed ?? []).length}{" "}
            sélectionnés
          </div>
          <div>
            <strong>model</strong> : {o.model}
          </div>
          {!!o.warnings?.length && (
            <div className="text-amber-600 dark:text-amber-400 mt-1">
              ⚠ {o.warnings.join(" · ")}
            </div>
          )}
          {o.rationale && (
            <p className="text-muted-foreground mt-1 line-clamp-3">
              {o.rationale}
            </p>
          )}
        </div>
        <Button size="sm" onClick={() => onSuggested(o as CustomSkillDraft)}>
          Pré-remplir le formulaire de skill custom
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        value={hint}
        onChange={(e) => setHint(e.target.value)}
        placeholder="Hint optionnel (ex: relance contact silencieux)"
        className="text-xs h-8"
        disabled={status === "running"}
      />
      <Button
        size="sm"
        onClick={launch}
        disabled={status === "running"}
        title="Demande à Claude un draft de skill basé sur cette séquence"
      >
        <Sparkles className="h-4 w-4 mr-1.5" />
        {status === "running" ? "Génération…" : "Suggérer un skill"}
      </Button>
      {status === "error" && (
        <span className="text-xs text-destructive">{error}</span>
      )}
    </div>
  );
}
