import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Beaker, Filter } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listSkills, type SkillSummary } from "@/lib/agenticClient";
import { SkillTestDialog } from "./SkillTestDialog";

const EXAMPLE_INPUTS: Record<string, Record<string, unknown>> = {
  hello_world: { name: "world" },
  morning_brief: { focus: "all" },
  morning_brief_ds: { focus: "all" },
  weekly_pipeline_review: {},
  prepare_meeting_brief: {},
  triage_dev_tasks: { scope: "inbox" },
  bulk_inbox_triage: { max_emails: 10 },
  detect_churn_risk: { scope: "all_at_risk" },
  draft_outbound_email: {
    contact_id: 1,
    intent: "follow_up",
    send: false,
  },
  deduplicate_contacts: { contact_id: 1, auto_merge_threshold: 0.95 },
  enrich_contact_from_signals: { contact_id: 1 },
  schedule_meeting_assistant: {
    contact_id: 1,
    sales_id: 1,
    duration_minutes: 30,
  },
  qualify_inbound_contact: { contact_id: 1 },
  next_best_action_on_deal: { deal_id: 1 },
  process_call_recording: { recording_id: 1 },
  handle_incoming_email: { email_id: 1 },
  onboard_saas_signup: { email: "newuser@example.com" },
  chat_with_crm: { message: "Bonjour" },
};

export function SkillsCatalog() {
  const {
    data: skills = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["agentic_skills"],
    queryFn: listSkills,
    refetchInterval: 30_000,
  });
  const [search, setSearch] = useState("");
  const [filterModel, setFilterModel] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [testSkill, setTestSkill] = useState<SkillSummary | null>(null);

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">
          Impossible de charger les skills: {String((error as Error).message)}
          <Button
            variant="outline"
            size="sm"
            className="ml-3"
            onClick={() => refetch()}
          >
            Réessayer
          </Button>
        </CardContent>
      </Card>
    );
  }

  const filtered = skills.filter((s) => {
    if (
      search &&
      !`${s.id} ${s.description}`.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    if (filterModel !== "all" && !s.model.startsWith(filterModel)) return false;
    if (filterSource !== "all" && (s.source ?? "code") !== filterSource)
      return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Filter className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filtrer (id, description)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={filterModel} onValueChange={setFilterModel}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Modèle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous modèles</SelectItem>
            <SelectItem value="claude-opus">Claude Opus</SelectItem>
            <SelectItem value="claude-sonnet">Claude Sonnet</SelectItem>
            <SelectItem value="claude-haiku">Claude Haiku</SelectItem>
            <SelectItem value="deepseek">DeepSeek</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterSource} onValueChange={setFilterSource}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes sources</SelectItem>
            <SelectItem value="code">Code</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} / {skills.length} skills
        </span>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Chargement…
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((s) => (
            <SkillCard key={s.id} skill={s} onTest={() => setTestSkill(s)} />
          ))}
        </div>
      )}

      {testSkill && (
        <SkillTestDialog
          skill={testSkill}
          exampleInput={EXAMPLE_INPUTS[testSkill.id] ?? {}}
          onClose={() => setTestSkill(null)}
        />
      )}
    </div>
  );
}

function SkillCard({
  skill,
  onTest,
}: {
  skill: SkillSummary;
  onTest: () => void;
}) {
  const source = skill.source ?? "code";
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          <Sparkles className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-mono break-all">
              {skill.id}
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              v{skill.version} · {skill.model}
            </CardDescription>
          </div>
          <Badge variant={source === "custom" ? "default" : "outline"}>
            {source}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3">
        <p className="text-xs text-muted-foreground line-clamp-3">
          {skill.description}
        </p>
        <div className="flex flex-wrap gap-1">
          {skill.tools_allowed.slice(0, 6).map((t) => (
            <Badge key={t} variant="secondary" className="text-[10px]">
              {t}
            </Badge>
          ))}
          {skill.tools_allowed.length > 6 && (
            <Badge variant="outline" className="text-[10px]">
              +{skill.tools_allowed.length - 6}
            </Badge>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground">
          rate · {skill.rate_limit.per_minute}/min · {skill.rate_limit.per_hour}
          /h
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-auto"
          onClick={onTest}
        >
          <Beaker className="h-3.5 w-3.5 mr-1.5" />
          Tester
        </Button>
      </CardContent>
    </Card>
  );
}
