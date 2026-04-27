import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  History,
  LayoutPanelLeft,
  PanelRightClose,
  Plus,
  Send,
  Square,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import { useAgentChat, type ChatMessage } from "@/hooks/useAgentChat";
import { MessageContent } from "./chat/blocks/MessageContent";
import { ToolTimeline } from "./chat/ToolTimeline";
import { parseMessage } from "./chat/blocks/parser";
import type { CrmBlock } from "./chat/blocks/types";
import { TableBlock } from "./chat/blocks/TableBlock";
import { DashboardBlock } from "./chat/blocks/DashboardBlock";
import { KanbanBlock } from "./chat/blocks/KanbanBlock";
import { ActionsBlock } from "./chat/blocks/ActionsBlock";
import { FullscreenBlock } from "./chat/blocks/FullscreenBlock";
import { ApproveBlock } from "./chat/blocks/ApproveBlock";

type ConvSummary = {
  id: string;
  title: string;
  updated_at: string;
};

function useConversations(reloadKey: number) {
  const [items, setItems] = useState<ConvSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    setLoading(true);
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from("chat_conversations")
      .select("id, title, updated_at")
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(100);
    setItems((data ?? []) as ConvSummary[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload, reloadKey]);
  return { items, loading, reload };
}

const CANVAS_KINDS: CrmBlock["kind"][] = [
  "table",
  "kanban",
  "fullscreen",
  "dashboard",
];

function pickLatestCanvasBlock(messages: ChatMessage[]): CrmBlock | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant" || !m.content) continue;
    const parts = parseMessage(m.content);
    for (let j = parts.length - 1; j >= 0; j--) {
      const p = parts[j];
      if (p.type === "block" && CANVAS_KINDS.includes(p.block.kind)) {
        return p.block;
      }
    }
  }
  return null;
}

