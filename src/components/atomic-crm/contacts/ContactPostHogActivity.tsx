import { useEffect, useMemo, useState } from "react";
import { useRecordContext } from "ra-core";
import { BarChart3, ExternalLink, Globe } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSupabaseClient } from "../providers/supabase/supabase";
import type { Contact } from "../types";

type PostHogEvent = {
  id: string;
  event: string;
  timestamp: string;
  url: string | null;
  session_id: string | null;
  properties: {
    browser: string | null;
    os: string | null;
    device_type: string | null;
  };
};

type PostHogResponse = {
  configured: boolean;
  person: {
    id: string;
    name: string | null;
    distinct_id: string;
    posthog_url: string;
  } | null;
  events: PostHogEvent[];
};

function getPrimaryEmail(contact: Contact): string | null {
  const arr = contact.email_jsonb as
    | Array<{ email: string; type?: string }>
    | undefined;
  if (Array.isArray(arr) && arr.length > 0) return arr[0].email ?? null;
  return null;
}

export const ContactPostHogActivity = () => {
  const record = useRecordContext<Contact>();
  const email = useMemo(
    () => (record ? getPrimaryEmail(record) : null),
    [record],
  );

  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    data: PostHogResponse | null;
  }>({ loading: true, error: null, data: null });

  useEffect(() => {
    if (!email) {
      setState({
        loading: false,
        error: null,
        data: { configured: false, person: null, events: [] },
      });
      return;
    }
    (async () => {
      setState({ loading: true, error: null, data: null });
      const { data, error } = await getSupabaseClient().functions.invoke(
        "posthog_contact_activity",
        { body: { email, limit: 30 } },
      );
      if (error) {
        setState({
          loading: false,
          error: error.message ?? "Erreur PostHog",
          data: null,
        });
        return;
      }
      setState({
        loading: false,
        error: null,
        data: data as PostHogResponse,
      });
    })();
  }, [email]);

  if (!record) return null;

  if (!email) {
    return (
      <EmptyCard
        title="Pas d'email sur ce contact"
        body="PostHog matche les profils par email. Ajoute un email au contact pour voir son activité produit."
      />
    );
  }

  if (state.loading) {
    return (
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">Chargement PostHog…</p>
      </Card>
    );
  }

  if (state.error) {
    return <EmptyCard title="Erreur PostHog" body={state.error} />;
  }

  if (!state.data?.configured) {
    return (
      <EmptyCard
        title="PostHog non configuré"
        body="Un admin doit renseigner les credentials PostHog dans Paramètres → Intégrations."
      />
    );
  }

  if (!state.data.person) {
    return (
      <EmptyCard
        title="Aucun profil PostHog trouvé"
        body={`Aucune personne avec l'email ${email} dans PostHog. Le contact n'a probablement jamais utilisé le produit sous cet identifiant.`}
      />
    );
  }

  return (
    <Card className="p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="text-base font-semibold">Activité produit</h3>
            <p className="text-xs text-muted-foreground">
              {state.data.events.length} event
              {state.data.events.length !== 1 ? "s" : ""} · source PostHog
            </p>
          </div>
        </div>
        <a
          href={state.data.person.posthog_url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-blue-500 hover:underline flex items-center gap-1"
        >
          Ouvrir dans PostHog <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {state.data.events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Le contact existe dans PostHog mais n'a aucun event récent.
        </p>
      ) : (
        <ul className="flex flex-col divide-y">
          {state.data.events.map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
        </ul>
      )}
    </Card>
  );
};

function EventRow({ event }: { event: PostHogEvent }) {
  const date = new Date(event.timestamp);
  return (
    <li className="py-2 flex items-start gap-3">
      <Badge variant="outline" className="font-mono text-[10px] shrink-0">
        {event.event}
      </Badge>
      <div className="flex-1 min-w-0">
        {event.url && (
          <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
            <Globe className="h-3 w-3 shrink-0" />
            {event.url}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">
          {formatDistanceToNow(date, { addSuffix: true, locale: fr })} ·{" "}
          {[
            event.properties.browser,
            event.properties.os,
            event.properties.device_type,
          ]
            .filter(Boolean)
            .join(" · ") || "—"}
        </p>
      </div>
    </li>
  );
}

function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <Card className="p-5 flex flex-col gap-1">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{body}</p>
    </Card>
  );
}
