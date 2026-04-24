import { useEffect, useState } from "react";
import { useNotify } from "ra-core";
import {
  Calendar,
  Check,
  Link2,
  Unlink,
  AlertTriangle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { getSupabaseClient } from "../providers/supabase/supabase";

type LinkedState =
  | { kind: "loading" }
  | { kind: "linked"; email: string | null }
  | { kind: "not_linked" };

const CALENDAR_SCOPES =
  "email profile openid https://www.googleapis.com/auth/calendar";

/**
 * Per-user Google Calendar connection, backed by Supabase Auth's native
 * Google provider via `linkIdentity`. Supabase stores provider_token in the
 * session; we read it to call the Google Calendar API from the frontend.
 *
 * Admin-side setup lives in Supabase Dashboard → Authentication → Providers →
 * Google, not in this app. The help block below lists the exact steps.
 */
export const GoogleCalendarProfileCard = () => {
  const notify = useNotify();
  const [state, setState] = useState<LinkedState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const refresh = async () => {
    const { data, error } = await getSupabaseClient().auth.getUserIdentities();
    if (error || !data) {
      setState({ kind: "not_linked" });
      return;
    }
    const google = data.identities?.find((i) => i.provider === "google");
    if (!google) {
      setState({ kind: "not_linked" });
      return;
    }
    const email = (google.identity_data as Record<string, unknown> | undefined)
      ?.email;
    setState({
      kind: "linked",
      email: typeof email === "string" ? email : null,
    });
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleLink = async () => {
    setBusy(true);
    const { data, error } = await getSupabaseClient().auth.linkIdentity({
      provider: "google",
      options: {
        scopes: CALENDAR_SCOPES,
        redirectTo: `${window.location.origin}/#/profile`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
    if (error) {
      notify(`Impossible de lier Google: ${error.message}`, { type: "error" });
      setBusy(false);
      return;
    }
    if (data?.url) {
      window.location.href = data.url;
    }
  };

  const handleUnlink = async () => {
    if (!window.confirm("Délier le compte Google ?")) return;
    setBusy(true);
    const { data: idData, error: idErr } =
      await getSupabaseClient().auth.getUserIdentities();
    if (idErr || !idData) {
      notify("Impossible de lister les identités", { type: "error" });
      setBusy(false);
      return;
    }
    const google = idData.identities?.find((i) => i.provider === "google");
    if (!google) {
      setBusy(false);
      return;
    }
    const { error } = await getSupabaseClient().auth.unlinkIdentity(google);
    if (error) {
      notify(`Erreur: ${error.message}`, { type: "error" });
    } else {
      notify("Compte Google délié", { type: "success" });
      setState({ kind: "not_linked" });
    }
    setBusy(false);
  };

  return (
    <Card>
      <CardContent className="pt-6 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-md bg-muted">
            <Calendar className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">Google Calendar</h2>
              {state.kind === "linked" && (
                <Badge variant="secondary" className="gap-1">
                  <Check className="h-3 w-3" /> Lié
                </Badge>
              )}
              {state.kind === "not_linked" && (
                <Badge variant="outline">Non lié</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {state.kind === "linked"
                ? state.email
                  ? `Compte Google ${state.email} · tes RDV CRM peuvent être synchronisés`
                  : "Compte Google lié"
                : "Synchronise tes RDV CRM avec ton Google Calendar personnel"}
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {state.kind === "linked" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleUnlink}
                disabled={busy}
              >
                <Unlink className="h-4 w-4 mr-1" /> Délier
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleLink}
                disabled={busy || state.kind === "loading"}
              >
                <Link2 className="h-4 w-4 mr-1" />
                {busy ? "Redirection…" : "Lier Google Calendar"}
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-md border border-dashed border-border bg-muted/30">
          <button
            type="button"
            onClick={() => setHelpOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium"
          >
            <span className="flex items-center gap-1.5">
              <HelpCircle className="h-3.5 w-3.5" />
              Prérequis admin (une seule fois)
            </span>
            {helpOpen ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          {helpOpen && (
            <ol className="px-4 pb-3 pt-1 flex flex-col gap-2 text-xs">
              <li>
                <p className="font-medium">
                  1. Créer un OAuth Client dans Google Cloud
                </p>
                <p className="text-muted-foreground">
                  console.cloud.google.com → APIs & Services → Credentials →
                  Create OAuth client ID. Type = Web application. Authorized
                  redirect URI = celle fournie par Supabase (étape 2).
                </p>
              </li>
              <li>
                <p className="font-medium">
                  2. Configurer le Google provider dans Supabase
                </p>
                <p className="text-muted-foreground">
                  Supabase Dashboard → Authentication → Providers → Google →
                  Enable. Copier Client ID + Client Secret de Google Cloud.
                  Noter la Callback URL affichée par Supabase (c'est celle à
                  coller dans Google Cloud à l'étape 1).
                </p>
              </li>
              <li>
                <p className="font-medium">3. Activer la Google Calendar API</p>
                <p className="text-muted-foreground">
                  Google Cloud → APIs & Services → Library → chercher « Google
                  Calendar API » → Enable sur le même projet.
                </p>
              </li>
              <li>
                <p className="font-medium">4. Écran de consentement</p>
                <p className="text-muted-foreground">
                  OAuth consent screen → External → ajouter le scope
                  <code className="mx-1">.../auth/calendar</code> → ajouter les
                  3 emails de l'équipe en Test Users tant que l'app n'est pas
                  vérifiée.
                </p>
              </li>
              <li>
                <p className="font-medium">
                  5. Chaque user clique « Lier Google Calendar »
                </p>
                <p className="text-muted-foreground">
                  Une fois les étapes 1-4 faites par un admin, chacun (Jules,
                  Théo, toi) vient sur son profil et lie son compte Google
                  perso. Chacun ses tokens, aucune collision.
                </p>
              </li>
            </ol>
          )}
        </div>

        {state.kind === "linked" && !state.email && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <p>
              L'email Google n'a pas été récupéré. Tu peux délier et re-lier
              pour le récupérer.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
