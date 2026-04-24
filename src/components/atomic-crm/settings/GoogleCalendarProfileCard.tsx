import { useEffect, useState } from "react";
import { useGetIdentity, useNotify } from "ra-core";
import { Calendar, Check, Link2, Unlink } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { getSupabaseClient } from "../providers/supabase/supabase";

type ConnectionState =
  | { kind: "loading" }
  | { kind: "connected"; email: string | null }
  | { kind: "disconnected" };

/**
 * Profile card where each user links their own Google account.
 * Depends on the admin-level OAuth config stored in `crm_integrations`.
 */
export const GoogleCalendarProfileCard = () => {
  const { identity } = useGetIdentity();
  const notify = useNotify();
  const [state, setState] = useState<ConnectionState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!identity?.id) return;
    const { data, error } = await getSupabaseClient()
      .from("google_calendar_accounts")
      .select("google_email, refresh_token")
      .eq("sales_id", identity.id)
      .maybeSingle();
    if (error) {
      console.error(error);
      setState({ kind: "disconnected" });
      return;
    }
    if (data?.refresh_token) {
      setState({ kind: "connected", email: data.google_email ?? null });
    } else {
      setState({ kind: "disconnected" });
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity?.id]);

  const handleConnect = async () => {
    setBusy(true);
    const { data, error } = await getSupabaseClient().functions.invoke(
      "google_oauth_start",
      { body: {} },
    );
    if (error || !data?.auth_url) {
      notify(
        `Impossible de démarrer la connexion: ${
          error?.message ?? "config manquante"
        }`,
        { type: "error" },
      );
      setBusy(false);
      return;
    }
    // Full-page navigate — Google's consent screen forbids iframes.
    window.location.href = data.auth_url as string;
  };

  const handleDisconnect = async () => {
    if (!identity?.id) return;
    if (!window.confirm("Déconnecter Google Calendar ?")) return;
    setBusy(true);
    const { error } = await getSupabaseClient()
      .from("google_calendar_accounts")
      .delete()
      .eq("sales_id", identity.id);
    if (error) {
      notify(`Erreur: ${error.message}`, { type: "error" });
    } else {
      notify("Google Calendar déconnecté", { type: "success" });
      setState({ kind: "disconnected" });
    }
    setBusy(false);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-md bg-muted">
            <Calendar className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">Google Calendar</h2>
              {state.kind === "connected" && (
                <Badge variant="secondary" className="gap-1">
                  <Check className="h-3 w-3" /> Connecté
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {state.kind === "connected"
                ? (state.email ??
                  "Compte Google lié (email non récupéré, re-connecter pour l'afficher)")
                : "Sync de tes RDV Atomic CRM avec ton Google Calendar personnel"}
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {state.kind === "connected" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={busy}
              >
                <Unlink className="h-4 w-4 mr-1" /> Déconnecter
              </Button>
            ) : (
              <Button size="sm" onClick={handleConnect} disabled={busy}>
                <Link2 className="h-4 w-4 mr-1" />
                {busy ? "Redirection…" : "Connecter Google Calendar"}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
