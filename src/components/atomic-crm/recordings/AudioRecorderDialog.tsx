import { useCallback, useState } from "react";
import { useCreate, useNotify, useRefresh } from "ra-core";
import {
  CalendarPlus,
  Mic,
  Square,
  Pause,
  Play,
  RotateCcw,
  Save,
} from "lucide-react";

import { AppointmentCreateSheet } from "../appointments/AppointmentCreateSheet";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useAudioRecorder } from "./useAudioRecorder";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { ATTACHMENTS_BUCKET } from "../providers/commons/attachments";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

interface AudioRecorderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: number;
  contactName: string;
}

export function AudioRecorderDialog({
  open,
  onOpenChange,
  contactId,
  contactName,
}: AudioRecorderDialogProps) {
  const {
    isRecording,
    isPaused,
    duration,
    audioBlob,
    audioUrl,
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    resetRecording,
  } = useAudioRecorder();

  const [create, { isPending: isSaving }] = useCreate();
  const notify = useNotify();
  const refresh = useRefresh();
  const [appointmentOpen, setAppointmentOpen] = useState(false);

  const handleSave = useCallback(async () => {
    if (!audioBlob) return;

    try {
      // Upload to Supabase storage
      const fileName = `recording_${contactId}_${Date.now()}.webm`;
      const { error: uploadError } = await getSupabaseClient()
        .storage.from(ATTACHMENTS_BUCKET)
        .upload(fileName, audioBlob, { contentType: "audio/webm" });

      if (uploadError) {
        throw new Error("Failed to upload recording");
      }

      // Create the record
      await create(
        "contact_recordings",
        {
          data: {
            contact_id: contactId,
            storage_path: fileName,
            duration_seconds: duration,
          },
        },
        {
          onSuccess: (data) => {
            notify("Recording saved, transcription in progress...", {
              type: "success",
            });
            resetRecording();
            onOpenChange(false);
            refresh();
            // Trigger transcription in background
            getSupabaseClient()
              .functions.invoke("transcribe_recording", {
                method: "POST",
                body: { recording_id: data.id },
              })
              .then(({ error }) => {
                if (error) {
                  notify(`Transcription échouée: ${error.message}`, {
                    type: "error",
                  });
                }
                refresh();
              })
              .catch((err) => {
                notify(
                  `Transcription échouée: ${
                    err instanceof Error ? err.message : String(err)
                  }`,
                  { type: "error" },
                );
                refresh();
              });
          },
          onError: () => {
            notify("Failed to save recording", { type: "error" });
          },
        },
      );
    } catch {
      notify("Failed to upload recording", { type: "error" });
    }
  }, [
    audioBlob,
    contactId,
    duration,
    create,
    notify,
    resetRecording,
    onOpenChange,
    refresh,
  ]);

  const handleClose = useCallback(() => {
    if (isRecording) {
      stopRecording();
    }
    resetRecording();
    onOpenChange(false);
  }, [isRecording, stopRecording, resetRecording, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record call — {contactName}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Mic selector */}
          {devices.length > 1 && (
            <Select
              value={selectedDeviceId}
              onValueChange={setSelectedDeviceId}
              disabled={isRecording}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select microphone" />
              </SelectTrigger>
              <SelectContent>
                {devices.map((device) => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Duration display */}
          <div className="text-center">
            <span
              className={`text-4xl font-mono tabular-nums ${isRecording && !isPaused ? "text-red-500" : ""}`}
            >
              {formatDuration(duration)}
            </span>
            {isRecording && !isPaused && (
              <div className="flex items-center justify-center gap-2 mt-1">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-sm text-red-500">Recording</span>
              </div>
            )}
            {isPaused && (
              <div className="text-sm text-muted-foreground mt-1">Paused</div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            {!isRecording && !audioBlob && (
              <Button onClick={startRecording} size="lg" variant="destructive">
                <Mic className="mr-2 h-5 w-5" />
                Start
              </Button>
            )}

            {isRecording && (
              <>
                {isPaused ? (
                  <Button onClick={resumeRecording} size="lg" variant="outline">
                    <Play className="mr-2 h-5 w-5" />
                    Resume
                  </Button>
                ) : (
                  <Button onClick={pauseRecording} size="lg" variant="outline">
                    <Pause className="mr-2 h-5 w-5" />
                    Pause
                  </Button>
                )}
                <Button onClick={stopRecording} size="lg" variant="destructive">
                  <Square className="mr-2 h-5 w-5" />
                  Stop
                </Button>
              </>
            )}

            {!isRecording && audioBlob && (
              <>
                <Button onClick={resetRecording} size="lg" variant="outline">
                  <RotateCcw className="mr-2 h-5 w-5" />
                  Redo
                </Button>
                <Button onClick={handleSave} size="lg" disabled={isSaving}>
                  <Save className="mr-2 h-5 w-5" />
                  {isSaving ? "Saving..." : "Save"}
                </Button>
                <Button
                  onClick={() => setAppointmentOpen(true)}
                  size="lg"
                  variant="secondary"
                >
                  <CalendarPlus className="mr-2 h-5 w-5" />
                  Plan RDV
                </Button>
              </>
            )}
          </div>

          {/* Playback preview */}
          {audioUrl && !isRecording && (
            <audio controls src={audioUrl} className="w-full" />
          )}
        </div>
      </DialogContent>
      <AppointmentCreateSheet
        open={appointmentOpen}
        onOpenChange={setAppointmentOpen}
        contact_id={contactId}
        defaultSource="phone_call"
      />
    </Dialog>
  );
}
