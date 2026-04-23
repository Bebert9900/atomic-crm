import {
  AlertTriangle,
  SignalHigh,
  SignalLow,
  SignalMedium,
  SignalZero,
  type LucideIcon,
} from "lucide-react";

import type { DevTaskPriority } from "../types";

const ICON_MAP: Record<string, LucideIcon> = {
  AlertTriangle,
  SignalHigh,
  SignalLow,
  SignalMedium,
  SignalZero,
};

export const PriorityIcon = ({
  priority,
  className,
}: {
  priority: DevTaskPriority | undefined;
  className?: string;
}) => {
  if (!priority) return null;
  const Icon = ICON_MAP[priority.icon] ?? SignalZero;
  return (
    <Icon className={`w-3.5 h-3.5 ${priority.colorClass} ${className ?? ""}`} />
  );
};
