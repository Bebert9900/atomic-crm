import { useState } from "react";
import { useTranslate } from "ra-core";
import { useNavigate } from "react-router";
import { Building2, Briefcase, Plus, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { ContactCreateSheet } from "../contacts/ContactCreateSheet";

export const CreateDropdown = () => {
  const translate = useTranslate();
  const navigate = useNavigate();
  const [contactCreateOpen, setContactCreateOpen] = useState(false);

  return (
    <>
      <ContactCreateSheet
        open={contactCreateOpen}
        onOpenChange={setContactCreateOpen}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            {translate("crm.action.new", { _: "Nouveau" })}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            className="gap-2"
            onSelect={() => setContactCreateOpen(true)}
          >
            <User className="h-4 w-4" />
            {translate("resources.contacts.forcedCaseName", {
              _: "Contact",
            })}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2"
            onSelect={() => navigate("/companies/create")}
          >
            <Building2 className="h-4 w-4" />
            {translate("resources.companies.forcedCaseName", {
              _: "Entreprise",
            })}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2"
            onSelect={() => navigate("/deals/create")}
          >
            <Briefcase className="h-4 w-4" />
            {translate("resources.deals.forcedCaseName", {
              _: "Affaire",
            })}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
