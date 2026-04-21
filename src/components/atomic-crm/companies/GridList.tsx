import { RecordContextProvider, useListContext, useTranslate } from "ra-core";

import type { Company } from "../types";
import { CompanyCard } from "./CompanyCard";

const times = (nbChildren: number, fn: (key: number) => any) =>
  Array.from({ length: nbChildren }, (_, key) => fn(key));

const LoadingGridList = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    {times(8, (key) => (
      <div className="h-[160px] rounded-lg bg-muted animate-pulse" key={key} />
    ))}
  </div>
);

const LoadedGridList = () => {
  const { data, error, isPending } = useListContext<Company>();
  const translate = useTranslate();

  if (isPending || error) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {data.map((record) => (
        <RecordContextProvider key={record.id} value={record}>
          <CompanyCard />
        </RecordContextProvider>
      ))}

      {data.length === 0 && (
        <div className="p-2 col-span-full text-muted-foreground">
          {translate("resources.companies.empty.title", {
            _: "No companies found",
          })}
        </div>
      )}
    </div>
  );
};

export const ImageList = () => {
  const { isPending } = useListContext();
  return isPending ? <LoadingGridList /> : <LoadedGridList />;
};
