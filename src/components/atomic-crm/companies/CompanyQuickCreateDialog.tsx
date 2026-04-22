import { useEffect, useRef, useState } from "react";
import { useCreate, useGetIdentity, useNotify } from "ra-core";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Company } from "../types";

export interface CompanyQuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  onCreated: (company: Company) => void;
  onCancel: () => void;
}

type FormState = {
  name: string;
  website: string;
  phone_number: string;
  address: string;
  city: string;
  zipcode: string;
  country: string;
  sector: string;
};

const emptyState: FormState = {
  name: "",
  website: "",
  phone_number: "",
  address: "",
  city: "",
  zipcode: "",
  country: "",
  sector: "",
};

export const CompanyQuickCreateDialog = ({
  open,
  onOpenChange,
  initialName = "",
  onCreated,
  onCancel,
}: CompanyQuickCreateDialogProps) => {
  const { companySectors } = useConfigurationContext();
  const { identity } = useGetIdentity();
  const notify = useNotify();
  const [create, { isPending }] = useCreate();
  const [state, setState] = useState<FormState>(emptyState);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setState({ ...emptyState, name: initialName });
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [open, initialName]);

  const update =
    (key: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setState((s) => ({ ...s, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = state.name.trim();
    if (!name) return;
    try {
      const company = await create<Company>(
        "companies",
        {
          data: {
            name,
            website: state.website.trim() || undefined,
            phone_number: state.phone_number.trim() || undefined,
            address: state.address.trim() || undefined,
            city: state.city.trim() || undefined,
            zipcode: state.zipcode.trim() || undefined,
            country: state.country.trim() || undefined,
            sector: state.sector || undefined,
            sales_id: identity?.id,
            created_at: new Date().toISOString(),
          },
        },
        { returnPromise: true },
      );
      onCreated(company as Company);
      onOpenChange(false);
    } catch (error) {
      notify(
        typeof error === "string"
          ? error
          : (error as Error)?.message || "Erreur lors de la création",
        { type: "error" },
      );
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) onCancel();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Nouvelle entreprise</DialogTitle>
          <DialogDescription>
            Ces informations seront rattachées au contact. Tu pourras les
            compléter plus tard depuis la fiche entreprise.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="qc-name" className="text-xs">
              Nom *
            </Label>
            <Input
              id="qc-name"
              ref={nameInputRef}
              value={state.name}
              onChange={update("name")}
              required
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="qc-website" className="text-xs">
                Site web
              </Label>
              <Input
                id="qc-website"
                value={state.website}
                onChange={update("website")}
                placeholder="https://…"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="qc-phone" className="text-xs">
                Téléphone
              </Label>
              <Input
                id="qc-phone"
                value={state.phone_number}
                onChange={update("phone_number")}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="qc-address" className="text-xs">
              Adresse
            </Label>
            <Input
              id="qc-address"
              value={state.address}
              onChange={update("address")}
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="qc-zipcode" className="text-xs">
                Code postal
              </Label>
              <Input
                id="qc-zipcode"
                value={state.zipcode}
                onChange={update("zipcode")}
                className="mt-1"
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="qc-city" className="text-xs">
                Ville
              </Label>
              <Input
                id="qc-city"
                value={state.city}
                onChange={update("city")}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="qc-country" className="text-xs">
                Pays
              </Label>
              <Input
                id="qc-country"
                value={state.country}
                onChange={update("country")}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="qc-sector" className="text-xs">
                Secteur
              </Label>
              <select
                id="qc-sector"
                value={state.sector}
                onChange={update("sector")}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">—</option>
                {companySectors?.map((s) => {
                  const value = typeof s === "string" ? s : s.value;
                  const label = typeof s === "string" ? s : s.label;
                  return (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                onCancel();
                onOpenChange(false);
              }}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={isPending || !state.name.trim()}>
              Créer l'entreprise
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
