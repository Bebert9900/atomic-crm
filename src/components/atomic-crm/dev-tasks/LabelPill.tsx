import type { DevTaskLabel } from "../types";

export const LabelPill = ({ label }: { label: DevTaskLabel }) => (
  <span
    className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border"
    style={{
      backgroundColor: `${label.color}14`,
      color: label.color,
      borderColor: `${label.color}55`,
    }}
  >
    {label.name}
  </span>
);
