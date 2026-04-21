import { difference, union } from "lodash";
import {
  type Identifier,
  RecordContextProvider,
  RecordRepresentation,
  useListContext,
  useLocaleState,
  useRecordContext,
  useTimeout,
  useTranslate,
} from "ra-core";
import { type MouseEvent, useCallback, useRef } from "react";
import { Link } from "react-router";
import { ReferenceField } from "@/components/admin/reference-field";
import { TextField } from "@/components/admin/text-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Mail, RotateCcw } from "lucide-react";

import { Status } from "../misc/Status";
import { formatRelativeDate } from "../misc/RelativeDate";
import type { Contact } from "../types";
import { Avatar } from "./Avatar";
import { TagsList } from "./TagsList";

export const ContactListContent = () => {
  const translate = useTranslate();
  const {
    data: contacts,
    error,
    isPending,
    onToggleItem,
    onSelect,
    selectedIds,
  } = useListContext<Contact>();
  const lastSelected = useRef<Identifier | null>(null);

  const handleToggleItem = useCallback(
    (id: Identifier, event: MouseEvent) => {
      if (!contacts) return;
      const ids = contacts.map((c) => c.id);
      const lastIdx = lastSelected.current
        ? ids.indexOf(lastSelected.current)
        : -1;
      if (event.shiftKey && lastIdx !== -1) {
        const idx = ids.indexOf(id);
        const range = ids.slice(
          Math.min(lastIdx, idx),
          Math.max(lastIdx, idx) + 1,
        );
        const isSelected = selectedIds?.includes(id);
        onSelect?.(
          isSelected
            ? difference(selectedIds, range)
            : union(selectedIds, range),
        );
      } else {
        onToggleItem(id);
      }
      lastSelected.current = id;
    },
    [contacts, selectedIds, onSelect, onToggleItem],
  );

  if (isPending) return <Skeleton className="w-full h-9" />;
  if (error) return null;

  return (
    <div>
      {/* Table header */}
      <div className="grid grid-cols-[40px_1fr_160px_100px_140px_80px] items-center px-2 py-2 border-b text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <div />
        <div>{translate("resources.contacts.name", { smart_count: 1 })}</div>
        <div>{translate("resources.companies.name", { smart_count: 1 })}</div>
        <div>{translate("resources.notes.fields.status")}</div>
        <div>
          {translate("crm.common.last_activity", {
            _: "Dernière activité",
          })}
        </div>
        <div>
          {translate("resources.contacts.fields.sales_id", {
            _: "Resp.",
          })}
        </div>
      </div>

      {/* Table body */}
      {contacts.map((contact) => (
        <RecordContextProvider key={contact.id} value={contact}>
          <ContactRow
            contact={contact}
            handleToggleItem={handleToggleItem}
          />
        </RecordContextProvider>
      ))}

      {contacts.length === 0 && (
        <div className="p-4 text-muted-foreground">
          {translate("resources.contacts.empty.title", {})}
        </div>
      )}
    </div>
  );
};

const ContactRow = ({
  contact,
  handleToggleItem,
}: {
  contact: Contact;
  handleToggleItem: (id: Identifier, event: MouseEvent) => void;
}) => {
  const [locale = "en"] = useLocaleState();
  const { selectedIds } = useListContext<Contact>();
  const lastActivity = contact.last_seen
    ? formatRelativeDate(contact.last_seen, locale)
    : "";

  return (
    <div className="grid grid-cols-[40px_1fr_160px_100px_140px_80px] items-center px-2 py-2.5 border-b border-border/50 hover:bg-muted/50 transition-colors">
      {/* Checkbox */}
      <div
        className="flex items-center justify-center cursor-pointer"
        onClick={(e) => handleToggleItem(contact.id, e)}
      >
        <Checkbox
          className="cursor-pointer"
          checked={selectedIds.includes(contact.id)}
        />
      </div>

      {/* Contact name + tag */}
      <Link
        to={`/contacts/${contact.id}/show`}
        className="flex items-center gap-3 min-w-0"
      >
        <Avatar width={25} height={25} />
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">
            {contact.first_name} {contact.last_name ?? ""}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            <TagsList />
          </div>
        </div>
      </Link>

      {/* Company */}
      <div className="text-sm text-muted-foreground truncate">
        {contact.company_id != null && (
          <ReferenceField
            source="company_id"
            reference="companies"
            link={false}
          >
            <TextField source="name" />
          </ReferenceField>
        )}
        {contact.company_id == null && "—"}
      </div>

      {/* Status */}
      <div>
        <Status status={contact.status} />
      </div>

      {/* Last activity */}
      <div className="text-xs text-muted-foreground" title={contact.last_seen}>
        {lastActivity}
      </div>

      {/* Sales / Responsible */}
      <div className="flex items-center justify-center">
        {contact.sales_id != null && (
          <ReferenceField
            source="sales_id"
            reference="sales"
            link={false}
          >
            <SalesAvatar />
          </ReferenceField>
        )}
      </div>
    </div>
  );
};

