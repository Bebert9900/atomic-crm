import { Send } from "lucide-react";
import { useRecordContext } from "ra-core";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import type { Contact } from "../types";
import { EmailComposeSheet } from "./EmailComposeSheet";

export const SendEmailButton = () => {
  const contact = useRecordContext<Contact>();
  const [open, setOpen] = useState(false);

  if (!contact?.email_jsonb?.length) return null;

  const contactName = `${contact.first_name} ${contact.last_name}`;
  const contactEmail = contact.email_jsonb[0]?.email;

  return (
    <>
      <Button
        variant="outline"
        className="h-6 cursor-pointer"
        onClick={() => setOpen(true)}
        size="sm"
      >
        <Send className="w-4 h-4" />
        Envoyer un email
      </Button>

      <EmailComposeSheet
        open={open}
        onOpenChange={setOpen}
        contactId={contact.id as number}
        contactName={contactName}
        contactEmail={contactEmail}
      />
    </>
  );
};
