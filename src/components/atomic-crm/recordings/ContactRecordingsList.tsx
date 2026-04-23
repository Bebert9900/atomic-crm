import { useDelete, useGetList, useNotify, useRefresh } from "ra-core";
import {
  Loader2,
  FileAudio,
  ChevronDown,
  ChevronUp,
  Trash2,
  RefreshCcw,
  Copy,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import type { ContactRecording } from "../types";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { ATTACHMENTS_BUCKET } from "../providers/commons/attachments";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RecordingItem({
  recording,
  contactName,
}: {
  recording: ContactRecording;
  contactName?: string;
}) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [deleteOne, { isPending: isDeleting }] = useDelete();
  const notify = useNotify();
  const refresh = useRefresh();

  const loadAudio = useCallback(async () => {
    if (audioUrl) return;
    const { data } = await getSupabaseClient()
      .storage.from(ATTACHMENTS_BUCKET)
      .createSignedUrl(recording.storage_path, 3600);
    if (data?.signedUrl) {
      setAudioUrl(data.signedUrl);
    }
  }, [recording.storage_path, audioUrl]);

  useEffect(() => {
    if (expanded && !audioUrl) {
      loadAudio();
    }
  }, [expanded, audioUrl, loadAudio]);

  const handleRetry = useCallback(async () => {
    setIsRetrying(true);
    try {
      const { error } = await getSupabaseClient().functions.invoke(
        "transcribe_recording",
        { method: "POST", body: { recording_id: recording.id } },
      );
      if (error) {
        let detail = error.message;
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx && typeof ctx.text === "function") {
            const body = await ctx.clone().text();
            if (body) {
              try {
                const parsed = JSON.parse(body);
                detail = parsed.message ?? body;
              } catch {
                detail = body;
              }
            }
          }
        } catch {
          /* ignore */
        }
        notify(`Transcription échouée: ${detail}`, { type: "error" });
      } else {
        notify("Transcription relancée", { type: "success" });
      }
    } catch (e) {
      notify(
        `Transcription échouée: ${e instanceof Error ? e.message : String(e)}`,
        { type: "error" },
      );
    } finally {
      setIsRetrying(false);
      refresh();
    }
  }, [recording.id, notify, refresh]);

  const copyDraft = useCallback(
    (text: string, label: string) => {
      navigator.clipboard?.writeText(text).then(
        () => notify(`${label} copié`, { type: "info" }),
        () => notify("Copie impossible", { type: "error" }),
      );
    },
    [notify],
  );

  const handleDelete = useCallback(async () => {
    if (
      !window.confirm(
        "Supprimer cet enregistrement ? L'audio et la transcription seront définitivement supprimés.",
      )
    ) {
      return;
    }
    try {
      await getSupabaseClient()
        .storage.from(ATTACHMENTS_BUCKET)
        .remove([recording.storage_path]);
    } catch {
      // Storage may already be gone — still try to remove the DB row.
    }
    deleteOne(
      "contact_recordings",
      { id: recording.id },
      {
        onSuccess: () => {
          notify("Enregistrement supprimé", { type: "success" });
          refresh();
        },
        onError: () => {
          notify("Suppression impossible", { type: "error" });
        },
      },
    );
  }, [deleteOne, recording.id, recording.storage_path, notify, refresh]);

  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-center gap-3">
        <FileAudio
          className="h-4 w-4 text-muted-foreground shrink-0 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        />
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="text-sm font-medium">
            {contactName ? `${contactName} · ` : ""}
            {formatDate(recording.created_at)}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatDuration(recording.duration_seconds)}
            {recording.transcription_status === "pending" && (
              <span className="ml-2 text-amber-600">En attente</span>
            )}
            {recording.transcription_status === "processing" && (
              <span className="ml-2 inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Transcription...
              </span>
            )}
            {recording.transcription_status === "completed" && (
              <span className="ml-2 text-green-600">Transcrit</span>
            )}
            {recording.transcription_status === "error" && (
              <span className="ml-2 text-red-500">Erreur transcription</span>
            )}
            {recording.warmth_label && (
              <span className="ml-2 inline-flex items-center gap-1 text-orange-600">
                🔥 {recording.warmth_label}
                {recording.warmth_score != null
                  ? ` · ${recording.warmth_score}/100`
                  : ""}
              </span>
            )}
            {recording.sentiment && (
              <span className="ml-2 text-muted-foreground">
                · {recording.sentiment}
              </span>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-blue-500"
          aria-label="Relancer la transcription"
          onClick={handleRetry}
          disabled={isRetrying}
          title="Relancer la transcription"
        >
          {isRetrying ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCcw className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-red-500"
          aria-label="Supprimer l'enregistrement"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <div className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3">
          {audioUrl && <audio controls src={audioUrl} className="w-full" />}

          {recording.summary && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-md p-3">
              <div className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
                📋 Résumé de l'appel
              </div>
              <p className="text-sm whitespace-pre-wrap">{recording.summary}</p>
            </div>
          )}

          {recording.email_draft && (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-md p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-medium text-green-700 dark:text-green-300">
                  ✉️ Email de suivi (prêt à envoyer)
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => copyDraft(recording.email_draft!, "Email")}
                >
                  <Copy className="h-3 w-3 mr-1" /> Copier
                </Button>
              </div>
              <p className="text-sm whitespace-pre-wrap">
                {recording.email_draft}
              </p>
              {recording.email_advice && (
                <p className="text-xs italic text-muted-foreground mt-2">
                  💡 {recording.email_advice}
                </p>
              )}
            </div>
          )}
          {!recording.email_draft && recording.email_advice && (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-md p-3">
              <div className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">
                ✉️ Conseil pour l'email de suivi
              </div>
              <p className="text-sm whitespace-pre-wrap">
                {recording.email_advice}
              </p>
            </div>
          )}

          {recording.sms_draft && (
            <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900 rounded-md p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-medium text-purple-700 dark:text-purple-300">
                  💬 SMS de suivi (prêt à envoyer)
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => copyDraft(recording.sms_draft!, "SMS")}
                >
                  <Copy className="h-3 w-3 mr-1" /> Copier
                </Button>
              </div>
              <p className="text-sm whitespace-pre-wrap">
                {recording.sms_draft}
              </p>
              {recording.sms_advice && (
                <p className="text-xs italic text-muted-foreground mt-2">
                  💡 {recording.sms_advice}
                </p>
              )}
            </div>
          )}
          {!recording.sms_draft && recording.sms_advice && (
            <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900 rounded-md p-3">
              <div className="text-xs font-medium text-purple-700 dark:text-purple-300 mb-1">
                💬 Conseil pour le SMS de suivi
              </div>
              <p className="text-sm whitespace-pre-wrap">
                {recording.sms_advice}
              </p>
            </div>
          )}

          {recording.transcription && (
            <div className="bg-muted rounded-md p-3">
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Transcription complète
              </div>
              <p className="text-sm whitespace-pre-wrap">
                {recording.transcription}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ContactRecordingsList({ contactId }: { contactId: number }) {
  const { data: recordings, isPending } = useGetList<ContactRecording>(
    "contact_recordings",
    {
      filter: { contact_id: contactId },
      sort: { field: "created_at", order: "DESC" },
      pagination: { page: 1, perPage: 50 },
    },
  );

  if (isPending) return null;
  if (!recordings?.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FileAudio className="h-4 w-4" />
          Recordings ({recordings.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {recordings.map((recording) => (
          <RecordingItem key={recording.id} recording={recording} />
        ))}
      </CardContent>
    </Card>
  );
}
