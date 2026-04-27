import { useCallback, useEffect, useRef, useState } from "react";
import { streamSkillRun, type SkillRunEvent } from "@/lib/agenticClient";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ name: string; args: unknown; result?: unknown }>;
  pending?: boolean;
};

export type ChatContext = {
  page?: string;
  entity_type?: string;
  entity_id?: string | number;
  entity_label?: string;
};

export function useAgentChat() {
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<"idle" | "streaming" | "error">("idle");
  const [error, setError] = useState<string | undefined>();
  const abortRef = useRef<AbortController | null>(null);
  const pendingIdRef = useRef<string | null>(null);

  const loadConversation = useCallback(async (id: string) => {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", id)
      .order("id", { ascending: true });
    if (error) {
      setError(error.message);
      return;
    }
    setConversationId(id);
    setMessages(
      (data ?? [])
        .filter((m) => m.role !== "tool" && m.content)
        .map((m) => ({
          id: `db-${m.id}`,
          role: m.role as "user" | "assistant",
          content: m.content as string,
        })),
    );
  }, []);

  const newConversation = useCallback(() => {
    abortRef.current?.abort();
    setConversationId(undefined);
    setMessages([]);
    setStatus("idle");
    setError(undefined);
  }, []);

  const send = useCallback(
    async (text: string, ctx?: ChatContext) => {
      if (!text.trim() || status === "streaming") return;
      setError(undefined);
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: text,
      };
      const pendingId = `a-${Date.now()}`;
      pendingIdRef.current = pendingId;
      const pendingMsg: ChatMessage = {
        id: pendingId,
        role: "assistant",
        content: "",
        toolCalls: [],
        pending: true,
      };
      setMessages((m) => [...m, userMsg, pendingMsg]);
      setStatus("streaming");

      try {
        for await (const ev of streamSkillRun(
          "chat_with_crm",
          { conversation_id: conversationId, message: text, context: ctx },
          { signal: ac.signal },
        ) as AsyncGenerator<SkillRunEvent & { data: any }>) {
          if (ev.event === "conversation.created") {
            setConversationId(ev.data.conversation_id);
          } else if (ev.event === "text") {
            setMessages((ms) =>
              ms.map((m) =>
                m.id === pendingId ? { ...m, content: ev.data.content } : m,
              ),
            );
          } else if (ev.event === "tool_use") {
            setMessages((ms) =>
              ms.map((m) =>
                m.id === pendingId
                  ? {
                      ...m,
                      toolCalls: [
                        ...(m.toolCalls ?? []),
                        { name: ev.data.name, args: ev.data.args },
                      ],
                    }
                  : m,
              ),
            );
          } else if (ev.event === "tool_result") {
            setMessages((ms) =>
              ms.map((m) => {
                if (m.id !== pendingId) return m;
                const tc = [...(m.toolCalls ?? [])];
                for (let i = tc.length - 1; i >= 0; i--) {
                  if (
                    tc[i].name === ev.data.name &&
                    tc[i].result === undefined
                  ) {
                    tc[i] = { ...tc[i], result: ev.data.result };
                    break;
                  }
                }
                return { ...m, toolCalls: tc };
              }),
            );
          } else if (ev.event === "run.done") {
            setMessages((ms) =>
              ms.map((m) =>
                m.id === pendingId
                  ? {
                      ...m,
                      content:
                        (ev.data.output as { assistant_text?: string })
                          ?.assistant_text ?? m.content,
                      pending: false,
                    }
                  : m,
              ),
            );
            if (
              (ev.data.output as { conversation_id?: string })?.conversation_id
            ) {
              setConversationId(
                (ev.data.output as { conversation_id: string }).conversation_id,
              );
            }
            setStatus("idle");
          } else if (ev.event === "run.error") {
            setError(ev.data.error);
            setMessages((ms) => ms.filter((m) => m.id !== pendingId));
            setStatus("error");
          }
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          setMessages((ms) => ms.filter((m) => m.id !== pendingId));
          setStatus("idle");
          return;
        }
        setError(String(e));
        setMessages((ms) => ms.filter((m) => m.id !== pendingId));
        setStatus("error");
      }
    },
    [conversationId, status],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return {
    conversationId,
    messages,
    status,
    error,
    send,
    stop,
    newConversation,
    loadConversation,
  };
}
