import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  Bot,
  Send,
  Plus,
  X,
  History,
  Square,
  KeyRound,
  AlertTriangle,
} from "lucide-react";
import { listProviderStatuses, type ProviderStatus } from "@/lib/aiProviders";
import { getAnthropicStatus, type OAuthStatus } from "@/lib/anthropicOAuth";
import { MessageContent } from "./blocks/MessageContent";
import { ToolTimeline } from "./ToolTimeline";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import {
  useAgentChat,
  type ChatContext,
  type ChatMessage,
} from "@/hooks/useAgentChat";

const MIN_WIDTH = 320;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 420;

function useRouteContext(): ChatContext | undefined {
  const location = useLocation();
  const params = useParams();
  return useMemo(() => {
    const path = location.pathname;
    const id = params.id;
    if (path.startsWith("/contacts/") && id) {
      return { page: path, entity_type: "contact", entity_id: id };
    }
    if (path.startsWith("/deals/") && id) {
      return { page: path, entity_type: "deal", entity_id: id };
    }
    if (path.startsWith("/companies/") && id) {
      return { page: path, entity_type: "company", entity_id: id };
    }
    if (path === "/" || path.startsWith("/dashboard")) {
      return { page: "dashboard" };
    }
    return { page: path };
  }, [location.pathname, params.id]);
}

type ConvSummary = {
  id: string;
  title: string;
  updated_at: string;
};

function useConversations(openedHistory: boolean) {
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
      .limit(50);
    setItems((data ?? []) as ConvSummary[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    if (openedHistory) void reload();
  }, [openedHistory, reload]);
  return { items, loading, reload };
}

