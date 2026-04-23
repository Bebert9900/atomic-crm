import { useState } from "react";
import { useGetIdentity, useGetList, useNotify, useRefresh } from "ra-core";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { getSupabaseClient } from "../providers/supabase/supabase";
import type { EmailAccount, Sale } from "../types";

type FormValues = {
  email: string;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  password: string;
  sales_id: number | null;
  skip_tls_verify: boolean;
};

const emptyValues: FormValues = {
  email: "",
  imap_host: "",
  imap_port: 993,
  smtp_host: "",
  smtp_port: 465,
  password: "",
  sales_id: null,
  skip_tls_verify: false,
};

async function encryptPassword(plain: string) {
  const { data, error } = await getSupabaseClient().rpc(
    "encrypt_email_password",
    { plain_password: plain },
  );
  if (error) throw error;
  return data as string;
}

export const EmailAccountsPage = () => {
  const { identity } = useGetIdentity();
  const notify = useNotify();
  const refresh = useRefresh();
  const [editing, setEditing] = useState<EmailAccount | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const isAdmin = !!(identity as unknown as { administrator?: boolean })
    ?.administrator;

  const { data: accounts, isPending } = useGetList<EmailAccount>(
    "email_accounts",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "email", order: "ASC" },
    },
  );

  const { data: sales } = useGetList<Sale>("sales", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "last_name", order: "ASC" },
  });

  const openCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };

  const openEdit = (acc: EmailAccount) => {
    setEditing(acc);
    setSheetOpen(true);
  };

  const handleDelete = async (acc: EmailAccount) => {
    if (!confirm(`Supprimer le compte ${acc.email} ?`)) return;
    const { error } = await getSupabaseClient()
      .from("email_accounts")
      .delete()
      .eq("id", acc.id);
    if (error) {
      notify(`Erreur : ${error.message}`, { type: "error" });
      return;
    }
    notify("Compte supprimé", { type: "success" });
    refresh();
  };

  return (
    <div className="max-w-4xl mx-auto mt-4 p-4 space-y-6">
      <EmailAccountFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        account={editing}
        sales={sales || []}
        onSaved={() => {
          setSheetOpen(false);
          refresh();
        }}
      />

      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Comptes email</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Boîtes IMAP/SMTP synchronisées par le CRM. Le mot de passe est
            chiffré avant d'être stocké.
            {!isAdmin
              ? " Seul un administrateur peut modifier la configuration."
              : ""}
          </p>
        </div>
        {isAdmin ? (
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" /> Ajouter
          </Button>
        ) : null}
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : !accounts || accounts.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground text-center">
            Aucun compte email configuré. Ajoutez-en un pour démarrer la
            synchronisation.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {accounts.map((acc) => {
              const sale = sales?.find((s) => s.id === acc.sales_id);
              return (
                <div
                  key={acc.id}
                  className="flex items-center gap-4 p-4 hover:bg-muted/30"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{acc.email}</p>
                    <p className="text-xs text-muted-foreground">
                      IMAP: {acc.imap_host}:{acc.imap_port}
                      {acc.smtp_host
                        ? ` · SMTP: ${acc.smtp_host}:${acc.smtp_port}`
                        : ""}
                      {sale
                        ? ` · Commercial: ${sale.first_name} ${sale.last_name}`
                        : ""}
                      {!acc.is_active ? " · désactivé" : ""}
                    </p>
                  </div>
                  {isAdmin && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(acc)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(acc)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

EmailAccountsPage.path = "/settings/email-accounts";

interface FormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: EmailAccount | null;
  sales: Sale[];
  onSaved: () => void;
}

function EmailAccountFormSheet({
  open,
  onOpenChange,
  account,
  sales,
  onSaved,
}: FormSheetProps) {
  const notify = useNotify();
  const [values, setValues] = useState<FormValues>(emptyValues);
  const [saving, setSaving] = useState(false);

  // Sync form values when opening for edit/create
  const accountKey = account?.id ?? "new";
  const [lastKey, setLastKey] = useState<string | number>("new");
  if (open && lastKey !== accountKey) {
    setLastKey(accountKey);
    setValues(
      account
        ? {
            email: account.email,
            imap_host: account.imap_host,
            imap_port: account.imap_port,
            smtp_host: account.smtp_host ?? "",
            smtp_port: account.smtp_port,
            password: "",
            sales_id: (account.sales_id as number | null) ?? null,
            skip_tls_verify: account.skip_tls_verify,
          }
        : emptyValues,
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const supabase = getSupabaseClient();
      const payload: Record<string, unknown> = {
        email: values.email.trim().toLowerCase(),
        imap_host: values.imap_host.trim(),
        imap_port: values.imap_port,
        smtp_host: values.smtp_host.trim() || null,
        smtp_port: values.smtp_port,
        sales_id: values.sales_id,
        skip_tls_verify: values.skip_tls_verify,
        is_active: true,
      };

      // Only encrypt + set password when provided (empty on edit means "keep current")
      if (values.password) {
        payload.encrypted_password = await encryptPassword(values.password);
      } else if (!account) {
        notify("Le mot de passe est requis", { type: "error" });
        setSaving(false);
        return;
      }

      const { error } = account
        ? await supabase
            .from("email_accounts")
            .update(payload)
            .eq("id", account.id)
        : await supabase.from("email_accounts").insert(payload);

      if (error) throw error;
      notify(account ? "Compte mis à jour" : "Compte ajouté", {
        type: "success",
      });
      onSaved();
    } catch (err) {
      notify(`Erreur : ${err instanceof Error ? err.message : String(err)}`, {
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {account ? "Modifier le compte" : "Nouveau compte email"}
          </SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4 p-4">
          <div className="space-y-1">
            <Label htmlFor="email">Adresse email</Label>
            <Input
              id="email"
              type="email"
              value={values.email}
              onChange={(e) => setValues({ ...values, email: e.target.value })}
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="password">
              Mot de passe {account ? "(laisser vide pour conserver)" : ""}
            </Label>
            <Input
              id="password"
              type="password"
              value={values.password}
              onChange={(e) =>
                setValues({ ...values, password: e.target.value })
              }
              autoComplete="new-password"
              required={!account}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="imap_host">Serveur IMAP</Label>
              <Input
                id="imap_host"
                value={values.imap_host}
                onChange={(e) =>
                  setValues({ ...values, imap_host: e.target.value })
                }
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="imap_port">Port</Label>
              <Input
                id="imap_port"
                type="number"
                value={values.imap_port}
                onChange={(e) =>
                  setValues({
                    ...values,
                    imap_port: Number(e.target.value),
                  })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="smtp_host">Serveur SMTP (optionnel)</Label>
              <Input
                id="smtp_host"
                value={values.smtp_host}
                onChange={(e) =>
                  setValues({ ...values, smtp_host: e.target.value })
                }
                placeholder="(même que IMAP par défaut)"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="smtp_port">Port</Label>
              <Input
                id="smtp_port"
                type="number"
                value={values.smtp_port}
                onChange={(e) =>
                  setValues({
                    ...values,
                    smtp_port: Number(e.target.value),
                  })
                }
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="sales_id">Commercial associé</Label>
            <select
              id="sales_id"
              className="w-full h-9 border rounded-md px-2 bg-background"
              value={values.sales_id ?? ""}
              onChange={(e) =>
                setValues({
                  ...values,
                  sales_id: e.target.value ? Number(e.target.value) : null,
                })
              }
            >
              <option value="">(aucun — boîte partagée)</option>
              {sales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.first_name} {s.last_name}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.skip_tls_verify}
              onChange={(e) =>
                setValues({ ...values, skip_tls_verify: e.target.checked })
              }
            />
            Ne pas vérifier le certificat TLS (certificats auto-signés
            uniquement)
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
