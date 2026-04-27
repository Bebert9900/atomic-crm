import { useEffect, useMemo, useState } from "react";
import { useGetIdentity, useNotify } from "ra-core";
import { useNavigate } from "react-router";
import {
  BarChart3,
  Send,
  Save,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Calendar,
  ArrowRight,
  CreditCard,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { PageHeader } from "../layout/PageHeader";
import { getSupabaseClient } from "../providers/supabase/supabase";

type IntegrationId = "posthog" | "billionmail" | "stripe";

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
  setupSteps: { title: string; body: string | React.ReactNode }[];
};

const INTEGRATIONS: IntegrationDef[] = [
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
    setupSteps: [
      {
        title: "1. Récupérer l'URL (Host)",
        body: "EU → https://eu.i.posthog.com — US → https://us.i.posthog.com — self-hosted → l'URL de ton instance.",
      },
      {
        title: "2. Récupérer le Project ID",
        body: "PostHog → Settings du projet → l'ID numérique est visible en haut (ex: 12345).",
      },
      {
        title: "3. Créer une Personal API Key",
        body: "PostHog → Top-right avatar → Personal API keys → Create personal API key. Scopes minimum : Read sur Events + Persons + Session recordings (optionnel). Copier la clé (commence par phx_).",
      },
      {
        title: "4. Coller dans le CRM",
        body: "Coller les 3 valeurs ci-dessous, activer le switch, enregistrer. Les données apparaîtront dans la fiche de chaque contact (section « Activité produit »), matchées sur l'email.",
      },
    ],
  },
  {
    id: "billionmail",
    title: "BillionMail",
    subtitle:
      "Pousse les contacts dans la liste Fabrik + envoi d'emails transactionnels",
    icon: Send,
    fields: [
      {
        key: "base_url",
        label: "URL BillionMail (sans slash final)",
        placeholder: "https://mail.fabrik.so",
      },
      {
        key: "admin_key",
        label: "Admin API Key (Bearer, pour gérer les contacts/listes)",
        secret: true,
        helpText:
          "Récupérée dans Settings de BillionMail. Envoyée en Authorization: Bearer.",
      },
      {
        key: "send_key",
        label: "Send API Key (X-API-Key, pour envoyer des mails)",
        secret: true,
        helpText:
          "Créée via Sending API → Create API. Nécessite l'IP publique Supabase en whitelist.",
      },
      {
        key: "list_id",
        label: "ID de la liste Fabrik",
        placeholder: "1",
        helpText:
          "L'ID numérique de la liste de diffusion visible dans l'UI BillionMail.",
      },
      {
        key: "contacts_endpoint",
        label: "Endpoint d'ajout de contact (à récupérer du Swagger)",
        placeholder: "/api/mailinglists/contacts/add",
        helpText:
          "Varie selon la version BillionMail. Ouvrir <base_url>/swagger, chercher un POST qui prend list_id + email.",
      },
      {
        key: "default_sender",
        label: "Expéditeur par défaut (optionnel)",
        placeholder: "noreply@fabrik.so",
      },
    ],
    setupSteps: [
      {
        title: "1. Prérequis BillionMail",
        body: "Instance BillionMail en place, domaine configuré avec SPF/DKIM/DMARC, activer Swagger dans Settings.",
      },
      {
        title: "2. Récupérer l'Admin Key",
        body: "BillionMail → Settings → copier l'API Key générale. C'est elle qui gère contacts, listes, stats (header Authorization: Bearer).",
      },
      {
        title: "3. Créer une Send Key",
        body: "BillionMail → Sending API → Create API. Nommer, lier à un template d'email, définir sender + sujet par défaut. Whitelist IP : mettre l'IP sortante des edge functions Supabase (voir ci-dessous).",
      },
      {
        title: "4. IP sortante Supabase à whitelist",
        body: "Les edge functions de ton projet sortent depuis un range AWS. Pour l'obtenir précisément : Supabase Dashboard → Project Settings → IPv4 Address, OU lance un curl depuis une edge function vers https://ifconfig.me. Coller cette IP dans la whitelist de la Send API.",
      },
      {
        title: "5. Récupérer l'ID de la liste",
        body: "BillionMail → Newsletter / Mailing Lists → créer ou sélectionner la liste « Fabrik ». Son ID (numérique) est visible dans l'URL ou via Swagger.",
      },
      {
        title: "6. Trouver le bon endpoint contacts",
        body: "Aller sur <base_url>/swagger. Chercher un endpoint POST qui prend { list_id, email, name }. Coller son path dans le champ Endpoint. Valeurs courantes : /api/mailinglists/contacts/add, /api/newsletter/subscribers, /api/contacts/create.",
      },
      {
        title: "7. Tester la connexion",
        body: "Remplir tous les champs, activer Actif, enregistrer. Puis utiliser le bouton « Tester avec un contact » (affiché sous la carte une fois les champs remplis) pour pousser un faux contact vers la liste. Si ça renvoie success, on peut brancher la sync auto.",
      },
    ],
  },
  {
    id: "stripe",
    title: "Stripe",
    subtitle:
      "Trésorerie en temps réel + revenus / abonnements dans la page Affaires",
    icon: CreditCard,
    fields: [
      {
        key: "secret_key",
        label: "Secret Key",
        secret: true,
        placeholder: "sk_live_... ou sk_test_...",
        helpText:
          "Stripe Dashboard → Developers → API keys → Secret key. Restricted key OK si scopes : balance read, payouts read, customers read, invoices read, charges read, subscriptions read.",
      },
      {
        key: "webhook_secret",
        label: "Webhook Signing Secret",
        secret: true,
        placeholder: "whsec_...",
        helpText:
          "Affiché une seule fois à la création du webhook (étape 2 ci-dessous). Si perdu, recréer un webhook.",
      },
    ],
    setupSteps: [
      {
        title: "1. Récupérer la Secret Key",
        body: "Stripe Dashboard → Developers → API keys → copier la Secret key (commence par sk_live_ en prod, sk_test_ en test). Idéalement créer une Restricted Key avec scopes en lecture seule + webhook signing : Balance, Charges, Customers, Invoices, Payouts, Subscriptions, Webhook Endpoints.",
      },
      {
        title: "2. Créer le webhook",
        body: "Stripe Dashboard → Developers → Webhooks → Add endpoint → coller l'URL : https://luibovhuvqnznucfwvym.functions.supabase.co/stripe-webhook → événements à écouter : invoice.paid, invoice.payment_failed, charge.succeeded, charge.refunded, charge.failed, payment_intent.succeeded, payment_intent.payment_failed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted, payout.created, payout.paid, payout.failed, payout.canceled. Une fois créé, cliquer « Reveal » à côté de Signing secret et copier la valeur (whsec_...).",
      },
      {
        title: "3. Coller dans le CRM",
        body: "Coller Secret Key + Webhook Signing Secret ci-dessous, activer le switch Actif, enregistrer.",
      },
      {
        title: "4. Tester la connexion",
        body: "Une fois enregistré et activé, le bouton « Tester la connexion » apparaît sous la carte. Il appelle Stripe pour récupérer la balance — si ça affiche un solde, c'est branché. La trésorerie apparaîtra ensuite dans la page Affaires + un widget sur le dashboard.",
      },
      {
        title: "5. Lier des companies à des Stripe customers (optionnel)",
        body: "Sur la fiche d'une company CRM, coller son ID Stripe (cus_xxx) dans le champ « Stripe customer ID ». Tous les paiements et abonnements de ce customer seront alors visibles dans la fiche. Le webhook fait aussi un fallback automatique par email du contact lié.",
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
          {/* Pointer: Google Calendar is handled per-user via Supabase linkIdentity */}
          <Card className="border-dashed">
            <CardContent className="pt-5 flex items-start gap-3">
              <div className="p-2 rounded-md bg-muted">
                <Calendar className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold">Google Calendar</p>
                <p className="text-xs text-muted-foreground">
                  L'intégration Google est maintenant gérée par utilisateur. Va
                  sur ta <strong>fiche profil</strong> (sidebar bas-gauche →
                  avatar) pour lier ton propre compte Google. Les prérequis
                  admin (Google Cloud + Supabase Dashboard) sont détaillés dans
                  la carte Google Calendar du profil.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/profile")}
                className="shrink-0"
              >
                Ouvrir mon profil <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </CardContent>
          </Card>

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
  const [helpOpen, setHelpOpen] = useState(false);
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

        <div className="rounded-md border border-dashed border-border bg-muted/30">
          <button
            type="button"
            onClick={() => setHelpOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium"
          >
            <span className="flex items-center gap-1.5">
              <HelpCircle className="h-3.5 w-3.5" />
              Comment obtenir les clés
            </span>
            {helpOpen ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          {helpOpen && (
            <ol className="px-4 pb-3 pt-1 flex flex-col gap-2">
              {def.setupSteps.map((step, idx) => (
                <li key={idx} className="text-xs">
                  <p className="font-medium">{step.title}</p>
                  <p className="text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          )}
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

        {def.id === "billionmail" && configured && enabled && (
          <BillionMailTestBlock />
        )}
        {def.id === "stripe" && configured && enabled && <StripeTestBlock />}
      </CardContent>
    </Card>
  );
}

function StripeTestBlock() {
  const notify = useNotify();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<null | {
    ok: boolean;
    body: string;
    summary?: string;
  }>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    const { data, error } = await getSupabaseClient().functions.invoke(
      "get_stripe_treasury",
      { body: {} },
    );
    if (error) {
      setResult({ ok: false, body: error.message });
      notify(`Erreur Stripe: ${error.message}`, { type: "error" });
      setRunning(false);
      return;
    }
    const resp = data as {
      ok?: boolean;
      configured?: boolean;
      enabled?: boolean;
      balance?: {
        available?: Record<string, number>;
        pending?: Record<string, number>;
      };
      message?: string;
    };
    let summary = "";
    if (resp.ok && resp.balance) {
      const avail = resp.balance.available ?? {};
      const pend = resp.balance.pending ?? {};
      const fmt = (cents: number, ccy: string) =>
        `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} ${ccy.toUpperCase()}`;
      const availStr =
        Object.entries(avail)
          .map(([ccy, c]) => fmt(c as number, ccy))
          .join(", ") || "0";
      const pendStr =
        Object.entries(pend)
          .map(([ccy, c]) => fmt(c as number, ccy))
          .join(", ") || "0";
      summary = `Disponible: ${availStr} • En attente: ${pendStr}`;
    }
    setResult({
      ok: !!resp.ok,
      body: JSON.stringify(resp, null, 2),
      summary: summary || resp.message,
    });
    setRunning(false);
  };

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 flex flex-col gap-2">
      <p className="text-xs font-medium">Tester la connexion</p>
      <p className="text-[11px] text-muted-foreground">
        Appelle Stripe pour récupérer la balance live. Confirme que la secret
        key marche et donne un aperçu de la trésorerie actuelle.
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={run} disabled={running}>
          {running ? "Appel Stripe…" : "Tester"}
        </Button>
        {result?.summary && (
          <span
            className={cn(
              "text-xs",
              result.ok
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-destructive",
            )}
          >
            {result.summary}
          </span>
        )}
      </div>
      {result && (
        <pre
          className={cn(
            "text-[11px] p-2 rounded-md overflow-auto max-h-40",
            result.ok
              ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {result.body}
        </pre>
      )}
    </div>
  );
}

function BillionMailTestBlock() {
  const notify = useNotify();
  const [email, setEmail] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<null | {
    ok: boolean;
    body: string;
  }>(null);

  const run = async () => {
    if (!email.includes("@")) {
      notify("Email invalide", { type: "error" });
      return;
    }
    setRunning(true);
    setResult(null);
    const { data, error } = await getSupabaseClient().functions.invoke(
      "billionmail_push_contact",
      { body: { email, name: "BillionMail Test" } },
    );
    if (error) {
      setResult({ ok: false, body: error.message });
      setRunning(false);
      return;
    }
    const resp = data as { ok?: boolean } & Record<string, unknown>;
    setResult({
      ok: !!resp.ok,
      body: JSON.stringify(resp, null, 2),
    });
    setRunning(false);
  };

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 flex flex-col gap-2">
      <p className="text-xs font-medium">Tester avec un contact</p>
      <p className="text-[11px] text-muted-foreground">
        Pousse un faux contact vers la liste Fabrik pour valider base_url +
        admin_key + list_id + endpoint.
      </p>
      <div className="flex items-center gap-2">
        <Input
          type="email"
          placeholder="test+bm@fabrik.so"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-8 text-xs"
        />
        <Button size="sm" variant="secondary" onClick={run} disabled={running}>
          {running ? "Envoi…" : "Tester"}
        </Button>
      </div>
      {result && (
        <pre
          className={cn(
            "text-[11px] p-2 rounded-md overflow-auto max-h-40",
            result.ok
              ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {result.body}
        </pre>
      )}
    </div>
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

function getReadOnlyValue(_id: IntegrationId, _key: string): string {
  return "";
}
