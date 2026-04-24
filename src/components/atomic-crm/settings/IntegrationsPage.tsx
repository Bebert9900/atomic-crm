import { useEffect, useMemo, useState } from "react";
import { useGetIdentity, useNotify } from "ra-core";
import { useNavigate } from "react-router";
import {
  Calendar,
  BarChart3,
  Send,
  Save,
  Check,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

import { PageHeader } from "../layout/PageHeader";
import { getSupabaseClient } from "../providers/supabase/supabase";

type IntegrationId = "google_calendar" | "posthog" | "billionmail";

type FieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  readOnly?: boolean;
  helpText?: string;
};

type IntegrationDef = {
  id: IntegrationId;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  fields: FieldDef[];
};

const INTEGRATIONS: IntegrationDef[] = [
  {
    id: "google_calendar",
    title: "Google Calendar",
    subtitle: "Sync 2-way entre les RDV du CRM et Google Calendar",
    icon: Calendar,
    fields: [
      {
        key: "client_id",
        label: "OAuth Client ID",
        placeholder: "xxxxxx.apps.googleusercontent.com",
      },
      {
        key: "client_secret",
        label: "OAuth Client Secret",
        secret: true,
        placeholder: "GOCSPX-...",
      },
      {
        key: "redirect_uri",
        label: "Redirect URI (à copier dans Google Cloud)",
        readOnly: true,
      },
    ],
  },
  {
    id: "posthog",
    title: "PostHog",
    subtitle: "Affiche l'activité produit d'un contact dans sa fiche",
    icon: BarChart3,
    fields: [
      {
        key: "host",
        label: "Host",
        placeholder: "https://eu.i.posthog.com",
      },
      {
        key: "project_id",
        label: "Project ID",
        placeholder: "12345",
      },
      {
        key: "personal_api_key",
        label: "Personal API Key",
        secret: true,
        placeholder: "phx_...",
        helpText:
          "Créer une clé personnelle avec scopes read events + persons dans PostHog → Settings",
      },
    ],
  },
  {
    id: "billionmail",
    title: "BillionMail",
    subtitle: "Pousse les contacts dans la liste Fabrik de BillionMail",
    icon: Send,
    fields: [
      {
        key: "base_url",
        label: "URL BillionMail",
        placeholder: "https://mail.fabrik.so",
      },
      {
        key: "api_key",
        label: "API Key",
        secret: true,
      },
      {
        key: "list_id",
        label: "ID de la liste Fabrik",
        placeholder: "fabrik-list",
      },
    ],
  },
];

type IntegrationRow = {
  id: IntegrationId;
  config: Record<string, string | null | undefined>;
  enabled: boolean;
  updated_at: string;
};

