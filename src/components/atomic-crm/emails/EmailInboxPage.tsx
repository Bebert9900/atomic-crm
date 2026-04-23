import { useMemo, useState } from "react";
import {
  useGetIdentity,
  useGetList,
  useGetMany,
  useNotify,
  useRecordContext,
  useRefresh,
  useUpdate,
} from "ra-core";
import { Link, useNavigate } from "react-router";
import {
  Inbox,
  Mail,
  Search,
  Send,
  Settings2,
  CheckCircle2,
  Circle,
  Trash2,
  User as UserIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { PageHeader } from "../layout/PageHeader";
import type { EmailAccount, Sale } from "../types";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { ComposeEmailDialog, type ComposeInitial } from "./ComposeEmailDialog";
import { Reply, ReplyAll, Forward, PenSquare } from "lucide-react";

type EmailMessage = {
  id: number;
  message_id: string | null;
  email_account_id: number;
  folder: string | null;
  from_email: string;
  from_name: string | null;
  to_emails: Array<{ email: string; name?: string }> | string[] | null;
  cc_emails: Array<{ email: string; name?: string }> | string[] | null;
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
  date: string;
  is_read: boolean;
  contact_id: number | null;
  sales_id: number | null;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (d > oneWeekAgo) {
    return d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit" });
  }
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function extractRecipients(
  raw:
    | Array<{ email: string; name?: string }>
    | string[]
    | string
    | null
    | undefined,
): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  return raw
    .map((r) => {
      if (typeof r === "string") return r;
      return r.name ? `${r.name} <${r.email}>` : r.email;
    })
    .join(", ");
}

function previewFromBody(text: string | null): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").replace(/^>.*/gm, "").slice(0, 160).trim();
}

const FOLDER_OPTIONS = [
  { value: "inbox", label: "Boîte de réception", icon: Inbox },
  { value: "sent", label: "Envoyés", icon: Send },
  { value: "all", label: "Tout", icon: Mail },
];