export function AgentSidebar() {
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [historyOpen, setHistoryOpen] = useState(false);
  const ctx = useRouteContext();
  const chat = useAgentChat();
  const { items, reload } = useConversations(historyOpen);
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>(
    [],
  );
  const [oauth, setOauth] = useState<OAuthStatus>({ connected: false });
  const refreshProviders = useCallback(() => {
    listProviderStatuses()
      .then(setProviderStatuses)
      .catch(() => {});
    getAnthropicStatus()
      .then(setOauth)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (open) refreshProviders();
  }, [open, refreshProviders]);
  const connectedProviders = providerStatuses.filter((s) => s.connected);
  const hasOAuth = oauth.connected;
  const hasAnyAuth = hasOAuth || connectedProviders.length > 0;
  const scrollRef = useRef<HTMLDivElement>(null);
  const resizeStartX = useRef<number | null>(null);
  const resizeStartW = useRef<number>(width);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chat.messages]);

  const onMouseDown = (e: React.MouseEvent) => {
    resizeStartX.current = e.clientX;
    resizeStartW.current = width;
    const onMove = (ev: MouseEvent) => {
      if (resizeStartX.current === null) return;
      const delta = resizeStartX.current - ev.clientX;
      const w = Math.max(
        MIN_WIDTH,
        Math.min(MAX_WIDTH, resizeStartW.current + delta),
      );
      setWidth(w);
    };
    const onUp = () => {
      resizeStartX.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition"
        aria-label="Ouvrir l'assistant (Ctrl+L)"
        title="Assistant (Ctrl+L)"
      >
        <Bot className="h-5 w-5" />
      </button>
    );
  }

  return (
    <aside
      className="fixed right-0 top-0 z-40 flex h-screen flex-col border-l bg-background shadow-xl"
      style={{ width }}
    >
      <div
        className="absolute left-0 top-0 h-full w-1 cursor-col-resize hover:bg-border"
        onMouseDown={onMouseDown}
      />
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <Bot className="h-4 w-4" />
        <span className="text-sm font-medium flex-1 truncate">Assistant</span>
        <Link
          to="/settings/ai-providers"
          className={cn(
            "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
            !hasAnyAuth &&
              "border border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400",
            hasAnyAuth &&
              hasOAuth &&
              "bg-violet-500/10 text-violet-700 hover:bg-violet-500/20 dark:text-violet-400",
            hasAnyAuth &&
              !hasOAuth &&
              "bg-primary/10 text-primary hover:bg-primary/20",
          )}
          title={
            hasOAuth
              ? `Compte Anthropic ${oauth.subscription_type ?? ""} connecté${
                  connectedProviders.length
                    ? ` + ${connectedProviders.length} clé(s) API`
                    : ""
                }`
              : connectedProviders.length
                ? `Clés actives: ${connectedProviders.map((p) => p.provider).join(", ")}`
                : "Aucune clé API configurée"
          }
        >
          {hasOAuth ? (
            <>
              <KeyRound className="h-3 w-3" />
              {oauth.subscription_type?.toUpperCase() ?? "OAUTH"}
            </>
          ) : connectedProviders.length ? (
            <>
              <KeyRound className="h-3 w-3" />
              {connectedProviders.length === 1
                ? connectedProviders[0].provider.toUpperCase()
                : `${connectedProviders.length} CLÉS`}
            </>
          ) : (
            <>
              <AlertTriangle className="h-3 w-3" />
              Configurer
            </>
          )}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={chat.newConversation}
          title="Nouvelle conversation"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setHistoryOpen((o) => !o)}
          title="Historique"
        >
          <History className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(false)}
          title="Fermer (Ctrl+L)"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      {historyOpen && (
        <div className="border-b bg-muted/30 max-h-60 overflow-auto">
          {items.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">
              Aucune conversation
            </div>
          ) : (
            items.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  chat.loadConversation(c.id);
                  setHistoryOpen(false);
                }}
                className="block w-full text-left px-3 py-2 text-xs hover:bg-muted truncate"
              >
                {c.title}
              </button>
            ))
          )}
        </div>
      )}

      {ctx?.entity_type && (
        <div className="px-3 py-1.5 border-b text-xs text-muted-foreground">
          📄 {ctx.entity_type} #{ctx.entity_id}
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-4 space-y-4"
      >
        {chat.messages.length === 0 && (
          <div className="text-sm text-muted-foreground">
            <p className="font-medium mb-2">Bonjour 👋</p>
            <p>
              Pose-moi une question sur tes contacts, deals, tâches... Je peux
              aussi créer des tâches ou des notes pour toi.
            </p>
            <div className="mt-4 space-y-1 text-xs">
              <Suggestion
                text="Fais-moi le brief de la journée"
                onClick={(t) => chat.send(t, ctx)}
              />
              <Suggestion
                text="Quels deals je dois relancer ?"
                onClick={(t) => chat.send(t, ctx)}
              />
              {ctx?.entity_type === "deal" && (
                <Suggestion
                  text="Résume l'historique de ce deal"
                  onClick={(t) => chat.send(t, ctx)}
                />
              )}
              {ctx?.entity_type === "contact" && (
                <Suggestion
                  text="Quels sont les derniers échanges avec ce contact ?"
                  onClick={(t) => chat.send(t, ctx)}
                />
              )}
            </div>
          </div>
        )}
        {chat.messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {chat.error && (
          <div className="text-xs text-destructive bg-destructive/10 rounded p-2">
            {chat.error}
          </div>
        )}
      </div>

      <ChatInput
        status={chat.status}
        onSend={(t) => chat.send(t, ctx)}
        onStop={chat.stop}
      />
    </aside>
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
      className="block w-full text-left rounded border px-2 py-1.5 hover:bg-muted"
    >
      {text}
    </button>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const hasTools = (message.toolCalls?.length ?? 0) > 0;
  const isUser = message.role === "user";
  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        isUser ? "items-end" : "items-start w-full",
      )}
    >
      {hasTools && !isUser && <ToolTimeline calls={message.toolCalls!} />}
      <div
        className={cn(
          "rounded-lg px-3 py-2 text-sm",
          isUser
            ? "bg-primary text-primary-foreground max-w-[90%] whitespace-pre-wrap"
            : "bg-muted w-full",
          message.pending && !message.content && "opacity-60 italic",
        )}
      >
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const t = value.trim();
    if (!t) return;
    onSend(t);
    setValue("");
  };

  return (
    <div className="border-t p-2">
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Message… (Enter pour envoyer)"
          rows={2}
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
