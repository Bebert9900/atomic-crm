import { ReferenceManyField } from "@/components/admin/reference-many-field";
import { SortButton } from "@/components/admin/sort-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserPlus } from "lucide-react";
import {
  RecordContextProvider,
  ShowBase,
  useListContext,
  useLocaleState,
  useRecordContext,
  useShowContext,
  useTranslate,
} from "ra-core";
import {
  Link,
  Link as RouterLink,
  useLocation,
  useMatch,
  useNavigate,
} from "react-router-dom";

import { useIsMobile } from "@/hooks/use-mobile";
import { ActivityLog } from "../activity/ActivityLog";
import { Avatar } from "../contacts/Avatar";
import { TagsList } from "../contacts/TagsList";
import { findDealLabel } from "../deals/dealUtils";
import { MobileContent } from "../layout/MobileContent";
import MobileHeader from "../layout/MobileHeader";
import { MobileBackButton } from "../misc/MobileBackButton";
import { formatRelativeDate } from "../misc/RelativeDate";
import { Status } from "../misc/Status";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Company, Contact, Deal } from "../types";
import {
  AdditionalInfo,
  AddressInfo,
  CompanyAside,
  CompanyInfo,
  ContextInfo,
} from "./CompanyAside";
import { CompanyAvatar } from "./CompanyAvatar";

export const CompanyShow = () => {
  const isMobile = useIsMobile();

  return (
    <ShowBase>
      {isMobile ? <CompanyShowContentMobile /> : <CompanyShowContent />}
    </ShowBase>
  );
};

const CompanyShowContentMobile = () => {
  const translate = useTranslate();
  const { record, isPending } = useShowContext<Company>();
  if (isPending || !record) return null;

  return (
    <>
      <MobileHeader>
        <MobileBackButton to="/" />
        <div className="flex flex-1">
          <Link to="/">
            <h1 className="text-xl font-semibold">
              {translate("resources.companies.forcedCaseName")}
            </h1>
          </Link>
        </div>
      </MobileHeader>

      <MobileContent>
        <div className="mb-6">
          <div className="flex items-center mb-4">
            <CompanyAvatar />
            <div className="mx-3 flex-1">
              <h2 className="text-2xl font-bold">{record.name}</h2>
            </div>
          </div>
        </div>
        <CompanyInfo record={record} />
        <AddressInfo record={record} />
        <ContextInfo record={record} />
        <AdditionalInfo record={record} />
      </MobileContent>
    </>
  );
};

const CompanyShowContent = () => {
  const translate = useTranslate();
  const { record, isPending } = useShowContext<Company>();
  const navigate = useNavigate();

  // Get tab from URL or default to "activity"
  const tabMatch = useMatch("/companies/:id/show/:tab");
  const currentTab = tabMatch?.params?.tab || "activity";

  const handleTabChange = (value: string) => {
    if (value === currentTab) return;
    if (value === "activity") {
      navigate(`/companies/${record?.id}/show`);
      return;
    }
    navigate(`/companies/${record?.id}/show/${value}`);
  };

  if (isPending || !record) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* Company header card */}
      <Card>
        <CardContent className="py-5">
          <div className="flex items-center gap-4">
            <CompanyAvatar />
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold leading-tight">
                {record.name}
              </h2>
              {record.sector && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {record.sector}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Two-column layout: tabs + aside */}
      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <Card>
            <CardContent className="py-5">
              <Tabs
                defaultValue={currentTab}
                onValueChange={handleTabChange}
              >
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="activity">
                    {translate("crm.common.activity")}
                  </TabsTrigger>
                  <TabsTrigger value="contacts">
                    {record.nb_contacts === 0
                      ? translate("resources.companies.no_contacts")
                      : translate("resources.companies.nb_contacts", {
                          smart_count: record.nb_contacts ?? 0,
                        })}
                  </TabsTrigger>
                  {record.nb_deals ? (
                    <TabsTrigger value="deals">
                      {translate("resources.companies.nb_deals", {
                        smart_count: record.nb_deals ?? 0,
                      })}
                    </TabsTrigger>
                  ) : null}
                </TabsList>
                <TabsContent value="activity" className="pt-4">
                  <ActivityLog companyId={record.id} context="company" />
                </TabsContent>
                <TabsContent value="contacts" className="pt-4">
                  {record.nb_contacts ? (
                    <ReferenceManyField
                      reference="contacts_summary"
                      target="company_id"
                      sort={{ field: "last_name", order: "ASC" }}
                    >
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-row justify-end space-x-2">
                          {!!record.nb_contacts && (
                            <SortButton
                              fields={[
                                "last_name",
                                "first_name",
                                "last_seen",
                              ]}
                            />
                          )}
                          <CreateRelatedContactButton />
                        </div>
                        <ContactsIterator />
                      </div>
                    </ReferenceManyField>
                  ) : (
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-row justify-end space-x-2">
                        <CreateRelatedContactButton />
                      </div>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="deals" className="pt-4">
                  {record.nb_deals ? (
                    <ReferenceManyField
                      reference="deals"
                      target="company_id"
                      sort={{ field: "name", order: "ASC" }}
                    >
                      <DealsIterator />
                    </ReferenceManyField>
                  ) : null}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
        <CompanyAside />
      </div>
    </div>
  );
};

