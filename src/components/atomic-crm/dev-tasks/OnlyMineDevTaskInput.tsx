import { useGetIdentity, useListFilterContext } from "ra-core";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const FILTER_KEY = "assignee_ids@cs";

export const OnlyMineDevTaskInput = (_: {
  alwaysOn: boolean;
  source: string;
}) => {
  const { filterValues, displayedFilters, setFilters } = useListFilterContext();
  const { identity } = useGetIdentity();

  const active = typeof filterValues[FILTER_KEY] !== "undefined";

  const handleChange = () => {
    const next = { ...filterValues };
    if (active) {
      delete next[FILTER_KEY];
    } else if (identity?.id != null) {
      next[FILTER_KEY] = `{${identity.id}}`;
    }
    setFilters(next, displayedFilters);
  };

  return (
    <div className="mt-auto pb-2.25">
      <div className="flex items-center space-x-2">
        <Switch
          id="only-my-dev-tasks"
          checked={active}
          onCheckedChange={handleChange}
        />
        <Label htmlFor="only-my-dev-tasks">Mes tâches</Label>
      </div>
    </div>
  );
};