export const EmailInboxPage = () => {
  const { identity } = useGetIdentity();
  const navigate = useNavigate();
  const notify = useNotify();
  const refresh = useRefresh();
  const [update] = useUpdate();

  const isAdmin = !!(identity as unknown as { administrator?: boolean })
    ?.administrator;

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeInitial, setComposeInitial] = useState<
    ComposeInitial | undefined
  >(undefined);
  const [folder, setFolder] = useState<string>("inbox");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: accounts } = useGetList<EmailAccount>("email_accounts", {
    pagination: { page: 1, perPage: 50 },
    sort: { field: "email", order: "ASC" },
  });

  const { data: sales } = useGetList<Sale>("sales", {
    pagination: { page: 1, perPage: 100 },
  });
  const salesById = useMemo(
    () => new Map((sales ?? []).map((s) => [s.id, s])),
    [sales],
  );

  const filter: Record<string, unknown> = {};
  if (folder === "inbox") filter["folder@ilike"] = "%inbox%";
  else if (folder === "sent") filter["folder@ilike"] = "%sent%";
  if (onlyUnread) filter.is_read = false;
  if (accountFilter !== "all") filter.email_account_id = Number(accountFilter);
  if (search.trim()) {
    filter["subject@ilike"] = `%${search.trim()}%`;
  }

  const { data: messages, isPending } = useGetList<EmailMessage>(
    "email_messages",
    {
      filter,
      sort: { field: "date", order: "DESC" },
      pagination: { page: 1, perPage: 200 },
    },
  );

  const selected = useMemo(
    () => (selectedId ? messages?.find((m) => m.id === selectedId) : null),
    [selectedId, messages],
  );

  const handleSelect = (m: EmailMessage) => {
    setSelectedId(m.id);
    if (!m.is_read) {
      update(
        "email_messages",
        { id: m.id, data: { is_read: true }, previousData: m },
        {
          onSuccess: () => refresh(),
        },
      );
    }
  };

  const toggleRead = (m: EmailMessage) => {
    update(
      "email_messages",
      { id: m.id, data: { is_read: !m.is_read }, previousData: m },
      {
        onSuccess: () => {
          notify(m.is_read ? "Marqué comme non lu" : "Marqué comme lu", {
            type: "info",
          });
          refresh();
        },
      },
    );
  };

  const deleteMessage = async (m: EmailMessage) => {
    if (!window.confirm("Supprimer ce message du CRM ?")) return;
    const { error } = await getSupabaseClient()
      .from("email_messages")
      .delete()
      .eq("id", m.id);
    if (error) {
      notify(`Échec: ${error.message}`, { type: "error" });
      return;
    }
    notify("Message supprimé", { type: "success" });
    if (selectedId === m.id) setSelectedId(null);
    refresh();
  };

  const listItems = messages ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Mail"
        subtitle={`${listItems.length} message${listItems.length > 1 ? "s" : ""} · ${
          accounts?.length ?? 0
        } compte${(accounts?.length ?? 0) > 1 ? "s" : ""} synchronisé${
          (accounts?.length ?? 0) > 1 ? "s" : ""
        }`}
      >
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setComposeInitial(undefined);
              setComposeOpen(true);
            }}
          >
            <PenSquare className="h-4 w-4 mr-1" /> Nouveau message
          </Button>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/settings/email-accounts")}
            >
              <Settings2 className="h-4 w-4 mr-1" /> Comptes email
            </Button>
          )}
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[70vh]">
        {/* List panel */}
        <Card className="lg:col-span-1 p-3 flex flex-col overflow-hidden">
          <div className="flex flex-col gap-2 mb-3">
            <Select value={folder} onValueChange={setFolder}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FOLDER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tous les comptes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les comptes</SelectItem>
                {(accounts ?? []).map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Rechercher un sujet..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={onlyUnread}
                onChange={(e) => setOnlyUnread(e.target.checked)}
              />
              Non lus uniquement
            </label>
          </div>

          <div className="overflow-y-auto flex-1 -mx-1">
            {isPending ? (
              <p className="text-xs text-muted-foreground p-3">Chargement…</p>
            ) : listItems.length === 0 ? (
              <p className="text-xs text-muted-foreground p-3 italic">
                Aucun message avec ces filtres.
              </p>
            ) : (
              <ul className="flex flex-col">
                {listItems.map((m) => (
                  <EmailRow
                    key={m.id}
                    message={m}
                    salesById={salesById}
                    selected={selectedId === m.id}
                    onClick={() => handleSelect(m)}
                  />
                ))}
              </ul>
            )}
          </div>
        </Card>

        {/* Detail panel */}
        <Card className="lg:col-span-2 p-4 overflow-hidden flex flex-col">
          {selected ? (
            <EmailDetail
              message={selected}
              accounts={accounts ?? []}
              salesById={salesById}
              onToggleRead={() => toggleRead(selected)}
              onDelete={() => deleteMessage(selected)}
              onReply={(replyAll) => {
                setComposeInitial(buildReplyInitial(selected, replyAll));
                setComposeOpen(true);
              }}
              onForward={() => {
                setComposeInitial(buildForwardInitial(selected));
                setComposeOpen(true);
              }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-2">
              <Mail className="h-10 w-10" />
              <p className="text-sm">Sélectionne un message pour le lire</p>
            </div>
          )}
        </Card>
      </div>

      <ComposeEmailDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        initial={composeInitial}
      />
    </div>
  );
};

EmailInboxPage.path = "/mail";

function buildReplyInitial(m: EmailMessage, replyAll: boolean): ComposeInitial {
  const originalBody = m.text_body || stripHtml(m.html_body || "");
  const quoted = originalBody
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
  const dateStr = new Date(m.date).toLocaleString("fr-FR");
  const from = m.from_name ? `${m.from_name} <${m.from_email}>` : m.from_email;
  const body = `\n\n\nLe ${dateStr}, ${from} a écrit :\n${quoted}`;

  let cc = "";
  if (replyAll) {
    const ccList: string[] = [];
    const toArr = normalizeEmails(m.to_emails);
    const ccArr = normalizeEmails(m.cc_emails);
    ccList.push(...toArr, ...ccArr);
    cc = Array.from(new Set(ccList)).join(", ");
  }

  return {
    email_account_id: m.email_account_id,
    to: m.from_email,
    cc,
    subject: m.subject?.startsWith("Re:")
      ? m.subject
      : `Re: ${m.subject ?? ""}`,
    body,
    in_reply_to: m.message_id ?? undefined,
    references: m.message_id ?? undefined,
  };
}

function buildForwardInitial(m: EmailMessage): ComposeInitial {
  const originalBody = m.text_body || stripHtml(m.html_body || "");
  const dateStr = new Date(m.date).toLocaleString("fr-FR");
  const from = m.from_name ? `${m.from_name} <${m.from_email}>` : m.from_email;
  const toArr = normalizeEmails(m.to_emails).join(", ");
  const header = `\n\n\n---------- Message transféré ----------\nDe : ${from}\nDate : ${dateStr}\nSujet : ${m.subject ?? ""}\nÀ : ${toArr}\n\n`;
  return {
    email_account_id: m.email_account_id,
    to: "",
    subject: m.subject?.startsWith("Fwd:")
      ? m.subject
      : `Fwd: ${m.subject ?? ""}`,
    body: header + originalBody,
  };
}

