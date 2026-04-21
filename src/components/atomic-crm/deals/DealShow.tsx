import { useMutation } from "@tanstack/react-query";
import { isValid } from "date-fns";
import { Archive, ArchiveRestore } from "lucide-react";
import {
  InfiniteListBase,
  ShowBase,
  useDataProvider,
  useNotify,
  useRecordContext,
  useRedirect,
  useRefresh,
  useTranslate,
  useUpdate,
} from "ra-core";
import { DeleteButton } from "@/components/admin/delete-button";
import { EditButton } from "@/components/admin/edit-button";
import { ReferenceArrayField } from "@/components/admin/reference-array-field";
import { ReferenceField } from "@/components/admin/reference-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

import { CompanyAvatar } from "../companies/CompanyAvatar";
import { NoteCreate } from "../notes/NoteCreate";
import { NotesIterator } from "../notes/NotesIterator";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";
import { ContactList } from "./ContactList";
import { findDealLabel, formatISODateString } from "./dealUtils";

export const DealShow = ({ open, id }: { open: boolean; id?: string }) => {
  const redirect = useRedirect();
  const handleClose = () => {
    redirect("list", "deals");
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="lg:max-w-4xl p-4 overflow-y-auto max-h-9/10 top-1/20 translate-y-0">
        {id ? (
          <ShowBase id={id}>
            <DealShowContent />
          </ShowBase>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

const DealShowContent = () => {
  const translate = useTranslate();
  const { dealStages, dealCategories, currency } = useConfigurationContext();
  const record = useRecordContext<Deal>();
  if (!record) return null;

  return (
    <div className="space-y-5">
      {record.archived_at ? <ArchivedTitle /> : null}

      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <ReferenceField
            source="company_id"
            reference="companies"
            link="show"
          >
            <CompanyAvatar />
          </ReferenceField>
          <div>
            <h2 className="text-xl font-semibold leading-tight">
              {record.name}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {findDealLabel(dealStages, record.stage)}
            </p>
          </div>
        </div>
        <div className={`flex gap-2 ${record.archived_at ? "" : "pr-12"}`}>
          {record.archived_at ? (
            <>
              <UnarchiveButton record={record} />
              <DeleteButton />
            </>
          ) : (
            <>
              <ArchiveButton record={record} />
              <EditButton />
            </>
          )}
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-lg bg-muted/50 p-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            {translate("resources.deals.fields.expected_closing_date")}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {isValid(new Date(record.expected_closing_date))
                ? formatISODateString(record.expected_closing_date)
                : translate("resources.deals.invalid_date")}
            </span>
            {new Date(record.expected_closing_date) < new Date() ? (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                {translate("crm.common.past")}
              </Badge>
            ) : null}
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            {translate("resources.deals.fields.amount")}
          </p>
          <span className="text-sm font-semibold tabular-nums">
            {record.amount.toLocaleString("en-US", {
              notation: "compact",
              style: "currency",
              currency,
              currencyDisplay: "narrowSymbol",
              minimumSignificantDigits: 3,
            })}
          </span>
        </div>

        {record.category && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              {translate("resources.deals.fields.category")}
            </p>
            <span className="text-sm font-medium">
              {dealCategories.find((c) => c.value === record.category)
                ?.label ?? record.category}
            </span>
          </div>
        )}

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            {translate("resources.deals.fields.stage")}
          </p>
          <span className="text-sm font-medium">
            {findDealLabel(dealStages, record.stage)}
          </span>
        </div>
      </div>

      {/* Contacts */}
      {!!record.contact_ids?.length && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {translate("resources.deals.fields.contact_ids")}
          </p>
          <ReferenceArrayField
            source="contact_ids"
            reference="contacts_summary"
          >
            <ContactList />
          </ReferenceArrayField>
        </div>
      )}

      {/* Description */}
      {record.description && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {translate("resources.deals.fields.description")}
          </p>
          <p className="text-sm leading-relaxed whitespace-pre-line">
            {record.description}
          </p>
        </div>
      )}

      {/* Notes */}
      <div>
        <Separator className="mb-4" />
        <InfiniteListBase
          resource="deal_notes"
          filter={{ deal_id: record.id }}
          sort={{ field: "date", order: "DESC" }}
          perPage={25}
          disableSyncWithLocation
          storeKey={false}
          empty={<NoteCreate reference={"deals"} />}
        >
          <NotesIterator reference="deals" />
        </InfiniteListBase>
      </div>
    </div>
  );
};

const ArchivedTitle = () => {
  const translate = useTranslate();
  return (
    <div className="bg-orange-500 px-6 py-4">
      <h3 className="text-lg font-bold text-white">
        {translate("resources.deals.archived.title")}
      </h3>
    </div>
  );
};

const ArchiveButton = ({ record }: { record: Deal }) => {
  const translate = useTranslate();
  const [update] = useUpdate();
  const redirect = useRedirect();
  const notify = useNotify();
  const refresh = useRefresh();
  const handleClick = () => {
    update(
      "deals",
      {
        id: record.id,
        data: { archived_at: new Date().toISOString() },
        previousData: record,
      },
      {
        onSuccess: () => {
          redirect("list", "deals");
          notify("resources.deals.archived.success", {
            type: "info",
            undoable: false,
          });
          refresh();
        },
        onError: () => {
          notify("resources.deals.archived.error", {
            type: "error",
          });
        },
      },
    );
  };

  return (
    <Button
      onClick={handleClick}
      size="sm"
      variant="outline"
      className="flex items-center gap-2 h-9"
    >
      <Archive className="w-4 h-4" />
      {translate("resources.deals.archived.action")}
    </Button>
  );
};

const UnarchiveButton = ({ record }: { record: Deal }) => {
  const translate = useTranslate();
  const dataProvider = useDataProvider();
  const redirect = useRedirect();
  const notify = useNotify();
  const refresh = useRefresh();

  const { mutate } = useMutation({
    mutationFn: () => dataProvider.unarchiveDeal(record),
    onSuccess: () => {
      redirect("list", "deals");
      notify("resources.deals.unarchived.success", {
        type: "info",
        undoable: false,
      });
      refresh();
    },
    onError: () => {
      notify("resources.deals.unarchived.error", {
        type: "error",
      });
    },
  });

  const handleClick = () => {
    mutate();
  };

  return (
    <Button
      onClick={handleClick}
      size="sm"
      variant="outline"
      className="flex items-center gap-2 h-9"
    >
      <ArchiveRestore className="w-4 h-4" />
      {translate("resources.deals.unarchived.action")}
    </Button>
  );
};
