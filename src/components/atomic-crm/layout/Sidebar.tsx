import {
  BarChart3,
  Briefcase,
  Building2,
  CalendarDays,
  CheckSquare,
  Mail,
  Settings,
  Sparkles,
  Sun,
  Users,
} from "lucide-react";
import { EmailInboxPage } from "../emails/EmailInboxPage";
import { CanAccess, useGetIdentity, useGetList, useTranslate } from "ra-core";
import { Link, matchPath, useLocation } from "react-router";
import { cn } from "@/lib/utils";
import { ThemeModeToggle } from "@/components/admin/theme-mode-toggle";

import { useConfigurationContext } from "../root/ConfigurationContext";

export const Sidebar = () => {
  const { darkModeLogo, lightModeLogo, title } = useConfigurationContext();
  const translate = useTranslate();
  const location = useLocation();
  const { identity } = useGetIdentity();

  // Fetch counts for badges
  const { total: totalContacts } = useGetList("contacts", {
    pagination: { page: 1, perPage: 1 },
  });
  const { total: totalCompanies } = useGetList("companies", {
    pagination: { page: 1, perPage: 1 },
  });
  const { total: totalDeals } = useGetList("deals", {
    pagination: { page: 1, perPage: 1 },
  });
  const { total: totalTasks } = useGetList("tasks", {
    pagination: { page: 1, perPage: 1 },
    filter: { "done_date@is": "null" },
  });

  const currentPath = getCurrentPath(location.pathname);

  return (
    <aside className="fixed top-0 left-0 z-40 flex h-screen w-56 flex-col bg-secondary border-r border-border">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4">
        <Link
          to="/"
          className="flex items-center gap-2 text-secondary-foreground no-underline"
        >
          <img
            className="[.light_&]:hidden h-7"
            src={darkModeLogo}
            alt={title}
          />
          <img
            className="[.dark_&]:hidden h-7"
            src={lightModeLogo}
            alt={title}
          />
          <div className="flex flex-col">
            <span className="text-base font-bold leading-tight">{title}</span>
            <span className="text-[10px] text-muted-foreground leading-tight">
              CRM · Atomic
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {/* PILOTAGE section */}
        <SectionLabel>
          {translate("crm.sidebar.pilotage", { _: "Pilotage" })}
        </SectionLabel>
        <NavItem
          to="/"
          icon={BarChart3}
          label={translate("ra.page.dashboard")}
          isActive={currentPath === "/"}
        />
        <NavItem
          to="/my-day"
          icon={Sun}
          label="Ma journée"
          isActive={currentPath === "/my-day"}
        />
        <NavItem
          to={EmailInboxPage.path}
          icon={Mail}
          label="Mail"
          isActive={currentPath.startsWith("/mail")}
        />
        <NavItem
          to="/tasks"
          icon={CheckSquare}
          label={translate("crm.sidebar.my_tasks", { _: "Mes tâches" })}
          isActive={currentPath === "/tasks"}
          badge={totalTasks}
        />
        <NavItem
          to="/appointments"
          icon={CalendarDays}
          label={translate("crm.sidebar.calendar", { _: "Calendrier" })}
          isActive={currentPath === "/appointments"}
        />

        {/* VENTES section */}
        <SectionLabel className="mt-4">
          {translate("crm.sidebar.sales", { _: "Ventes" })}
        </SectionLabel>
        <NavItem
          to="/deals"
          icon={Briefcase}
          label={translate("resources.deals.name", { smart_count: 2 })}
          isActive={currentPath === "/deals"}
          badge={totalDeals}
        />
        <NavItem
          to="/contacts"
          icon={Users}
          label={translate("resources.contacts.name", { smart_count: 2 })}
          isActive={currentPath === "/contacts"}
          badge={totalContacts}
        />
        <NavItem
          to="/companies"
          icon={Building2}
          label={translate("resources.companies.name", { smart_count: 2 })}
          isActive={currentPath === "/companies"}
          badge={totalCompanies}
        />

        {/* ÉQUIPE section */}
        <SectionLabel className="mt-4">Équipe</SectionLabel>
        <NavItem
          to="/dev_tasks"
          icon={Sparkles}
          label="Dev"
          isActive={currentPath === "/dev_tasks"}
        />
      </nav>

      {/* Bottom: user profile + settings */}
      <div className="border-t border-border px-3 py-3">
        <div className="flex items-center gap-2">
          <UserAvatar identity={identity} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate leading-tight">
              {identity?.fullName ?? ""}
            </p>
            <p className="text-[11px] text-muted-foreground truncate leading-tight">
              {identity?.email ?? ""}
            </p>
          </div>
          <div className="flex items-center gap-0.5">
            <ThemeModeToggle />
            <CanAccess resource="configuration" action="edit">
              <Link
                to="/settings"
                className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Settings className="h-4 w-4" />
              </Link>
            </CanAccess>
          </div>
        </div>
      </div>
    </aside>
  );
};

/* ---------- sub-components ---------- */

function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

function NavItem({
  to,
  icon: Icon,
  label,
  isActive,
  badge,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  isActive: boolean;
  badge?: number | undefined;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors no-underline",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {badge != null && badge > 0 && (
        <span
          className={cn(
            "ml-auto inline-flex items-center justify-center rounded-full px-1.5 py-0 text-[11px] font-medium tabular-nums",
            isActive
              ? "bg-primary/20 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

function UserAvatar({
  identity,
}: {
  identity?: { fullName?: string; avatar?: string } | null;
}) {
  const initials = (identity?.fullName ?? "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (identity?.avatar) {
    return (
      <img
        src={identity.avatar}
        alt={identity.fullName}
        className="h-8 w-8 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold shrink-0">
      {initials}
    </div>
  );
}

/* ---------- helpers ---------- */

function getCurrentPath(pathname: string): string | false {
  if (matchPath("/", pathname)) return "/";
  if (matchPath("/contacts/*", pathname)) return "/contacts";
  if (matchPath("/companies/*", pathname)) return "/companies";
  if (matchPath("/deals/*", pathname)) return "/deals";
  if (matchPath("/appointments/*", pathname)) return "/appointments";
  if (matchPath("/tasks/*", pathname)) return "/tasks";
  if (matchPath("/settings/*", pathname)) return "/settings";
  return false;
}
