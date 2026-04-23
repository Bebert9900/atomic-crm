import { Plus, RotateCw, Search } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useRefresh } from "ra-core";

const ROUTE_META: Record<
  string,
  { title: string; sub: string; createTo?: string; createLabel?: string }
> = {
  "/": { title: "Tableau de bord", sub: "Vue d'ensemble de ton activité" },
  "/my-day": {
    title: "Ma journée",
    sub: "Priorités, timeline et deals à pousser",
  },
  "/contacts": {
    title: "Contacts",
    sub: "Gérer et suivre tes contacts",
    createTo: "/contacts/create",
    createLabel: "Nouveau contact",
  },
  "/companies": {
    title: "Entreprises",
    sub: "Trie, filtre ou regroupe tes entreprises",
    createTo: "/companies/create",
    createLabel: "Nouvelle entreprise",
  },
  "/deals": {
    title: "Affaires",
    sub: "Pipeline commercial",
    createTo: "/deals/create",
    createLabel: "Nouvelle affaire",
  },
  "/appointments": {
    title: "Calendrier",
    sub: "Vue du mois",
    createTo: "/appointments/create",
    createLabel: "Nouveau RDV",
  },
  "/dev_tasks": {
    title: "Dev",
    sub: "Roadmap produit liée au CRM",
    createTo: "/dev_tasks/create",
    createLabel: "Nouveau ticket",
  },
  "/settings/email-accounts": {
    title: "Boite de réception",
    sub: "Emails non lus",
  },
  "/settings": { title: "Paramètres", sub: "" },
  "/tasks": { title: "Mes tâches", sub: "Toutes tes tâches en cours" },
  "/profile": { title: "Profil", sub: "" },
  "/sales": {
    title: "Équipe",
    sub: "",
    createTo: "/sales/create",
    createLabel: "Nouveau membre",
  },
};

export function FabrikTopBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const refresh = useRefresh();
  const [query, setQuery] = useState("");

  const meta =
    ROUTE_META[pathname] ??
    ROUTE_META["/" + pathname.split("/")[1]] ??
    ROUTE_META["/"];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const filter = encodeURIComponent(JSON.stringify({ q }));
    navigate(`/contacts?filter=${filter}`);
  };

  return (
    <header className="h-14 shrink-0 border-b border-border bg-background/80 backdrop-blur-sm flex items-center gap-3 px-4 md:px-6 sticky top-0 z-10">
      <div className="flex-1 min-w-0">
        <h1 className="text-[15px] font-semibold leading-tight truncate">
          {meta.title}
        </h1>
        {meta.sub && (
          <div className="text-[11.5px] text-muted-foreground truncate">
            {meta.sub}
          </div>
        )}
      </div>

      <form
        onSubmit={handleSearch}
        className="hidden md:flex items-center gap-2 h-9 px-2.5 w-[280px] rounded-lg bg-muted/60 border border-border focus-within:border-[var(--accent-solid)]/40"
      >
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un contact…"
          className="flex-1 bg-transparent outline-none text-[12.5px] placeholder:text-muted-foreground"
          aria-label="Rechercher"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="text-[10.5px] text-muted-foreground hover:text-foreground px-1.5"
            aria-label="Effacer"
          >
            ✕
          </button>
        ) : (
          <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-background border border-border text-muted-foreground">
            ⏎
          </span>
        )}
      </form>

      <button
        type="button"
        onClick={() => refresh()}
        className="hidden sm:inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60"
        aria-label="Rafraîchir"
      >
        <RotateCw className="size-4" />
      </button>

      {meta.createTo && (
        <button
          type="button"
          onClick={() => navigate(meta.createTo!)}
          className="h-9 px-3 rounded-lg text-[12.5px] font-medium inline-flex items-center gap-1.5 text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--accent-solid)" }}
        >
          <Plus className="size-4" /> {meta.createLabel ?? "Nouveau"}
        </button>
      )}
    </header>
  );
}
