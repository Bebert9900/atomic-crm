import {
  useCreate,
  useDelete,
  useGetList,
  useGetIdentity,
  useNotify,
  useRefresh,
} from "ra-core";
import { useState, useCallback } from "react";
import {
  Video,
  Trash2,
  ExternalLink,
  Plus,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type VideoConference = {
  id: number;
  contact_id: number | null;
  company_id: number | null;
  title: string;
  url: string;
  transcription_url: string | null;
  transcription: string | null;
  recorded_at: string | null;
  duration_minutes: number | null;
  provider: string;
  notes: string | null;
  sales_id: number | null;
  created_at: string;
};

const PROVIDERS = [
  { value: "zoom", label: "Zoom" },
  { value: "meet", label: "Google Meet" },
  { value: "teams", label: "Microsoft Teams" },
  { value: "loom", label: "Loom" },
  { value: "whereby", label: "Whereby" },
  { value: "other", label: "Autre" },
];

function providerLabel(value: string): string {
  return PROVIDERS.find((p) => p.value === value)?.label ?? value;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function VideoConferenceItem({
  conference,
  showContactName,
}: {
  conference: VideoConference;
  showContactName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deleteOne, { isPending: isDeleting }] = useDelete();
  const notify = useNotify();
  const refresh = useRefresh();

  const handleDelete = useCallback(() => {
    if (
      !window.confirm(
        "Supprimer cette visioconférence ? Le lien et la transcription seront définitivement effacés.",
      )
    ) {
      return;
    }
    deleteOne(
      "video_conferences",
      { id: conference.id },
      {
        onSuccess: () => {
          notify("Visio supprimée", { type: "success" });
          refresh();
        },
        onError: () => notify("Suppression impossible", { type: "error" }),
      },
    );
  }, [deleteOne, conference.id, notify, refresh]);

  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-center gap-3">
        <Video className="h-4 w-4 text-muted-foreground shrink-0" />
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="text-sm font-medium truncate">
            {showContactName ? `${showContactName} · ` : ""}
            {conference.title || providerLabel(conference.provider)}
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
            <span>{providerLabel(conference.provider)}</span>
            {conference.recorded_at && (
              <>
                <span>·</span>
                <span>{formatDate(conference.recorded_at)}</span>
              </>
            )}
            {conference.duration_minutes != null && (
              <>
                <span>·</span>
                <span>{conference.duration_minutes} min</span>
              </>
            )}
          </div>
        </div>
        <a
          href={conference.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-blue-500"
            aria-label="Ouvrir la visio"
            title="Ouvrir la visio"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </a>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-red-500"
          aria-label="Supprimer"
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
        <div className="mt-3 space-y-3 text-sm">
          {conference.transcription_url && (
            <div>
              <span className="text-xs text-muted-foreground block mb-1">
                Lien transcription
              </span>
              <a
                href={conference.transcription_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 underline break-all"
              >
                {conference.transcription_url}
              </a>
            </div>
          )}
          {conference.transcription && (
            <div className="bg-muted rounded-md p-3">
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Transcription
              </div>
              <p className="whitespace-pre-wrap">{conference.transcription}</p>
            </div>
          )}
          {conference.notes && (
            <div>
              <span className="text-xs text-muted-foreground block mb-1">
                Notes
              </span>
              <p className="whitespace-pre-wrap">{conference.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type AddFormProps = {
  defaultContactId?: number | null;
  defaultCompanyId?: number | null;
  onClose: () => void;
};

function AddVideoConferenceForm({
  defaultContactId,
  defaultCompanyId,
  onClose,
}: AddFormProps) {
  const { identity } = useGetIdentity();
  const notify = useNotify();
  const refresh = useRefresh();
  const [create, { isPending }] = useCreate();

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [provider, setProvider] = useState("zoom");
  const [recordedAt, setRecordedAt] = useState(
    new Date().toISOString().slice(0, 16),
  );
  const [durationMinutes, setDurationMinutes] = useState<string>("");
  const [transcriptionUrl, setTranscriptionUrl] = useState("");
  const [transcription, setTranscription] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = useCallback(() => {
    if (!url.trim()) {
      notify("Le lien de la visio est requis", { type: "error" });
      return;
    }
    create(
      "video_conferences",
      {
        data: {
          contact_id: defaultContactId ?? null,
          company_id: defaultCompanyId ?? null,
          title: title.trim(),
          url: url.trim(),
          provider,
          recorded_at: recordedAt ? new Date(recordedAt).toISOString() : null,
          duration_minutes: durationMinutes ? Number(durationMinutes) : null,
          transcription_url: transcriptionUrl.trim() || null,
          transcription: transcription.trim() || null,
          notes: notes.trim() || null,
          sales_id: identity?.id ?? null,
        },
      },
      {
        onSuccess: () => {
          notify("Visio enregistrée", { type: "success" });
          refresh();
          onClose();
        },
        onError: (e) =>
          notify(`Échec: ${e instanceof Error ? e.message : String(e)}`, {
            type: "error",
          }),
      },
    );
  }, [
    create,
    title,
    url,
    provider,
    recordedAt,
    durationMinutes,
    transcriptionUrl,
    transcription,
    notes,
    defaultContactId,
    defaultCompanyId,
    identity,
    notify,
    refresh,
    onClose,
  ]);

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="vc-title">Titre</Label>
        <Input
          id="vc-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Démo produit, découverte, etc."
        />
      </div>
      <div>
        <Label htmlFor="vc-url">Lien vers la visio / l'enregistrement *</Label>
        <Input
          id="vc-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="vc-provider">Plateforme</Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger id="vc-provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="vc-duration">Durée (min)</Label>
          <Input
            id="vc-duration"
            type="number"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            placeholder="30"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="vc-recorded">Date</Label>
        <Input
          id="vc-recorded"
          type="datetime-local"
          value={recordedAt}
          onChange={(e) => setRecordedAt(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="vc-transcription-url">Lien transcription</Label>
        <Input
          id="vc-transcription-url"
          value={transcriptionUrl}
          onChange={(e) => setTranscriptionUrl(e.target.value)}
          placeholder="Lien vers la page transcription (optionnel)"
        />
      </div>
      <div>
        <Label htmlFor="vc-transcription">Transcription collée</Label>
        <Textarea
          id="vc-transcription"
          value={transcription}
          onChange={(e) => setTranscription(e.target.value)}
          rows={4}
          placeholder="Copier-coller le texte de la transcription (optionnel)"
        />
      </div>
      <div>
        <Label htmlFor="vc-notes">Notes</Label>
        <Textarea
          id="vc-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose} disabled={isPending}>
          Annuler
        </Button>
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}

export function AddVideoConferenceButton({
  contactId,
  companyId,
}: {
  contactId?: number | null;
  companyId?: number | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3.5 w-3.5 mr-1" />
        Ajouter une visio
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nouvelle visioconférence</DialogTitle>
          </DialogHeader>
          <AddVideoConferenceForm
            defaultContactId={contactId ?? null}
            defaultCompanyId={companyId ?? null}
            onClose={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ContactVideoConferencesList({
  contactId,
}: {
  contactId: number;
}) {
  const { data: conferences, isPending } = useGetList<VideoConference>(
    "video_conferences",
    {
      filter: { contact_id: contactId },
      sort: { field: "recorded_at", order: "DESC" },
      pagination: { page: 1, perPage: 50 },
    },
  );

  return (
    <div className="flex flex-col gap-2">
      {isPending ? null : !conferences?.length ? (
        <p className="text-xs text-muted-foreground italic">
          Aucune visio pour l'instant
        </p>
      ) : (
        conferences.map((c) => (
          <VideoConferenceItem key={c.id} conference={c} />
        ))
      )}
      <div className="mt-1">
        <AddVideoConferenceButton contactId={contactId} />
      </div>
    </div>
  );
}

export function CompanyVideoConferencesList({
  companyId,
}: {
  companyId: number;
}) {
  // Fetch company-level + contact-level visios
  const { data: companyVisios } = useGetList<VideoConference>(
    "video_conferences",
    {
      filter: { company_id: companyId },
      sort: { field: "recorded_at", order: "DESC" },
      pagination: { page: 1, perPage: 200 },
    },
  );

  // Fetch all contacts of this company, then their visios
  const { data: contacts } = useGetList<{
    id: number;
    first_name: string | null;
    last_name: string | null;
  }>("contacts", {
    filter: { company_id: companyId },
    pagination: { page: 1, perPage: 1000 },
  });
  const contactIds = (contacts ?? []).map((c) => c.id);
  const contactNameById = new Map(
    (contacts ?? []).map((c) => [
      c.id,
      `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—",
    ]),
  );

  const { data: contactVisios } = useGetList<VideoConference>(
    "video_conferences",
    {
      filter: { "contact_id@in": `(${contactIds.join(",") || 0})` },
      sort: { field: "recorded_at", order: "DESC" },
      pagination: { page: 1, perPage: 500 },
    },
    { enabled: contactIds.length > 0 },
  );

  const companyOnly = companyVisios ?? [];
  const fromContacts = (contactVisios ?? []).filter(
    (v) => v.company_id !== companyId,
  );

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold mb-2">
          Visios de l'entreprise ({companyOnly.length})
        </h3>
        {companyOnly.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            Aucune visio attachée à l'entreprise
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {companyOnly.map((c) => (
              <VideoConferenceItem key={c.id} conference={c} />
            ))}
          </div>
        )}
      </div>

      {fromContacts.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">
            Visios avec les contacts ({fromContacts.length})
          </h3>
          <div className="flex flex-col gap-2">
            {fromContacts.map((c) => (
              <VideoConferenceItem
                key={c.id}
                conference={c}
                showContactName={
                  c.contact_id
                    ? (contactNameById.get(c.contact_id) ?? undefined)
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-1">
        <AddVideoConferenceButton companyId={companyId} />
      </div>
    </div>
  );
}
