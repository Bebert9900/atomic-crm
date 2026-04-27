import { useState } from "react";
import { Link } from "react-router";
import { Bot, Settings2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { AgentChatFull } from "./AgentChatFull";
import { SkillsCatalog } from "./SkillsCatalog";
import { CustomSkillsPanel, type CustomSkillDraft } from "./CustomSkillsPanel";
import { SkillRunsTable } from "./SkillRunsTable";
import { SkillRunDetail } from "./SkillRunDetail";
import { ActivityPanel } from "./ActivityPanel";
import { Card, CardContent } from "@/components/ui/card";

export const AgentPagePath = "/agent";

type TabKey = "chat" | "skills" | "custom" | "activity" | "runs";

export default function AgentPage() {
  const [tab, setTab] = useState<TabKey>("chat");
  const [openRunId, setOpenRunId] = useState<number | null>(null);
  const [pendingDraft, setPendingDraft] = useState<CustomSkillDraft | null>(
    null,
  );

  const onSuggested = (draft: CustomSkillDraft) => {
    setPendingDraft(draft);
    setTab("custom");
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <header className="flex items-center gap-2 px-6 py-3 border-b">
        <Bot className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold flex-1">Agent</h1>
        <Button variant="outline" size="sm" asChild>
          <Link
            to="/settings/ai-providers"
            className="inline-flex items-center gap-1.5"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Configurer l'IA
          </Link>
        </Button>
      </header>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as TabKey)}
        className="flex-1 flex flex-col min-h-0"
      >
        <div className="px-6 pt-4">
          <TabsList>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="custom">Skills custom</TabsTrigger>
            <TabsTrigger value="activity">Activité</TabsTrigger>
            <TabsTrigger value="runs">Runs</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="chat"
          className="flex-1 min-h-0 px-6 pb-6 data-[state=inactive]:hidden"
        >
          <AgentChatFull />
        </TabsContent>

        <TabsContent
          value="skills"
          className="flex-1 min-h-0 overflow-auto px-6 pb-6 data-[state=inactive]:hidden"
        >
          <SkillsCatalog />
        </TabsContent>

        <TabsContent
          value="custom"
          className="flex-1 min-h-0 overflow-auto px-6 pb-6 data-[state=inactive]:hidden"
        >
          <CustomSkillsPanel
            initialDraft={pendingDraft}
            onDraftConsumed={() => setPendingDraft(null)}
          />
        </TabsContent>

        <TabsContent
          value="activity"
          className="flex-1 min-h-0 overflow-auto px-6 pb-6 data-[state=inactive]:hidden"
        >
          <ActivityPanel onSuggested={onSuggested} />
        </TabsContent>

        <TabsContent
          value="runs"
          className="flex-1 min-h-0 overflow-auto px-6 pb-6 data-[state=inactive]:hidden"
        >
          <Card>
            <CardContent className="p-4">
              <SkillRunsTable onRowClick={setOpenRunId} />
            </CardContent>
          </Card>
          <SkillRunDetail
            runId={openRunId}
            open={!!openRunId}
            onClose={() => setOpenRunId(null)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

AgentPage.path = AgentPagePath;