export function AgentChatFull() {
  const chat = useAgentChat();
  const [reloadKey, setReloadKey] = useState(0);
  const { items } = useConversations(reloadKey);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canvasOpen, setCanvasOpen] = useState(true);
  const [pinnedBlock, setPinnedBlock] = useState<CrmBlock | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chat.messages]);

  useEffect(() => {
    if (chat.conversationId) setReloadKey((k) => k + 1);
  }, [chat.conversationId]);

  // Auto-pick latest large block for the canvas (unless user pinned one)
  const autoBlock = useMemo(
    () => pickLatestCanvasBlock(chat.messages),
    [chat.messages],
  );
  const canvasBlock = pinnedBlock ?? autoBlock;
  const showCanvas = canvasOpen && canvasBlock !== null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 h-full min-h-0">
      <aside className="hidden md:flex flex-col border rounded-md min-h-0">
        <div className="flex items-center gap-1 p-2 border-b">
          <span className="text-xs font-medium flex-1 px-1 flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" />
            Conversations
          </span>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              chat.newConversation();
              setPinnedBlock(null);
              setReloadKey((k) => k + 1);
            }}
            title="Nouvelle conversation"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto">
          {items.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground italic">
              Aucune conversation
            </div>
          ) : (
            items.map((c) => (
              <button
                key={c.id}
                onClick={() => chat.loadConversation(c.id)}
                className={cn(
                  "block w-full text-left px-3 py-2 text-xs border-b hover:bg-muted",
                  chat.conversationId === c.id && "bg-muted",
                )}
              >
                <div className="truncate">{c.title}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {new Date(c.updated_at).toLocaleString()}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      <div
        className={cn(
          "grid gap-4 h-full min-h-0",
          showCanvas
            ? "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"
            : "grid-cols-1",
        )}
      >
        <section className="flex flex-col border rounded-md min-h-0">
          <header className="flex items-center justify-end gap-1 px-2 py-1 border-b">
            {canvasBlock && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCanvasOpen((o) => !o)}
                title={
                  canvasOpen ? "Fermer le canvas" : "Afficher dans le canvas"
                }
              >
                {canvasOpen ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <LayoutPanelLeft className="h-4 w-4" />
                )}
                <span className="ml-1 text-xs">
                  {canvasOpen ? "Canvas" : "Ouvrir canvas"}
                </span>
              </Button>
            )}
          </header>
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-6 py-6 space-y-6"
          >
            {chat.messages.length === 0 && (
              <Welcome onPick={(t) => chat.send(t)} />
            )}
            {chat.messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                onPin={(b) => {
                  setPinnedBlock(b);
                  setCanvasOpen(true);
                }}
              />
            ))}
            {chat.error && (
              <div className="text-xs text-destructive bg-destructive/10 rounded p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>{chat.error}</div>
              </div>
            )}
          </div>
          <ChatInput
            status={chat.status}
            onSend={(t) => chat.send(t)}
            onStop={chat.stop}
          />
        </section>

        {showCanvas && canvasBlock && (
          <section className="flex flex-col border rounded-md min-h-0 bg-muted/20">
            <header className="flex items-center justify-between px-3 py-2 border-b bg-background">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Canvas · {canvasBlock.kind}
                {pinnedBlock && " · épinglé"}
              </span>
              <div className="flex items-center gap-1">
                {pinnedBlock && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPinnedBlock(null)}
                    title="Retour à la sélection auto"
                  >
                    Désépingler
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setCanvasOpen(false)}
                  title="Fermer"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </header>
            <div className="flex-1 overflow-auto p-4">
              <CanvasRenderer block={canvasBlock} />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function CanvasRenderer({ block }: { block: CrmBlock }) {
  switch (block.kind) {
    case "table":
      return <TableBlock payload={block.payload} />;
    case "dashboard":
      return <DashboardBlock payload={block.payload} />;
    case "kanban":
      return <KanbanBlock payload={block.payload} />;
    case "actions":
      return <ActionsBlock payload={block.payload} />;
    case "fullscreen":
      return <FullscreenBlock payload={block.payload} />;
    case "approve":
      return <ApproveBlock payload={block.payload} />;
    default:
      return null;
  }
}

function Welcome({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className="max-w-2xl mx-auto space-y-3">
      <h2 className="text-xl font-semibold">Bonjour 👋</h2>
      <p className="text-sm text-muted-foreground">
        Pose-moi une question, donne une consigne. Je peux lire le CRM, créer
        des tâches/notes, et te suggérer des updates qui s'appliquent en un clic
        après ton accord.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3">
        <Suggestion text="Fais-moi le brief de la journée" onClick={onPick} />
        <Suggestion text="Quels deals je dois relancer ?" onClick={onPick} />
        <Suggestion
          text="Trie les emails non lus de mon inbox"
          onClick={onPick}
        />
        <Suggestion
          text="Liste les contacts qui sont passés silencieux"
          onClick={onPick}
        />
      </div>
    </div>
  );
}

function Suggestion({
  text,
  onClick,
}: {
  text: string;
  onClick: (t: string) => void;
}) {
  return (
    <button
      onClick={() => onClick(text)}
      className="text-left rounded-md border px-3 py-2 text-sm hover:bg-muted transition"
    >
      {text}
    </button>
  );
}

function MessageBubble({
  message,
  onPin,
}: {
  message: ChatMessage;
  onPin: (block: CrmBlock) => void;
}): ReactNode {
  const hasTools = (message.toolCalls?.length ?? 0) > 0;
  const isUser = message.role === "user";
  const blocks = useMemo(() => {
    if (isUser || !message.content) return [];
    return parseMessage(message.content)
      .filter((p) => p.type === "block")
      .map((p) => (p as { type: "block"; block: CrmBlock }).block);
  }, [isUser, message.content]);
  const pinnable = blocks.find((b) => CANVAS_KINDS.includes(b.kind)) as
    | CrmBlock
    | undefined;
  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        isUser ? "items-end" : "items-start w-full",
      )}
    >
      {hasTools && !isUser && <ToolTimeline calls={message.toolCalls!} />}
      <div
        className={cn(
          "rounded-lg px-4 py-3 text-sm relative group",
          isUser
            ? "bg-primary text-primary-foreground max-w-[80%] whitespace-pre-wrap"
            : "bg-muted w-full max-w-3xl",
          message.pending && !message.content && "opacity-60 italic",
        )}
      >
        {pinnable && !isUser && (
          <button
            onClick={() => onPin(pinnable)}
            className="absolute right-2 top-2 hidden group-hover:flex items-center gap-1 rounded border bg-background px-1.5 py-0.5 text-[10px] hover:bg-muted"
            title="Épingler dans le canvas"
          >
            <LayoutPanelLeft className="h-3 w-3" />
            Canvas
          </button>
        )}
        {isUser ? (
          message.content || (message.pending ? "…" : "")
        ) : message.content ? (
          <MessageContent content={message.content} />
        ) : message.pending ? (
          "…"
        ) : (
          ""
        )}
      </div>
    </div>
  );
}

function ChatInput({
  status,
  onSend,
  onStop,
}: {
  status: "idle" | "streaming" | "error";
  onSend: (t: string) => void;
  onStop: () => void;
}) {
  const [value, setValue] = useState("");
  const submit = () => {
    const t = value.trim();
    if (!t) return;
    onSend(t);
    setValue("");
  };
  return (
    <div className="border-t p-3">
      <div className="relative max-w-3xl mx-auto">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Message… (Enter pour envoyer, Shift+Enter pour saut de ligne)"
          rows={3}
          className="resize-none pr-12"
          disabled={status === "streaming"}
        />
        <div className="absolute right-2 bottom-2">
          {status === "streaming" ? (
            <Button size="icon" variant="ghost" onClick={onStop} title="Stop">
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={submit}
              disabled={!value.trim()}
              title="Envoyer"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