export const IntegrationsPage = () => {
  const { identity } = useGetIdentity();
  const navigate = useNavigate();
  const isAdmin = !!(identity as unknown as { administrator?: boolean })
    ?.administrator;

  const [rows, setRows] = useState<Record<
    IntegrationId,
    IntegrationRow
  > | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data, error } = await getSupabaseClient()
        .from("crm_integrations")
        .select("*");
      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }
      const map: Record<string, IntegrationRow> = {};
      (data ?? []).forEach((r: IntegrationRow) => (map[r.id] = r));
      setRows(map as Record<IntegrationId, IntegrationRow>);
      setLoading(false);
    })();
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <Card className="p-6 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <div>
            <p className="font-medium">Accès restreint</p>
            <p className="text-sm text-muted-foreground">
              Seuls les administrateurs peuvent configurer les intégrations.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="ml-auto"
          >
            Retour
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Intégrations"
        subtitle="Connecte les services externes utilisés par le CRM"
      />

      {loading ? (
        <p className="text-sm text-muted-foreground p-4">Chargement…</p>
      ) : (
        <div className="flex flex-col gap-4 max-w-2xl">
          {INTEGRATIONS.map((def) => (
            <IntegrationCard
              key={def.id}
              def={def}
              row={rows?.[def.id]}
              onSaved={(next) =>
                setRows((prev) =>
                  prev
                    ? { ...prev, [def.id]: next }
                    : ({ [def.id]: next } as Record<
                        IntegrationId,
                        IntegrationRow
                      >),
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
};

IntegrationsPage.path = "/settings/integrations";

function IntegrationCard({
  def,
  row,
  onSaved,
}: {
  def: IntegrationDef;
  row: IntegrationRow | undefined;
  onSaved: (next: IntegrationRow) => void;
}) {
  const notify = useNotify();
  const Icon = def.icon;
  const [enabled, setEnabled] = useState(row?.enabled ?? false);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() =>
    emptyValues(def, row),
  );
  const [dirtySecrets, setDirtySecrets] = useState<Record<string, boolean>>({});

  const configured = useMemo(() => isConfigured(def, row), [def, row]);

  const handleChange = (key: string, value: string, isSecret: boolean) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (isSecret) setDirtySecrets((prev) => ({ ...prev, [key]: true }));
  };

  const handleSave = async () => {
    setSaving(true);

    // Preserve secret values not touched by the user by re-reading from DB.
    // The masked UI never shows the real secret, so if the input is still the
    // placeholder mask we must not overwrite the DB field with it.
    const nextConfig: Record<string, string> = {};
    for (const field of def.fields) {
      if (field.readOnly) continue;
      const value = values[field.key] ?? "";
      if (field.secret && !dirtySecrets[field.key]) {
        // Keep existing value in DB (do not include in patch)
        continue;
      }
      nextConfig[field.key] = value;
    }

    // Merge into existing config so we don't drop untouched non-secret fields
    const merged = { ...(row?.config ?? {}), ...nextConfig };

    const { data, error } = await getSupabaseClient()
      .from("crm_integrations")
      .update({ config: merged, enabled })
      .eq("id", def.id)
      .select("*")
      .single();

    if (error) {
      notify(`Erreur: ${error.message}`, { type: "error" });
      setSaving(false);
      return;
    }
    notify("Intégration enregistrée", { type: "success" });
    onSaved(data as IntegrationRow);
    setDirtySecrets({});
    setValues(emptyValues(def, data as IntegrationRow));
    setSaving(false);
  };

  return (
    <Card>
      <CardContent className="p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-md bg-muted">
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">{def.title}</h3>
              {configured ? (
                <Badge variant="secondary" className="gap-1">
                  <Check className="h-3 w-3" /> Configuré
                </Badge>
              ) : (
                <Badge variant="outline">Non configuré</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{def.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor={`enabled-${def.id}`} className="text-xs">
              Actif
            </Label>
            <Switch
              id={`enabled-${def.id}`}
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {def.fields.map((field) => {
            const hasStoredSecret = field.secret && !!row?.config?.[field.key];
            const currentValue = values[field.key] ?? "";
            return (
              <div key={field.key} className="flex flex-col gap-1.5">
                <Label
                  htmlFor={`${def.id}-${field.key}`}
                  className="text-xs font-medium"
                >
                  {field.label}
                </Label>
                <Input
                  id={`${def.id}-${field.key}`}
                  type={field.secret ? "password" : "text"}
                  value={
                    field.readOnly
                      ? getReadOnlyValue(def.id, field.key)
                      : currentValue
                  }
                  placeholder={
                    hasStoredSecret && !dirtySecrets[field.key]
                      ? "••••••••  (déjà configuré, saisir pour remplacer)"
                      : field.placeholder
                  }
                  readOnly={field.readOnly}
                  onChange={(e) =>
                    handleChange(field.key, e.target.value, !!field.secret)
                  }
                  className={field.readOnly ? "bg-muted" : ""}
                />
                {field.helpText && (
                  <p className="text-[11px] text-muted-foreground">
                    {field.helpText}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          <Button onClick={handleSave} disabled={saving} size="sm">
            <Save className="h-4 w-4 mr-1" />
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function emptyValues(
  def: IntegrationDef,
  row: IntegrationRow | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of def.fields) {
    if (field.secret) {
      // Secret fields always start empty in the UI; placeholder tells user
      // whether a value is already stored.
      out[field.key] = "";
      continue;
    }
    const v = row?.config?.[field.key];
    out[field.key] = typeof v === "string" ? v : "";
  }
  return out;
}

function isConfigured(
  def: IntegrationDef,
  row: IntegrationRow | undefined,
): boolean {
  if (!row) return false;
  for (const field of def.fields) {
    if (field.readOnly) continue;
    const v = row.config?.[field.key];
    if (!v || (typeof v === "string" && !v.trim())) return false;
  }
  return true;
}

function getReadOnlyValue(id: IntegrationId, key: string): string {
  if (id === "google_calendar" && key === "redirect_uri") {
    // Must match the callback route wired by the edge function (to be created)
    if (typeof window !== "undefined") {
      return `${window.location.origin}/auth/google/callback`;
    }
    return "/auth/google/callback";
  }
  return "";
}
