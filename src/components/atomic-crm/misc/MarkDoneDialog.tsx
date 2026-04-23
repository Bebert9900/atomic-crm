import { useState, useCallback } from "react";
import {
  useCreate,
  useGetIdentity,
  useNotify,
  useRefresh,
  useUpdate,
} from "ra-core";
import { CheckCircle2, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type MarkDoneKind = "task" | "appointment" | "devtask";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: MarkDoneKind;
  id: number;
  contactId?: number | null;
  title?: string;
  onDone?: () => void;
}

export function MarkDoneDialog({
  open,
  onOpenChange,
  kind,
  id,
  contactId,
  title,
  onDone,
}: Props) {
  const notify = useNotify();
  const refresh = useRefresh();
  const { identity } = useGetIdentity();
  const [update] = useUpdate();
  const [create] = useCreate();

  const [comment, setComment] = useState("");
  const [followUp, setFollowUp] = useState(false);
  const [followUpText, setFollowUpText] = useState("");
  const [followUpDate, setFollowUpDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().slice(0, 10);
  });
  const [saving, setSaving] = useState(false);

  const resourceForKind = {
    task: "tasks",
    appointment: "appointments",
    devtask: "dev_tasks",
  }[kind];

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // 1. Mark the entity as done
      const now = new Date().toISOString();
      const data: Record<string, unknown> =
        kind === "task"
          ? { done_date: now }
          : kind === "appointment"
            ? { status: "completed" }
            : { status: "done" };

      await new Promise<void>((resolve, reject) => {
        update(
          resourceForKind,
          { id, data, previousData: {} },
          {
            onSuccess: () => resolve(),
            onError: (e) => reject(e),
          },
        );
      });

      // 2. Record the comment as a contact_note if we have a contact_id and a comment
      if (comment.trim() && contactId) {
        const typeLabel =
          kind === "task"
            ? "Tâche terminée"
            : kind === "appointment"
              ? "Rendez-vous terminé"
              : "Ticket dev terminé";
        const labelTitle = title ? ` — ${title}` : "";
        await new Promise<void>((resolve) => {
          create(
            "contact_notes",
            {
              data: {
                contact_id: contactId,
                text: `✅ ${typeLabel}${labelTitle}\n\n${comment.trim()}`,
                date: now,
                sales_id: identity?.id,
                status: "follow-up",
              },
            },
            {
              onSuccess: () => resolve(),
              onError: () => resolve(), // non blocking
            },
          );
        });
      }

      // 3. Optionally create a follow-up task
      if (followUp && followUpText.trim()) {
        await new Promise<void>((resolve) => {
          create(
            "tasks",
            {
              data: {
                type: "follow-up",
                text: followUpText.trim(),
                due_date: followUpDate
                  ? new Date(followUpDate).toISOString()
                  : now,
                contact_id: contactId ?? null,
                sales_id: identity?.id,
              },
            },
            {
              onSuccess: () => resolve(),
              onError: () => resolve(),
            },
          );
        });
      }

      notify("Terminé ✓", { type: "success" });
      refresh();
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      notify(
        `Impossible de clôturer: ${e instanceof Error ? e.message : String(e)}`,
        { type: "error" },
      );
    } finally {
      setSaving(false);
    }
  }, [
    kind,
    id,
    contactId,
    title,
    comment,
    followUp,
    followUpText,
    followUpDate,
    update,
    create,
    notify,
    refresh,
    onOpenChange,
    onDone,
    resourceForKind,
    identity,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            Marquer comme terminé
          </DialogTitle>
          {title && <DialogDescription>{title}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="done-comment">Commentaire (optionnel)</Label>
            <Textarea
              id="done-comment"
              rows={3}
              placeholder="Qu'est-ce qui a été fait ? Résultat ? Ressenti ?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            {contactId && (
              <p className="text-xs text-muted-foreground mt-1">
                Le commentaire sera ajouté en note sur la fiche contact.
              </p>
            )}
          </div>

          <div className="border-t pt-3">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={followUp}
                onChange={(e) => setFollowUp(e.target.checked)}
              />
              Créer une tâche de suivi
            </label>
            {followUp && (
              <div className="mt-2 space-y-2 pl-6">
                <div>
                  <Label htmlFor="followup-text" className="text-xs">
                    À faire
                  </Label>
                  <Input
                    id="followup-text"
                    placeholder="Relancer, envoyer le devis, etc."
                    value={followUpText}
                    onChange={(e) => setFollowUpText(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="followup-date" className="text-xs">
                    Échéance
                  </Label>
                  <Input
                    id="followup-date"
                    type="date"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Enregistrement...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Terminer
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
