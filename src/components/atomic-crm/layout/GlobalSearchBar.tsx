import { useCallback, useEffect, useState } from "react";
import { useGetList, useTranslate } from "ra-core";
import { useNavigate } from "react-router";
import { Building2, Search, User, Briefcase } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import type { Company, Contact, Deal } from "../types";

export const GlobalSearchBar = () => {
  const [open, setOpen] = useState(false);
  const translate = useTranslate();

  // ⌘K shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors w-72"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left truncate">
          {translate("crm.search.placeholder", {
            _: "Rechercher contact, entreprise, affaire...",
          })}
        </span>
        <kbd className="pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={translate("crm.search.title", { _: "Recherche globale" })}
        description={translate("crm.search.description", {
          _: "Rechercher un contact, une entreprise ou une affaire",
        })}
      >
        <CommandInput
          placeholder={translate("crm.search.placeholder", {
            _: "Rechercher contact, entreprise, affaire...",
          })}
        />
        <CommandList>
          <CommandEmpty>
            {translate("crm.search.empty", { _: "Aucun résultat." })}
          </CommandEmpty>
          <SearchResults onSelect={() => setOpen(false)} />
        </CommandList>
      </CommandDialog>
    </>
  );
};

function SearchResults({ onSelect }: { onSelect: () => void }) {
  const navigate = useNavigate();
  const translate = useTranslate();

  const { data: contacts } = useGetList<Contact>("contacts", {
    pagination: { page: 1, perPage: 8 },
    sort: { field: "last_seen", order: "DESC" },
  });

  const { data: companies } = useGetList<Company>("companies", {
    pagination: { page: 1, perPage: 5 },
    sort: { field: "created_at", order: "DESC" },
  });

  const { data: deals } = useGetList<Deal>("deals", {
    pagination: { page: 1, perPage: 5 },
    sort: { field: "updated_at", order: "DESC" },
  });

  const go = useCallback(
    (path: string) => {
      navigate(path);
      onSelect();
    },
    [navigate, onSelect],
  );

  return (
    <>
      {contacts && contacts.length > 0 && (
        <CommandGroup
          heading={translate("resources.contacts.name", { smart_count: 2 })}
        >
          {contacts.map((c) => (
            <CommandItem
              key={`contact-${c.id}`}
              onSelect={() => go(`/contacts/${c.id}/show`)}
              value={`${c.first_name} ${c.last_name} ${c.company_name ?? ""}`}
            >
              <User className="h-4 w-4" />
              <span>
                {c.first_name} {c.last_name}
              </span>
              {c.company_name && (
                <span className="text-muted-foreground text-xs ml-1">
                  — {c.company_name}
                </span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      )}

      {companies && companies.length > 0 && (
        <CommandGroup
          heading={translate("resources.companies.name", { smart_count: 2 })}
        >
          {companies.map((c) => (
            <CommandItem
              key={`company-${c.id}`}
              onSelect={() => go(`/companies/${c.id}/show`)}
              value={c.name}
            >
              <Building2 className="h-4 w-4" />
              <span>{c.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}

      {deals && deals.length > 0 && (
        <CommandGroup
          heading={translate("resources.deals.name", { smart_count: 2 })}
        >
          {deals.map((d) => (
            <CommandItem
              key={`deal-${d.id}`}
              onSelect={() => go(`/deals/${d.id}/show`)}
              value={d.name}
            >
              <Briefcase className="h-4 w-4" />
              <span>{d.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
    </>
  );
}
