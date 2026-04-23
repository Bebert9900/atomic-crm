import { Import, Mail, Settings, User, Users } from "lucide-react";
import { CanAccess, useTranslate, useUserMenu } from "ra-core";
import { Link, NavLink } from "react-router";
import { RefreshButton } from "@/components/admin/refresh-button";
import { ThemeModeToggle } from "@/components/admin/theme-mode-toggle";
import { UserMenu } from "@/components/admin/user-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { ImportPage } from "../misc/ImportPage";
import { EmailAccountsPage } from "../settings/EmailAccountsPage";

const Header = () => {
  const { darkModeLogo, lightModeLogo, title } = useConfigurationContext();
  const translate = useTranslate();

  return (
    <header className="bg-secondary">
      <div className="px-4">
        <div className="flex min-h-12 items-center gap-4">
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2 text-secondary-foreground no-underline"
          >
            <img
              className="[.light_&]:hidden h-6"
              src={darkModeLogo}
              alt={title}
            />
            <img
              className="[.dark_&]:hidden h-6"
              src={lightModeLogo}
              alt={title}
            />
            <h1 className="text-xl font-semibold">{title}</h1>
          </Link>

          <nav className="min-w-0 flex-1" aria-label="Primary">
            <div className="flex overflow-x-auto">
              <NavigationTab
                label={translate("ra.page.dashboard")}
                to="/"
                end
              />
              <NavigationTab
                label={translate("resources.contacts.name", {
                  smart_count: 2,
                })}
                to="/contacts"
              />
              <NavigationTab
                label={translate("resources.companies.name", {
                  smart_count: 2,
                })}
                to="/companies"
              />
              <NavigationTab
                label={translate("resources.deals.name", {
                  smart_count: 2,
                })}
                to="/deals"
              />
              <NavigationTab label="Calendrier" to="/appointments" />
              <NavigationTab label="Dev" to="/dev_tasks" />
            </div>
          </nav>

          <div className="flex shrink-0 items-center">
            <ThemeModeToggle />
            <RefreshButton />
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
              <ImportFromJsonMenuItem />
            </UserMenu>
          </div>
        </div>
      </div>
    </header>
  );
};

const NavigationTab = ({
  label,
  to,
  end = false,
}: {
  label: string;
  to: string;
  end?: boolean;
}) => (
  <NavLink
    to={to}
    end={end}
    className={({ isActive }) =>
      `inline-flex shrink-0 border-b-2 px-6 py-3 text-sm font-medium transition-colors ${
        isActive
          ? "text-secondary-foreground border-secondary-foreground"
          : "text-secondary-foreground/70 border-transparent hover:text-secondary-foreground/80"
      }`
    }
  >
    {label}
  </NavLink>
);

const UsersMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<UsersMenu> must be used inside <UserMenu?");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/sales" className="flex items-center gap-2">
        <Users />
        {translate("resources.sales.name", { smart_count: 2 })}
      </Link>
    </DropdownMenuItem>
  );
};

const ProfileMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<ProfileMenu> must be used inside <UserMenu?");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/profile" className="flex items-center gap-2">
        <User />
        {translate("crm.profile.title")}
      </Link>
    </DropdownMenuItem>
  );
};

const SettingsMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<SettingsMenu> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/settings" className="flex items-center gap-2">
        <Settings />
        {translate("crm.settings.title")}
      </Link>
    </DropdownMenuItem>
  );
};

const EmailAccountsMenu = () => {
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<EmailAccountsMenu> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to={EmailAccountsPage.path} className="flex items-center gap-2">
        <Mail />
        Comptes email
      </Link>
    </DropdownMenuItem>
  );
};

const ImportFromJsonMenuItem = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<ImportFromJsonMenuItem> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to={ImportPage.path} className="flex items-center gap-2">
        <Import />
        {translate("crm.header.import_data")}
      </Link>
    </DropdownMenuItem>
  );
};
export default Header;
