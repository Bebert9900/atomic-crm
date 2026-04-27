import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Maximize2, X, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FullscreenPayload } from "./types";

export function FullscreenBlock({ payload }: { payload: FullscreenPayload }) {
  const [open, setOpen] = useState(false);
  const preview =
    (payload.content ?? payload.sections?.[0]?.content ?? "")
      .split("\n")
      .slice(0, 3)
      .join("\n") + "\n…";

  return (
    <>
      <div className="my-2 rounded-md border bg-background">
        <div className="flex items-center justify-between border-b px-2 py-1 text-xs">
          <span className="font-medium truncate">{payload.title}</span>
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => setOpen(true)}
          >
            <Maximize2 className="mr-1 h-3 w-3" /> Plein écran
          </Button>
        </div>
        <div className="px-2 py-1 text-xs text-muted-foreground whitespace-pre-wrap">
          {preview}
        </div>
      </div>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative flex h-[90vh] w-[90vw] max-w-4xl flex-col overflow-hidden rounded-lg border bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b px-4 py-2">
              <span className="font-medium">{payload.title}</span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.print()}
                >
                  <Printer className="mr-1 h-3 w-3" /> Imprimer
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </header>
            <div className="flex-1 overflow-auto p-6">
              <div className="prose prose-sm max-w-none dark:prose-invert">
                {payload.sections
                  ? payload.sections.map((s, i) => (
                      <section key={i}>
                        <h2>{s.title}</h2>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {s.content}
                        </ReactMarkdown>
                      </section>
                    ))
                  : payload.content && (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {payload.content}
                      </ReactMarkdown>
                    )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