function normalizeEmails(
  raw:
    | Array<{ email: string; name?: string }>
    | string[]
    | string
    | null
    | undefined,
): string[] {
  if (!raw) return [];
  if (typeof raw === "string") return [raw];
  return raw.map((r) => (typeof r === "string" ? r : r.email)).filter(Boolean);
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function EmailRow({
  message,
  salesById,
  selected,
  onClick,
}: {
  message: EmailMessage;
  salesById: Map<number | string, Sale>;
  selected: boolean;
  onClick: () => void;
}) {
  const sale = message.sales_id ? salesById.get(message.sales_id) : null;
  return (
    <li
      onClick={onClick}
      className={cn(
        "px-3 py-2 border-b cursor-pointer hover:bg-muted/50 transition-colors",
        selected && "bg-muted",
      )}
    >
      <div className="flex items-start gap-2">
        {message.is_read ? (
          <Circle className="h-2 w-2 mt-2 shrink-0 text-muted-foreground/30" />
        ) : (
          <Circle className="h-2 w-2 mt-2 shrink-0 fill-blue-500 text-blue-500" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p
              className={cn(
                "text-sm truncate flex-1",
                !message.is_read && "font-semibold",
              )}
            >
              {message.from_name || message.from_email || "—"}
            </p>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {formatDate(message.date)}
            </span>
          </div>
          <p
            className={cn(
              "text-sm truncate",
              !message.is_read && "font-medium",
            )}
          >
            {message.subject || "(sans objet)"}
          </p>
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
            {previewFromBody(message.text_body)}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            {sale && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                {sale.first_name} {sale.last_name?.charAt(0)}.
              </Badge>
            )}
            {message.folder && (
              <span className="text-[9px] text-muted-foreground">
                {message.folder}
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function EmailDetail({
  message,
  accounts,
  salesById,
  onToggleRead,
  onDelete,
  onReply,
  onForward,
}: {
  message: EmailMessage;
  accounts: EmailAccount[];
  salesById: Map<number | string, Sale>;
  onToggleRead: () => void;
  onDelete: () => void;
  onReply: (replyAll: boolean) => void;
  onForward: () => void;
}) {
  const account = accounts.find((a) => a.id === message.email_account_id);
  const sale = message.sales_id ? salesById.get(message.sales_id) : null;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-start justify-between gap-3 pb-3 border-b">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold leading-tight">
            {message.subject || "(sans objet)"}
          </h2>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
            <UserIcon className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">
              {message.from_name || message.from_email}
            </span>
            {message.from_name && (
              <span className="text-xs">&lt;{message.from_email}&gt;</span>
            )}
            <span>·</span>
            <span className="text-xs">
              {new Date(message.date).toLocaleString("fr-FR")}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            À : {extractRecipients(message.to_emails) || "—"}
          </div>
          {message.cc_emails && (
            <div className="text-xs text-muted-foreground">
              Cc : {extractRecipients(message.cc_emails)}
            </div>
          )}
          <div className="flex items-center gap-2 mt-2">
            {account && (
              <Badge variant="outline" className="text-[10px]">
                {account.email}
              </Badge>
            )}
            {sale && (
              <Badge variant="secondary" className="text-[10px]">
                {sale.first_name} {sale.last_name}
              </Badge>
            )}
            {message.folder && (
              <Badge variant="outline" className="text-[10px]">
                {message.folder}
              </Badge>
            )}
            {message.contact_id && (
              <Link
                to={`/contacts/${message.contact_id}/show`}
                className="text-[10px] text-blue-500 underline"
              >
                Fiche contact
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onReply(false)}
            className="h-8"
            title="Répondre"
          >
            <Reply className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onReply(true)}
            className="h-8"
            title="Répondre à tous"
          >
            <ReplyAll className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onForward}
            className="h-8"
            title="Transférer"
          >
            <Forward className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleRead}
            className="h-8"
            title={message.is_read ? "Marquer non lu" : "Marquer lu"}
          >
            <CheckCircle2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-8 text-destructive"
            title="Supprimer"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pt-4 text-sm">
        {message.html_body ? (
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: message.html_body }}
          />
        ) : (
          <pre className="whitespace-pre-wrap font-sans">
            {message.text_body || "(corps vide)"}
          </pre>
        )}
      </div>
    </div>
  );
}
