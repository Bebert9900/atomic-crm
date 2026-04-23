import { useCallback, useEffect, useRef, useState } from "react";
import { useGetIdentity, useGetList, useNotify, useRefresh } from "ra-core";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Loader2, Paperclip, X } from "lucide-react";

import type { EmailAccount } from "../types";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { ATTACHMENTS_BUCKET } from "../providers/commons/attachments";

export interface ComposeInitial {
  email_account_id?: number | null;
  to?: string;
  cc?: string;
  subject?: string;
  body?: string;
  in_reply_to?: string;
  references?: string;
}

interface Attachment {
  storage_path: string;
  filename: string;
  size: number;
}

export function ComposeEmailDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: ComposeInitial;
}) {
  const notify = useNotify();
  const refresh = useRefresh();
  const { identity } = useGetIdentity();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: accounts } = useGetList<EmailAccount>("email_accounts", {
    pagination: { page: 1, perPage: 50 },
    sort: { field: "email", order: "ASC" },
  });

  const [accountId, setAccountId] = useState<string>("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);

  // Initialize when opening
  useEffect(() => {
    if (!open) return;
    const preferred =
      initial?.email_account_id ??
      accounts?.find((a) => a.sales_id === (identity?.id as number))?.id ??
      accounts?.[0]?.id;
    setAccountId(preferred ? String(preferred) : "");
    setTo(initial?.to ?? "");
    setCc(initial?.cc ?? "");
    setShowCc(!!initial?.cc);
    setBcc("");
    setSubject(initial?.subject ?? "");
    setBody(initial?.body ?? "");
    setAttachments([]);
  }, [open, initial, accounts, identity]);

  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setUploading(true);
      try {
        const sb = getSupabaseClient();
        for (const file of Array.from(files)) {
          const path = `outgoing_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
          const { error } = await sb.storage
            .from(ATTACHMENTS_BUCKET)
            .upload(path, file, { contentType: file.type || undefined });
          if (error) {
            notify(`Upload échoué: ${error.message}`, { type: "error" });
            continue;
          }
          setAttachments((prev) => [
            ...prev,
            { storage_path: path, filename: file.name, size: file.size },
          ]);
        }
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [notify],
  );

  const removeAttachment = (path: string) =>
    setAttachments((prev) => prev.filter((a) => a.storage_path !== path));

  const parseList = (raw: string) =>
    raw
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

  const handleSend = useCallback(async () => {
    if (!accountId) {
      notify("Choisis le compte d'expédition", { type: "error" });
      return;
    }
    const toList = parseList(to);
    if (!toList.length) {
      notify("Au moins un destinataire requis", { type: "error" });
      return;
    }
    if (!subject.trim()) {
      notify("Le sujet est requis", { type: "error" });
      return;
    }
    setSending(true);
    try {
      const { data, error } = await getSupabaseClient().functions.invoke(
        "send_email_raw",
        {
          method: "POST",
          body: {
            email_account_id: Number(accountId),
            to: toList,
            cc: parseList(cc),
            bcc: parseList(bcc),
            subject: subject.trim(),
            text_body: body,
            attachments,
            in_reply_to: initial?.in_reply_to,
            references: initial?.references,
          },
        },
      );
      if (error) {
        let detail = error.message;
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx && typeof ctx.text === "function") {
            const txt = await ctx.clone().text();
            if (txt) {
              try {
                detail = JSON.parse(txt).message ?? txt;
              } catch {
                detail = txt;
              }
            }
          }
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      notify("Email envoyé", { type: "success" });
      refresh();
      onOpenChange(false);
    } catch (e) {
      notify(`Envoi échoué: ${e instanceof Error ? e.message : String(e)}`, {
        type: "error",
      });
    } finally {
      setSending(false);
    }
  }, [
    accountId,
    to,
    cc,
    bcc,
    subject,
    body,
    attachments,
    initial,
    notify,
    refresh,
    onOpenChange,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouveau message</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>De</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un compte" />
              </SelectTrigger>
              <SelectContent>
                {(accounts ?? []).map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>À</Label>
              {!showCc && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:underline"
                  onClick={() => setShowCc(true)}
                >
                  Ajouter Cc / Bcc
                </button>
              )}
            </div>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="destinataire@exemple.com, autre@exemple.com"
            />
          </div>
          {showCc && (
            <>
              <div>
                <Label>Cc</Label>
                <Input value={cc} onChange={(e) => setCc(e.target.value)} />
              </div>
              <div>
                <Label>Bcc</Label>
                <Input value={bcc} onChange={(e) => setBcc(e.target.value)} />
              </div>
            </>
          )}
          <div>
            <Label>Sujet</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div>
            <Label>Message</Label>
            <Textarea
              rows={12}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Ton message..."
              className="font-mono text-sm"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Paperclip className="h-3.5 w-3.5 mr-1" />
                )}
                Pièce jointe
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
              {attachments.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {attachments.length} fichier
                  {attachments.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
            {attachments.length > 0 && (
              <ul className="mt-2 space-y-1">
                {attachments.map((a) => (
                  <li
                    key={a.storage_path}
                    className="flex items-center gap-2 text-xs border rounded px-2 py-1"
                  >
                    <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{a.filename}</span>
                    <span className="text-muted-foreground">
                      {(a.size / 1024).toFixed(1)} Ko
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.storage_path)}
                      className="text-muted-foreground hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Annuler
          </Button>
          <Button onClick={handleSend} disabled={sending || uploading}>
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Envoi...
              </>
            ) : (
              "Envoyer"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
