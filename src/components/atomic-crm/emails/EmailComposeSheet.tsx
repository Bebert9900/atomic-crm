import { useState } from "react";
import { useNotify, useRefresh } from "ra-core";
import { Send, Sparkles, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { getSupabaseClient } from "../providers/supabase/supabase";

const EMAIL_TYPES = [
  { value: "prospection", label: "Prospection / Premier contact" },
  { value: "follow_up", label: "Suivi après échange" },
  { value: "relance", label: "Relance commerciale" },
  { value: "remerciement", label: "Remerciement" },
  { value: "proposal", label: "Envoi de proposition" },
  { value: "introduction", label: "Introduction / Mise en relation" },
  { value: "newsletter", label: "Newsletter personnalisée" },
  { value: "custom", label: "Personnalisé (instructions libres)" },
] as const;

interface EmailComposeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: number;
  contactName: string;
  contactEmail?: string;
}

export function EmailComposeSheet({
  open,
  onOpenChange,
  contactId,
  contactName,
  contactEmail,
}: EmailComposeSheetProps) {
  const notify = useNotify();
  const refresh = useRefresh();

  const [emailType, setEmailType] = useState("follow_up");
  const [customInstructions, setCustomInstructions] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [generated, setGenerated] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await getSupabaseClient().functions.invoke(
        "send_email",
        {
          method: "POST",
          body: {
            contact_id: contactId,
            email_type: emailType,
            custom_instructions:
              emailType === "custom" ? customInstructions : undefined,
            generate_only: true,
          },
        },
      );

      if (error) throw error;

      setSubject(data.subject);
      setBody(data.body);
      setGenerated(true);
    } catch (err) {
      notify(
        `Erreur lors de la génération: ${err instanceof Error ? err.message : "Erreur inconnue"}`,
        { type: "error" },
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!subject || !body) {
      notify("L'objet et le corps de l'email sont requis", { type: "warning" });
      return;
    }

    setSending(true);
    try {
      const { data, error } = await getSupabaseClient().functions.invoke(
        "send_email",
        {
          method: "POST",
          body: {
            contact_id: contactId,
            email_type: emailType,
            subject,
            body,
          },
        },
      );

      if (error) throw error;

      notify(`Email envoyé à ${data.sent_to}`, { type: "success" });
      onOpenChange(false);
      refresh();
      resetForm();
    } catch (err) {
      notify(
        `Erreur lors de l'envoi: ${err instanceof Error ? err.message : "Erreur inconnue"}`,
        { type: "error" },
      );
    } finally {
      setSending(false);
    }
  };

  const resetForm = () => {
    setSubject("");
    setBody("");
    setCustomInstructions("");
    setGenerated(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            Envoyer un email à {contactName}
            {contactEmail && (
              <span className="block text-sm font-normal text-muted-foreground mt-1">
                {contactEmail}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 mt-6">
          {/* Email type selector */}
          <div className="space-y-2">
            <Label>Type d'email</Label>
            <Select value={emailType} onValueChange={setEmailType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMAIL_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom instructions (shown only for custom type) */}
          {emailType === "custom" && (
            <div className="space-y-2">
              <Label>Instructions</Label>
              <Textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="Décrivez le type d'email que vous souhaitez..."
                rows={3}
              />
            </div>
          )}

          {/* Generate button */}
          <Button
            onClick={handleGenerate}
            disabled={generating}
            variant="outline"
            className="w-full"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            {generating
              ? "Génération en cours..."
              : generated
                ? "Regénérer avec l'IA"
                : "Générer avec l'IA"}
          </Button>

          {/* Subject */}
          <div className="space-y-2">
            <Label>Objet</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Objet de l'email"
            />
          </div>

          {/* Body */}
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Corps de l'email..."
              rows={12}
              className="font-mono text-sm"
            />
          </div>

          {/* Send button */}
          <Button
            onClick={handleSend}
            disabled={sending || !subject || !body}
            className="w-full"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            {sending ? "Envoi en cours..." : "Envoyer l'email"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
