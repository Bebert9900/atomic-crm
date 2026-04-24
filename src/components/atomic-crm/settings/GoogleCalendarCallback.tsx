import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

import { getSupabaseClient } from "../providers/supabase/supabase";

/**
 * Landing page hit by Google after the OAuth consent. Reads `code` + `state`
 * from the URL, posts them to the `google_oauth_callback` edge function,
 * which persists the tokens keyed on the authenticated user's sale row.
 */
export const GoogleCalendarCallback = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const code = params.get("code");
  const state = params.get("state");
  const errorParam = params.get("error");

  const [status, setStatus] = useState<
    | { kind: "loading" }
    | { kind: "ok"; email: string | null }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    if (errorParam) {
      setStatus({ kind: "error", message: `Google: ${errorParam}` });
      return;
    }
    if (!code || !state) {
      setStatus({ kind: "error", message: "Paramètres OAuth manquants" });
      return;
    }
    (async () => {
      const { data, error } = await getSupabaseClient().functions.invoke(
        "google_oauth_callback",
        { body: { code, state } },
      );
      if (error) {
        setStatus({
          kind: "error",
          message: error.message ?? "Échec de la connexion Google",
        });
        return;
      }
      setStatus({
        kind: "ok",
        email: (data as { google_email?: string | null })?.google_email ?? null,
      });
    })();
  }, [code, state, errorParam]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-6 flex flex-col items-center gap-4 text-center">
        {status.kind === "loading" && (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Finalisation de la connexion Google…
            </p>
          </>
        )}
        {status.kind === "ok" && (
          <>
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <div>
              <p className="text-base font-semibold">
                Google Calendar connecté
              </p>
              {status.email && (
                <p className="text-sm text-muted-foreground">{status.email}</p>
              )}
            </div>
            <Button onClick={() => navigate("/profile")}>
              Retour au profil
            </Button>
          </>
        )}
        {status.kind === "error" && (
          <>
            <AlertCircle className="h-10 w-10 text-destructive" />
            <div>
              <p className="text-base font-semibold">Connexion impossible</p>
              <p className="text-sm text-muted-foreground">{status.message}</p>
            </div>
            <Button variant="outline" onClick={() => navigate("/profile")}>
              Retour au profil
            </Button>
          </>
        )}
      </Card>
    </div>
  );
};

GoogleCalendarCallback.path = "/auth/google/callback";
