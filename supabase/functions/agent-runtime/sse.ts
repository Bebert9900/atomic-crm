export type SSEEvent = { event?: string; data: unknown; id?: string };

export function createSSEStream(): {
  stream: ReadableStream<Uint8Array>;
  send: (e: SSEEvent) => void;
  close: () => void;
} {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  const send = (e: SSEEvent) => {
    const parts: string[] = [];
    if (e.id) parts.push(`id: ${e.id}`);
    if (e.event) parts.push(`event: ${e.event}`);
    parts.push(`data: ${JSON.stringify(e.data)}`);
    parts.push("", "");
    try {
      controller.enqueue(encoder.encode(parts.join("\n")));
    } catch {
      // stream may already be closed
    }
  };
  const close = () => {
    try {
      controller.close();
    } catch {
      // already closed
    }
  };
  return { stream, send, close };
}

export function sseResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
