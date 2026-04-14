import { useGetList } from "ra-core";
import { Loader2, FileAudio, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

function RecordingItem({ recording }: { recording: ContactRecording }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

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

  return (
    <div className="border rounded-lg p-3">
      <div
        className="flex items-center gap-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <FileAudio className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">
            {formatDate(recording.created_at)}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatDuration(recording.duration_seconds)}
            {recording.transcription_status === "processing" && (
              <span className="ml-2 inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Transcription...
              </span>
            )}
            {recording.transcription_status === "completed" && (
              <span className="ml-2 text-green-600">Transcribed</span>
            )}
            {recording.transcription_status === "error" && (
              <span className="ml-2 text-red-500">Transcription error</span>
            )}
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
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

          {recording.email_advice && (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-md p-3">
              <div className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">
                ✉️ Conseil pour l'email de suivi
              </div>
              <p className="text-sm whitespace-pre-wrap">
                {recording.email_advice}
              </p>
            </div>
          )}

          {recording.sms_advice && (
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
