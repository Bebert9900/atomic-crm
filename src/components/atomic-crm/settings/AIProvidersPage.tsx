import { useCallback, useEffect, useState } from "react";
import { useNotify } from "ra-core";
import {
  Check,
  Eye,
  EyeOff,
  Loader2,
  LogOut,
  Sparkles,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type AIProvider,
  PROVIDER_DEFAULT_MODELS,
  PROVIDER_HELP,
  PROVIDER_LABELS,
  type ProviderStatus,
  deleteProviderKey,
  listProviderStatuses,
  saveProviderKey,
} from "@/lib/aiProviders";
import {
  getAnthropicStatus,
  revokeAnthropic,
  type OAuthStatus,
} from "@/lib/anthropicOAuth";
import { AnthropicConnectModal } from "../agentic/chat/AnthropicConnectModal";

export const AIProvidersPage = () => {
  const notify = useNotify();
  const [statuses, setStatuses] = useState<ProviderStatus[] | null>(null);
  const [oauth, setOauth] = useState<OAuthStatus>({ connected: false });
  const [oauthOpen, setOauthOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [s, o] = await Promise.all([
        listProviderStatuses(),
        getAnthropicStatus().catch(() => ({ connected: false }) as OAuthStatus),
      ]);
      setStatuses(s);
      setOauth(o);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="max-w-3xl mx-auto mt-4 p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mes clés API IA</h1>
        <p className="text-sm text-muted-foreground mt-1">
          L'assistant utilise vos clés en priorité. Configurez au moins un
          fournisseur — l'ordre de préférence est Anthropic, puis DeepSeek, puis
          OpenRouter. Les clés sont chiffrées en base avant stockage et ne sont
          jamais relues côté client.
        </p>
      </div>

      {error && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {statuses === null ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : (
        <div className="space-y-4">
          {statuses.map((s) => (
            <ProviderCard
              key={s.provider}
              status={s}
              oauth={s.provider === "anthropic" ? oauth : undefined}
              onConnectOAuth={
                s.provider === "anthropic"
                  ? () => setOauthOpen(true)
                  : undefined
              }
              onRevokeOAuth={
                s.provider === "anthropic"
                  ? async () => {
                      await revokeAnthropic();
                      notify("Compte Anthropic déconnecté", { type: "info" });
                      void reload();
                    }
                  : undefined
              }
              onSaved={() => {
                notify("Clé enregistrée", { type: "success" });
                void reload();
              }}
              onDeleted={() => {
                notify("Clé supprimée", { type: "success" });
                void reload();
              }}
              onError={(msg) => notify(msg, { type: "error" })}
            />
          ))}
        </div>
      )}

      {oauthOpen && (
        <AnthropicConnectModal
          onClose={() => setOauthOpen(false)}
          onConnected={() => {
            notify("Compte Anthropic connecté", { type: "success" });
            void reload();
          }}
        />
      )}
    </div>
  );
};

AIProvidersPage.path = "/settings/ai-providers";

function ProviderCard({
  status,
  oauth,
  onConnectOAuth,
  onRevokeOAuth,
  onSaved,
  onDeleted,
  onError,
}: {
  status: ProviderStatus;
  oauth?: OAuthStatus;
  onConnectOAuth?: () => void;
  onRevokeOAuth?: () => void | Promise<void>;
  onSaved: () => void;
  onDeleted: () => void;
  onError: (msg: string) => void;
}) {
  const provider: AIProvider = status.provider;
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(status.model ?? "");
  const [label, setLabel] = useState(status.label ?? "");
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setModel(status.model ?? "");
    setLabel(status.label ?? "");
  }, [status.model, status.label]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await saveProviderKey({
        provider,
        apiKey: apiKey.trim(),
        label: label || undefined,
        model: model || undefined,
      });
      setApiKey("");
      onSaved();
    } catch (err) {
      onError(`Erreur : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!confirm(`Supprimer votre clé ${PROVIDER_LABELS[provider]} ?`)) return;
    setDeleting(true);
    try {
      await deleteProviderKey(provider);
      onDeleted();
    } catch (err) {
      onError(`Erreur : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeleting(false);
    }
  };

  const oauthConnected = oauth?.connected === true;

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-lg font-medium">{PROVIDER_LABELS[provider]}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {PROVIDER_HELP[provider]}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {oauthConnected && (
              <span className="flex items-center gap-1 rounded bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-400">
                <Sparkles className="w-3 h-3" />
                {oauth?.subscription_type?.toUpperCase() ?? "OAUTH"}
              </span>
            )}
            {status.connected && (
              <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <Check className="w-3 h-3" /> Clé configurée
              </span>
            )}
          </div>
        </div>

        {onConnectOAuth && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <p className="text-sm font-medium">
              Option 1 — Compte Anthropic (recommandé)
            </p>
            <p className="text-xs text-muted-foreground">
              Utilise votre abonnement Claude Pro/Max — pas de coût d'API
              credits, c'est facturé sur votre quota d'abonnement.
            </p>
            {oauthConnected ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs">
                  Connecté
                  {oauth?.account_email
                    ? ` en tant que ${oauth.account_email}`
                    : ""}
                  {oauth?.subscription_type
                    ? ` (${oauth.subscription_type.toUpperCase()})`
                    : ""}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRevokeOAuth?.()}
                >
                  <LogOut className="w-4 h-4 mr-1" />
                  Déconnecter
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onConnectOAuth}
              >
                <Sparkles className="w-4 h-4 mr-1" />
                Connecter mon compte Anthropic
              </Button>
            )}
          </div>
        )}

        {onConnectOAuth && (
          <p className="text-xs text-muted-foreground -mb-2">
            Option 2 — Clé API Anthropic
          </p>
        )}

        <form onSubmit={onSave} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor={`${provider}-key`}>
              {status.connected ? "Remplacer la clé" : "Clé API"}
            </Label>
            <div className="flex gap-2">
              <Input
                id={`${provider}-key`}
                type={reveal ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  status.connected ? "(laisser vide pour conserver)" : "sk-..."
                }
                autoComplete="new-password"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setReveal((r) => !r)}
                title={reveal ? "Masquer" : "Afficher"}
              >
                {reveal ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor={`${provider}-model`}>Modèle (optionnel)</Label>
              <Input
                id={`${provider}-model`}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={PROVIDER_DEFAULT_MODELS[provider]}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${provider}-label`}>Libellé (optionnel)</Label>
              <Input
                id={`${provider}-label`}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="ex: compte perso"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            {status.connected && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-1" />
                )}
                Supprimer
              </Button>
            )}
            <Button type="submit" disabled={saving || !apiKey.trim()}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  Enregistrement…
                </>
              ) : status.connected ? (
                "Mettre à jour"
              ) : (
                "Enregistrer"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
