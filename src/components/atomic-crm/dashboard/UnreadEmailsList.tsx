import { ChevronDown, ChevronUp, Mail } from "lucide-react";
import { useState } from "react";
import { useGetList, useTranslate, useUpdate } from "ra-core";
import { useNavigate } from "react-router";
import { Card } from "@/components/ui/card";

import type { UnreadEmail } from "../types";

const DEFAULT_VISIBLE = 3;

function formatRelativeDate(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD} j`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export const UnreadEmailsList = () => {
  const translate = useTranslate();
  const navigate = useNavigate();
  const [update] = useUpdate();
  const [expanded, setExpanded] = useState(false);

  const { data, isPending } = useGetList<UnreadEmail>("unread_emails_summary", {
    pagination: { page: 1, perPage: 20 },
    sort: { field: "date", order: "DESC" },
  });

  const handleClick = (email: UnreadEmail) => {
    update("email_messages", {
      id: email.id,
      data: { is_read: true },
      previousData: { id: email.id, is_read: false },
    });
    if (email.contact_id) {
      navigate(`/contacts/${email.contact_id}/show`);
    }
  };

  const list = data ?? [];
  const visible = expanded ? list : list.slice(0, DEFAULT_VISIBLE);
  const hasMore = list.length > DEFAULT_VISIBLE;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center">
        <div className="mr-3 flex">
          <Mail className="text-muted-foreground w-6 h-6" />
        </div>
        <h2 className="text-xl font-semibold text-muted-foreground flex-1">
          {translate("crm.dashboard.unread_emails", { _: "Emails non lus" })}
        </h2>
        {list.length > 0 ? (
          <span className="text-sm text-muted-foreground">{list.length}</span>
        ) : null}
      </div>
      <Card className="p-4">
        {isPending ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun email non lu pour le moment.
          </p>
        ) : (
          <>
            <ul className="flex flex-col divide-y">
              {visible.map((email) => {
                const contactName =
                  email.contact_first_name || email.contact_last_name
                    ? `${email.contact_first_name ?? ""} ${email.contact_last_name ?? ""}`.trim()
                    : email.from_name || email.from_email;
                return (
                  <li key={email.id}>
                    <button
                      type="button"
                      onClick={() => handleClick(email)}
                      className="w-full text-left py-2 flex flex-col gap-0.5 hover:bg-muted/40 rounded px-1 transition-colors"
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="font-medium text-sm truncate">
                          {contactName}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto shrink-0">
                          {formatRelativeDate(email.date)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {email.subject || "(sans objet)"}
                      </p>
                      {email.account_email ? (
                        <p className="text-xs text-muted-foreground/70 truncate">
                          → {email.account_email}
                        </p>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            {hasMore && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-3 w-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground py-1.5 rounded hover:bg-muted/40 transition-colors"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="size-3.5" />
                    Réduire
                  </>
                ) : (
                  <>
                    <ChevronDown className="size-3.5" />
                    Voir tout ({list.length})
                  </>
                )}
              </button>
            )}
          </>
        )}
      </Card>
    </div>
  );
};
