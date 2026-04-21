import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  children?: ReactNode;
};

export const PageHeader = ({ title, subtitle, children }: PageHeaderProps) => (
  <div className="flex items-center justify-between gap-4 mb-4">
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {subtitle && (
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      )}
    </div>
    {children && <div className="flex items-center gap-2">{children}</div>}
  </div>
);
