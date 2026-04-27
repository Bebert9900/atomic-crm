import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildAnthropicAuthUrl,
  exchangeAnthropicCode,
  type PendingOAuth,
} from "@/lib/anthropicOAuth";
import { ExternalLink, X, Check, Loader2 } from "lucide-react";

type Props = {
  onClose: () => void;
  onConnected: (info: {
    subscription_type?: string;
    account_email?: string;
  }) => void;
};

export function AnthropicConnectModal({ onClose, onConnected }: Props) {
  const [step, setStep] = useState<"intro" | "paste" | "exchanging">("intro");
  const [pending, setPending] = useState<PendingOAuth | null>(null);
  const [authUrl, setAuthUrl] = useState<string>("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    buildAnthropicAuthUrl().then(({ url, pending }) => {
      setAuthUrl(url);
      setPending(pending);
    });
  }, []);

  const openAndAdvance = () => {
    window.open(authUrl, "_blank", "noopener,noreferrer");
    setStep("paste");
  };

  const submit = async () => {
    if (!pending || !code.trim()) return;
    setStep("exchanging");
    setError(undefined);
    try {
      const result = await exchangeAnthropicCode(code.trim(), pending);
      if (!result.ok) {
        setError("Échec de l'échange du code");
        setStep("paste");
        return;
      }
      onConnected({
        subscription_type: result.subscription_type,
        account_email: result.account_email,
      });
      onClose();
    } catch (e) {
      setError(String(e));
      setStep("paste");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-lg border bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
        <h2 className="mb-1 text-lg font-semibold">
          Connecter votre compte Anthropic
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Votre abonnement Claude Pro/Max sera utilisé pour les messages envoyés
          à l'assistant.
        </p>

        {step === "intro" && (
          <div className="space-y-3">
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>Cliquez sur le bouton ci-dessous</li>
              <li>Connectez-vous à claude.ai si besoin, puis approuvez</li>
              <li>Copiez le code affiché sur la page de confirmation</li>
              <li>Revenez ici et collez-le</li>
            </ol>
            <Button
              className="w-full"
              onClick={openAndAdvance}
              disabled={!authUrl}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Ouvrir la page d'autorisation
            </Button>
          </div>
        )}

        {step === "paste" && (
          <div className="space-y-3">
            <p className="text-sm">
              Collez le code affiché sur la page Anthropic :
            </p>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Coller le code ici"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
            {error && (
              <div className="rounded bg-destructive/10 p-2 text-xs text-destructive">
                {error}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("intro")}>
                Retour
              </Button>
              <Button
                className="flex-1"
                onClick={submit}
                disabled={!code.trim()}
              >
                <Check className="mr-2 h-4 w-4" />
                Valider
              </Button>
            </div>
          </div>
        )}

        {step === "exchanging" && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Connexion en cours...
          </div>
        )}
      </div>
    </div>
  );
}
