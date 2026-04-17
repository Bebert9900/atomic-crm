import { Mail } from "lucide-react";
import { useGetIdentity, useGetList, useTranslate, useUpdate } from "ra-core";
import { useNavigate } from "react-router";
import { Card } from "@/components/ui/card";

import type { UnreadEmail } from "../types";

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
  const { identity } = useGetIdentity();
  const translate = useTranslate();
  const navigate = useNavigate();
  const [update] = useUpdate();

  const { data, isPending } = useGetList<UnreadEmail>(
    "unread_emails_summary",
    {
      pagination: { page: 1, perPage: 10 },
      sort: { field: "date", order: "DESC" },
      filter: identity?.id ? { sales_id: identity.id } : {},
    },
    { enabled: Number.isInteger(identity?.id) },
  );

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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center">
        <div className="mr-3 flex">
          <Mail className="text-muted-foreground w-6 h-6" />
        </div>
        <h2 className="text-xl font-semibold text-muted-foreground flex-1">
          {translate("crm.dashboard.unread_emails", { _: "Emails non lus" })}
        </h2>
        {data && data.length > 0 ? (
          <span className="text-sm text-muted-foreground">{data.length}</span>
        ) : null}
      </div>
      <Card className="p-4">
        {isPending ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun email non lu pour le moment.
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {data.map((email) => {
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
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
};
