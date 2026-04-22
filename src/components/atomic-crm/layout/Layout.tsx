import { Suspense, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Notification } from "@/components/admin/notification";
import { Error } from "@/components/admin/error";
import { Skeleton } from "@/components/ui/skeleton";

import { useConfigurationLoader } from "../root/useConfigurationLoader";
import { FabrikSidebar } from "./FabrikSidebar";
import { FabrikTopBar } from "./FabrikTopBar";

export const Layout = ({ children }: { children: ReactNode }) => {
  useConfigurationLoader();
  return (
    <div className="flex h-screen overflow-hidden">
      <FabrikSidebar />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <FabrikTopBar />
        <main className="flex-1 overflow-auto p-4 md:p-6" id="main-content">
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
