import { useState } from "react";
import { useGetList, useRecordContext, useUpdate } from "ra-core";
import { ArrowDownLeft, ArrowUpRight, Mail } from "lucide-react";

import { Card } from "@/components/ui/card";

import type { Contact, EmailMessage } from "../types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stripReplyQuote(text: string | null) {
  if (!text) return "";
  // Cut at first quoted line ("> ..." or "On ... wrote:")
  const lines = text.split("\n");
  const cutIdx = lines.findIndex((l) =>
    /^(>|On .* wrote:|Le .* a écrit.*:|De :|From:)/i.test(l.trim()),
  );
  return (cutIdx > 0 ? lines.slice(0, cutIdx) : lines).join("\n").trim();
}

export const ContactEmails = () => {
  const contact = useRecordContext<Contact>();
  const [expanded, setExpanded] = useState<Record<string | number, boolean>>(
    {},
  );
  const [update] = useUpdate();

  const { data, isPending } = useGetList<EmailMessage>(
    "email_messages",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "date", order: "DESC" },
      filter: { contact_id: contact?.id },
    },
    { enabled: !!contact?.id },
  );

  if (!contact) return null;
  if (isPending) {
    return <p className="text-sm text-muted-foreground py-4">Chargement…</p>;
  }
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center text-center py-8 gap-2">
        <Mail className="w-8 h-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Aucun email échangé avec ce contact pour le moment.
        </p>
        <p className="text-xs text-muted-foreground">
          Les emails apparaîtront ici automatiquement après chaque
          synchronisation.
        </p>
      </div>
    );
  }

  const toggle = (msg: EmailMessage) => {
    setExpanded((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }));
    if (!msg.is_read && msg.folder === "INBOX") {
      update("email_messages", {
        id: msg.id,
        data: { is_read: true },
        previousData: msg,
      });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {data.map((msg) => {
        const isInbound = msg.folder === "INBOX";
        const isOpen = !!expanded[msg.id];
        const preview = stripReplyQuote(msg.text_body).slice(0, 180);
        return (
          <Card
            key={msg.id}
            className={`p-3 cursor-pointer transition-colors hover:bg-muted/30 ${
              !msg.is_read && isInbound ? "border-primary/50 bg-primary/5" : ""
            }`}
            onClick={() => toggle(msg)}
          >
            <div className="flex items-start gap-3">
              <div className="shrink-0 mt-0.5">
                {isInbound ? (
                  <ArrowDownLeft className="w-4 h-4 text-blue-600" />
                ) : (
                  <ArrowUpRight className="w-4 h-4 text-green-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium truncate">
                    {msg.from_name || msg.from_email}
                  </span>
                  <span className="text-xs text-muted-foreground ml-auto shrink-0">
                    {formatDate(msg.date)}
                  </span>
                </div>
                <p className="text-sm font-medium truncate">
                  {msg.subject || "(sans objet)"}
                </p>
                {!isOpen ? (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {preview || "(pas d'aperçu)"}
                  </p>
                ) : (
                  <pre className="text-sm whitespace-pre-wrap mt-2 font-sans">
                    {stripReplyQuote(msg.text_body) ||
                      msg.text_body ||
                      "(message vide)"}
                  </pre>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};
