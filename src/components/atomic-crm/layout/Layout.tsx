import { Suspense, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Notification } from "@/components/admin/notification";
import { Error } from "@/components/admin/error";
import { Skeleton } from "@/components/ui/skeleton";

import { useConfigurationLoader } from "../root/useConfigurationLoader";
import { Sidebar } from "./Sidebar";
import { GlobalSearchBar } from "./GlobalSearchBar";
import { CreateDropdown } from "./CreateDropdown";

export const Layout = ({ children }: { children: ReactNode }) => {
  useConfigurationLoader();
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="ml-56 flex-1 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-end gap-3 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-2.5">
          <GlobalSearchBar />
          <CreateDropdown />
        </header>

        {/* Main content */}
        <main
          className="flex-1 overflow-y-auto px-6 py-4"
          id="main-content"
        >
          <ErrorBoundary FallbackComponent={Error}>
            <Suspense
              fallback={<Skeleton className="h-12 w-12 rounded-full" />}
            >
              {children}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <Notification />
    </div>
  );
};