const SalesAvatar = () => {
  const sale = useRecordContext();
  if (!sale) return null;
  const initials = `${(sale.first_name ?? "")[0] ?? ""}${(sale.last_name ?? "")[0] ?? ""}`.toUpperCase();
  return (
    <div
      className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-semibold"
      title={`${sale.first_name ?? ""} ${sale.last_name ?? ""}`}
    >
      {initials}
    </div>
  );
};

/* ============ MOBILE ============ */

export const ContactListContentMobile = () => {
  const translate = useTranslate();
  const {
    data: contacts,
    error,
    isPending,
    refetch,
  } = useListContext<Contact>();
  const oneSecondHasPassed = useTimeout(1000);

  if (isPending) {
    if (!oneSecondHasPassed) return null;
    return (
      <>
        {[...Array(5)].map((_, index) => (
          <div
            key={index}
            className="flex flex-row items-center py-2 hover:bg-muted transition-colors"
          >
            <div className="flex flex-row gap-4 items-center mr-4">
              <Skeleton className="w-10 h-10 rounded-full" />
            </div>
            <div className="flex-1 min-w-0">
              <Skeleton className="w-32 h-5 mb-2" />
              <Skeleton className="w-48 h-4" />
            </div>
          </div>
        ))}
      </>
    );
  }

  if (error && !contacts) {
    return (
      <div className="p-4">
        <div className="text-center text-muted-foreground mb-4">
          {translate("resources.contacts.list.error_loading")}
        </div>
        <div className="text-center mt-2">
          <Button onClick={() => refetch()}>
            <RotateCcw />
            {translate("crm.common.retry")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="md:divide-y">
      {contacts.map((contact) => (
        <RecordContextProvider key={contact.id} value={contact}>
          <ContactItemContentMobile contact={contact} />
        </RecordContextProvider>
      ))}
      {contacts.length === 0 && (
        <div className="p-4 text-muted-foreground">
          {translate("resources.contacts.empty.title")}
        </div>
      )}
    </div>
  );
};

const ContactItemContentMobile = ({ contact }: { contact: Contact }) => {
  const translate = useTranslate();
  return (
    <Link
      to={`/contacts/${contact.id}/show`}
      className="flex flex-row gap-4 items-center py-2 hover:bg-muted transition-colors"
    >
      <Avatar />
      <div className="flex flex-col grow justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex justify-between">
            <div className="font-medium">
              <RecordRepresentation />
            </div>
            <Status status={contact.status} />
          </div>
          <div className="text-sm text-muted-foreground">
            <span>
              {contact.title && contact.company_id != null
                ? `${translate("resources.contacts.position_at", { title: contact.title })} `
                : contact.title}
              {contact.company_id != null && (
                <ReferenceField
                  source="company_id"
                  reference="companies"
                  link={false}
                >
                  <TextField source="name" />
                </ReferenceField>
              )}
            </span>
            {contact.nb_unread_emails ? (
              <span className="inline-flex w-fit items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium ml-1">
                <Mail className="w-3 h-3" />
                {contact.nb_unread_emails}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
};
