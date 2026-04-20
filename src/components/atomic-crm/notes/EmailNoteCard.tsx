import { Mail } from "lucide-react";
import { Markdown } from "../misc/Markdown";

import type { ParsedEmailNote } from "./parseEmailNote";

export const EmailNoteCard = ({ email }: { email: ParsedEmailNote }) => {
  return (
    <div className="border border-border rounded-md bg-muted/30 p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Mail className="w-3.5 h-3.5 shrink-0" />
        <span className="font-medium">Email reçu</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-muted-foreground">De</dt>
        <dd className="font-medium truncate">{email.from}</dd>
        {email.to.length > 0 ? (
          <>
            <dt className="text-muted-foreground">À</dt>
            <dd className="truncate">{email.to.join(", ")}</dd>
          </>
        ) : null}
      </dl>
      {email.subject ? (
        <p className="text-sm font-semibold leading-snug">{email.subject}</p>
      ) : null}
      {email.body ? (
        <div className="text-sm pt-1 border-t border-border/60">
          <Markdown>{email.body}</Markdown>
        </div>
      ) : null}
    </div>
  );
};

export const InboundEmailCard = ({
  subject,
  body,
}: {
  subject: string;
  body: string;
}) => {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold leading-snug">{subject}</p>
      <div className="text-sm">
        <Markdown>{body}</Markdown>
      </div>
    </div>
  );
};
