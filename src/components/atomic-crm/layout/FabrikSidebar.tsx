import {
  Bot,
  Building2,
  Calendar,
  CheckSquare,
  Home,
  Import,
  Mail,
  Settings,
  Sparkles,
  Sun,
  User,
  Users,
  Zap,
} from "lucide-react";
import { CanAccess, useGetIdentity, useGetList, useTranslate } from "ra-core";
import { NavLink } from "react-router";

import { ThemeModeToggle } from "@/components/admin/theme-mode-toggle";
import { UserMenu } from "@/components/admin/user-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Link } from "react-router";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { ImportPage } from "../misc/ImportPage";
import { EmailAccountsPage } from "../settings/EmailAccountsPage";
import { useUserMenu } from "ra-core";

function NavItem({
  icon,
  label,
  to,
  end = false,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  to: string;
  end?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `w-full flex items-center gap-2.5 px-2.5 h-9 rounded-md text-[13px] transition-colors no-underline ${
          isActive
            ? "bg-[color-mix(in_oklch,var(--accent-solid)_12%,transparent)] text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`size-4 shrink-0 ${isActive ? "text-[var(--accent-solid)]" : ""}`}
          >
            {icon}
          </span>
          <span className="flex-1 text-left">{label}</span>
          {badge != null && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-md tabular-nums ${
                isActive
                  ? "bg-[var(--accent-solid)]/20 text-[var(--accent-solid)]"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

function SectionLabel({
  children,
  first = false,
}: {
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <div
      className={`px-2 mb-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground/70 ${first ? "" : "mt-4"}`}
    >
      {children}
    </div>
  );
}

const ProfileMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) return null;
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/profile" className="flex items-center gap-2">
        <User className="size-4" />
        {translate("crm.profile.title")}
      </Link>
    </DropdownMenuItem>
  );
};

const UsersMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) return null;
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/sales" className="flex items-center gap-2">
        <Users className="size-4" />
        {translate("resources.sales.name", { smart_count: 2 })}
      </Link>
    </DropdownMenuItem>
  );
};

const SettingsMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) return null;
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/settings" className="flex items-center gap-2">
        <Settings className="size-4" />
        {translate("crm.settings.title")}
      </Link>
    </DropdownMenuItem>
  );
};

const EmailAccountsMenu = () => {
  const userMenuContext = useUserMenu();
  if (!userMenuContext) return null;
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to={EmailAccountsPage.path} className="flex items-center gap-2">
        <Mail className="size-4" />
        Comptes email
      </Link>
    </DropdownMenuItem>
  );
};

const ImportMenuItem = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) return null;
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to={ImportPage.path} className="flex items-center gap-2">
        <Import className="size-4" />
        {translate("crm.header.import_data")}
      </Link>
    </DropdownMenuItem>
  );
};

export function FabrikSidebar() {
  const { title } = useConfigurationContext();
  const { identity } = useGetIdentity();
  const translate = useTranslate();

  const { total: unreadCount } = useGetList("unread_emails_summary", {
    pagination: { page: 1, perPage: 1 },
  });

  return (
    <aside className="hidden md:flex w-[216px] shrink-0 flex-col bg-sidebar border-r border-border h-full overflow-hidden">
      {/* Logo */}
      <div className="h-14 flex items-center px-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 px-1">
          <div className="size-7 rounded-lg bg-[var(--accent-solid)] grid place-items-center">
            <span className="text-[13px] font-bold text-white">F</span>
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold tracking-wide">
              {title}
            </div>
            <div className="text-[10px] text-muted-foreground">
              CRM · Atomic
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        <SectionLabel first>Pilotage</SectionLabel>
        <NavItem
          icon={<Home className="size-4" />}
          label={translate("ra.page.dashboard")}
          to="/"
          end
        />
        <NavItem
          icon={<Sun className="size-4" />}
          label="Ma journée"
          to="/my-day"
        />
        <NavItem
          icon={<Mail className="size-4" />}
          label="Mail"
          to={EmailAccountsPage.path}
          badge={unreadCount && unreadCount > 0 ? unreadCount : undefined}
        />
        <NavItem
          icon={<CheckSquare className="size-4" />}
          label="Mes tâches"
          to="/tasks"
        />
        <NavItem
          icon={<Calendar className="size-4" />}
          label="Calendrier"
          to="/appointments"
        />

        <SectionLabel>Ventes</SectionLabel>
        <NavItem
          icon={<Zap className="size-4" />}
          label={translate("resources.deals.name", { smart_count: 2 })}
          to="/deals"
        />
        <NavItem
          icon={<Users className="size-4" />}
          label={translate("resources.contacts.name", { smart_count: 2 })}
          to="/contacts"
        />
        <NavItem
          icon={<Building2 className="size-4" />}
          label={translate("resources.companies.name", { smart_count: 2 })}
          to="/companies"
        />

        <SectionLabel>Équipe</SectionLabel>
        <NavItem
          icon={<Sparkles className="size-4" />}
          label="Dev"
          to="/dev_tasks"
        />
        <NavItem icon={<Bot className="size-4" />} label="Agent" to="/agent" />
      </nav>

      {/* User footer */}
      <div className="p-3 border-t border-border shrink-0">
        <div className="flex items-center gap-2 px-1">
          <UserMenu>
            <ProfileMenu />
            <CanAccess resource="sales" action="list">
              <UsersMenu />
            </CanAccess>
            <CanAccess resource="configuration" action="edit">
              <SettingsMenu />
            </CanAccess>
            <CanAccess resource="email_accounts" action="list">
              <EmailAccountsMenu />
            </CanAccess>
            <ImportMenuItem />
          </UserMenu>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] truncate">
              {identity?.fullName ??
                `${identity?.first_name ?? ""} ${identity?.last_name ?? ""}`.trim()}
            </div>
            <div className="text-[10.5px] text-muted-foreground truncate">
              {identity?.email ?? ""}
            </div>
          </div>
          <ThemeModeToggle />
        </div>
      </div>
    </aside>
  );
}
