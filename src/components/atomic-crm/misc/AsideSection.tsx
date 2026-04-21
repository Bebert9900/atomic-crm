import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

export type AsideSectionProps = {
  title: string;
  children?: ReactNode;
  noGap?: boolean;
};

export function AsideSection({ title, children, noGap }: AsideSectionProps) {
  const isMobile = useIsMobile();
  return (
    <div className="mb-5 text-sm">
      <h3
        className={cn(
          "pb-2",
          isMobile
            ? "text-base font-semibold"
            : "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
        )}
      >
        {title}
      </h3>
      <div className={cn("flex flex-col", { "gap-1": !noGap })}>{children}</div>
    </div>
  );
}
