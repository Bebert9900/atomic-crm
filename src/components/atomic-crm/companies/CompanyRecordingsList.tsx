import { useGetList } from "ra-core";
import { FileAudio } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { Contact, ContactRecording } from "../types";
import { RecordingItem } from "../recordings/ContactRecordingsList";

export function CompanyRecordingsList({ companyId }: { companyId: number }) {
  const { data: contacts, isPending: contactsPending } = useGetList<Contact>(
    "contacts",
    {
      filter: { company_id: companyId },
      pagination: { page: 1, perPage: 1000 },
    },
  );

  const contactIds = (contacts ?? []).map((c) => c.id);
  const contactNameById = new Map(
    (contacts ?? []).map((c) => [
      c.id,
      `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—",
    ]),
  );

  const { data: recordings, isPending: recordingsPending } =
    useGetList<ContactRecording>(
      "contact_recordings",
      {
        filter: { "contact_id@in": `(${contactIds.join(",")})` },
        sort: { field: "created_at", order: "DESC" },
        pagination: { page: 1, perPage: 200 },
      },
      { enabled: contactIds.length > 0 },
    );

  if (contactsPending || recordingsPending) return null;

  if (!recordings?.length) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Aucun enregistrement pour cette entreprise.
      </p>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FileAudio className="h-4 w-4" />
          Enregistrements ({recordings.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {recordings.map((recording) => (
          <RecordingItem
            key={recording.id}
            recording={recording}
            contactName={contactNameById.get(recording.contact_id) ?? ""}
          />
        ))}
      </CardContent>
    </Card>
  );
}