const ContactsIterator = () => {
  const translate = useTranslate();
  const [locale = "en"] = useLocaleState();
  const location = useLocation();
  const { data: contacts, error, isPending } = useListContext<Contact>();

  if (isPending || error) return null;

  return (
    <div className="divide-y divide-border/50">
      {contacts.map((contact) => (
        <RecordContextProvider key={contact.id} value={contact}>
          <RouterLink
            key={contact.id}
            to={`/contacts/${contact.id}/show`}
            state={{ from: location.pathname }}
            className="flex items-center gap-3 py-3 px-2 hover:bg-muted/50 rounded-md transition-colors"
          >
            <Avatar width={25} height={25} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {contact.first_name} {contact.last_name}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {contact.title}
                {contact.nb_tasks
                  ? ` · ${translate("crm.common.task_count", {
                      smart_count: contact.nb_tasks ?? 0,
                    })}`
                  : ""}
                <TagsList />
              </div>
            </div>
            {contact.last_seen && (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">
                  {formatRelativeDate(contact.last_seen, locale)}
                </span>
                <Status status={contact.status} />
              </div>
            )}
          </RouterLink>
        </RecordContextProvider>
      ))}
    </div>
  );
};

const CreateRelatedContactButton = () => {
  const translate = useTranslate();
  const company = useRecordContext<Company>();
  return (
    <Button variant="outline" asChild size="sm" className="h-9">
      <RouterLink
        to="/contacts/create"
        state={company ? { record: { company_id: company.id } } : undefined}
        className="flex items-center gap-2"
      >
        <UserPlus className="h-4 w-4" />
        {translate("resources.contacts.action.add")}
      </RouterLink>
    </Button>
  );
};

const DealsIterator = () => {
  const [locale = "en"] = useLocaleState();
  const { data: deals, error, isPending } = useListContext<Deal>();
  const { dealStages, dealCategories, currency } = useConfigurationContext();
  if (isPending || error) return null;
  return (
    <div className="divide-y divide-border/50">
      {deals.map((deal) => (
        <RouterLink
          key={deal.id}
          to={`/deals/${deal.id}/show`}
          className="flex items-center gap-3 py-3 px-2 hover:bg-muted/50 rounded-md transition-colors"
        >
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{deal.name}</div>
            <div className="text-xs text-muted-foreground">
              {findDealLabel(dealStages, deal.stage)} ·{" "}
              {deal.amount.toLocaleString("en-US", {
                notation: "compact",
                style: "currency",
                currency,
                currencyDisplay: "narrowSymbol",
                minimumSignificantDigits: 3,
              })}
              {deal.category
                ? ` · ${dealCategories.find((c) => c.value === deal.category)?.label ?? deal.category}`
                : ""}
            </div>
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatRelativeDate(deal.updated_at, locale)}
          </span>
        </RouterLink>
      ))}
    </div>
  );
};
