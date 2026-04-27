import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Edit3, Sparkles } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createCustomSkill,
  deleteCustomSkill,
  listCustomSkills,
  listTools,
  updateCustomSkill,
  type CustomSkillRow,
  type ToolSummary,
} from "@/lib/agenticClient";

const MODELS = [
  { value: "claude-opus-4-7", label: "Claude Opus 4.7" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  { value: "deepseek-chat", label: "DeepSeek Chat" },
  { value: "deepseek-reasoner", label: "DeepSeek Reasoner" },
];

export type CustomSkillDraft = Partial<{
  skill_id: string;
  version: string;
  description: string;
  model: string;
  tools_allowed: string[];
  max_iterations: number;
  max_writes: number;
  rate_limit: { per_minute: number; per_hour: number };
  system_prompt: string;
  enabled: boolean;
}>;

export function CustomSkillsPanel({
  initialDraft,
  onDraftConsumed,
}: {
  initialDraft?: CustomSkillDraft | null;
  onDraftConsumed?: () => void;
} = {}) {
  const qc = useQueryClient();
  const { data: skills = [], isLoading } = useQuery({
    queryKey: ["agentic_custom_skills"],
    queryFn: listCustomSkills,
  });
  const { data: tools = [] } = useQuery({
    queryKey: ["agentic_tools"],
    queryFn: listTools,
  });
  const [editing, setEditing] = useState<
    CustomSkillRow | "new" | { draft: CustomSkillDraft } | null
  >(null);

  // Auto-open the form when a draft is delivered from another panel.
  useEffect(() => {
    if (initialDraft) {
      setEditing({ draft: initialDraft });
      onDraftConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraft]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["agentic_custom_skills"] });
    qc.invalidateQueries({ queryKey: ["agentic_skills"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground flex-1">
          Skills créés depuis l'UI. Un skill custom dont l'id correspond à un
          skill code <strong>remplace</strong> ce dernier (pratique pour tweaker
          un prompt sans déployer).
        </p>
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nouveau skill
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Chargement…
          </CardContent>
        </Card>
      ) : skills.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground italic">
            Aucun skill custom pour l'instant. Clique « Nouveau skill ».
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {skills.map((s) => (
            <CustomSkillCard
              key={s.id}
              skill={s}
              onEdit={() => setEditing(s)}
              onDeleted={refresh}
            />
          ))}
        </div>
      )}

      {editing && (
        <CustomSkillFormDialog
          initial={
            editing === "new" ||
            (typeof editing === "object" && "draft" in editing)
              ? null
              : editing
          }
          draft={
            typeof editing === "object" &&
            editing !== null &&
            "draft" in editing
              ? editing.draft
              : null
          }
          tools={tools}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function CustomSkillCard({
  skill,
  onEdit,
  onDeleted,
}: {
  skill: CustomSkillRow;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const del = useMutation({
    mutationFn: () => deleteCustomSkill(skill.id),
    onSuccess: onDeleted,
  });
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          <Sparkles className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-mono break-all">
              {skill.skill_id}
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              v{skill.version} · {skill.model}
            </CardDescription>
          </div>
          <Badge variant={skill.enabled ? "default" : "outline"}>
            {skill.enabled ? "actif" : "désactivé"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground line-clamp-2">
          {skill.description || "(pas de description)"}
        </p>
        <div className="flex flex-wrap gap-1">
          {skill.tools_allowed.slice(0, 5).map((t) => (
            <Badge key={t} variant="secondary" className="text-[10px]">
              {t}
            </Badge>
          ))}
          {skill.tools_allowed.length > 5 && (
            <Badge variant="outline" className="text-[10px]">
              +{skill.tools_allowed.length - 5}
            </Badge>
          )}
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Edit3 className="h-3.5 w-3.5 mr-1.5" />
            Éditer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm(`Supprimer ${skill.skill_id} ?`)) del.mutate();
            }}
            disabled={del.isPending}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Supprimer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type FormState = {
  skill_id: string;
  version: string;
  description: string;
  model: string;
  tools_allowed: string[];
  max_iterations: number;
  max_writes: number;
  per_minute: number;
  per_hour: number;
  system_prompt: string;
  enabled: boolean;
};

const DEFAULT_FORM: FormState = {
  skill_id: "",
  version: "1.0.0",
  description: "",
  model: "claude-sonnet-4-6",
  tools_allowed: [],
  max_iterations: 8,
  max_writes: 4,
  per_minute: 2,
  per_hour: 20,
  system_prompt: "",
  enabled: true,
};

function CustomSkillFormDialog({
  initial,
  draft,
  tools,
  onClose,
  onSaved,
}: {
  initial: CustomSkillRow | null;
  draft?: CustomSkillDraft | null;
  tools: ToolSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => {
    if (initial) {
      return {
        skill_id: initial.skill_id,
        version: initial.version,
        description: initial.description,
        model: initial.model,
        tools_allowed: initial.tools_allowed,
        max_iterations: initial.max_iterations,
        max_writes: initial.max_writes,
        per_minute: initial.rate_limit.per_minute,
        per_hour: initial.rate_limit.per_hour,
        system_prompt: initial.system_prompt,
        enabled: initial.enabled,
      };
    }
    if (draft) {
      return {
        skill_id: draft.skill_id ?? DEFAULT_FORM.skill_id,
        version: draft.version ?? DEFAULT_FORM.version,
        description: draft.description ?? DEFAULT_FORM.description,
        model: draft.model ?? DEFAULT_FORM.model,
        tools_allowed: draft.tools_allowed ?? DEFAULT_FORM.tools_allowed,
        max_iterations: draft.max_iterations ?? DEFAULT_FORM.max_iterations,
        max_writes: draft.max_writes ?? DEFAULT_FORM.max_writes,
        per_minute: draft.rate_limit?.per_minute ?? DEFAULT_FORM.per_minute,
        per_hour: draft.rate_limit?.per_hour ?? DEFAULT_FORM.per_hour,
        system_prompt: draft.system_prompt ?? DEFAULT_FORM.system_prompt,
        enabled: draft.enabled ?? DEFAULT_FORM.enabled,
      };
    }
    return DEFAULT_FORM;
  });
  const [error, setError] = useState<string | null>(null);
  const [toolFilter, setToolFilter] = useState("");

  useEffect(() => setError(null), [form]);

  const grouped = useMemo(() => {
    const map = new Map<string, ToolSummary[]>();
    for (const t of tools) {
      const dom = t.name.split("_")[0] || "misc";
      if (!map.has(dom)) map.set(dom, []);
      map.get(dom)!.push(t);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [tools]);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        skill_id: form.skill_id.trim(),
        version: form.version.trim() || "1.0.0",
        description: form.description.trim(),
        model: form.model,
        tools_allowed: form.tools_allowed,
        max_iterations: form.max_iterations,
        max_writes: form.max_writes,
        rate_limit: {
          per_minute: form.per_minute,
          per_hour: form.per_hour,
        },
        system_prompt: form.system_prompt,
        enabled: form.enabled,
      };
      if (initial) return updateCustomSkill(initial.id, body);
      return createCustomSkill(body);
    },
    onSuccess: onSaved,
    onError: (e) => setError((e as Error).message),
  });

  const toggleTool = (name: string) => {
    setForm((f) => ({
      ...f,
      tools_allowed: f.tools_allowed.includes(name)
        ? f.tools_allowed.filter((n) => n !== name)
        : [...f.tools_allowed, name],
    }));
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initial ? `Éditer ${initial.skill_id}` : "Nouveau skill"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="ID (snake_case)">
            <Input
              value={form.skill_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, skill_id: e.target.value }))
              }
              disabled={!!initial}
              placeholder="my_custom_skill"
            />
          </Field>
          <Field label="Version">
            <Input
              value={form.version}
              onChange={(e) =>
                setForm((f) => ({ ...f, version: e.target.value }))
              }
            />
          </Field>
          <Field label="Modèle">
            <Select
              value={form.model}
              onValueChange={(v) => setForm((f) => ({ ...f, model: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="Description">
          <Input
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
            placeholder="Une phrase qui décrit le skill"
          />
        </Field>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Max itérations">
            <Input
              type="number"
              min={1}
              max={50}
              value={form.max_iterations}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  max_iterations: parseInt(e.target.value) || 1,
                }))
              }
            />
          </Field>
          <Field label="Max writes">
            <Input
              type="number"
              min={0}
              max={50}
              value={form.max_writes}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  max_writes: parseInt(e.target.value) || 0,
                }))
              }
            />
          </Field>
          <Field label="Rate / min">
            <Input
              type="number"
              min={1}
              value={form.per_minute}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  per_minute: parseInt(e.target.value) || 1,
                }))
              }
            />
          </Field>
          <Field label="Rate / heure">
            <Input
              type="number"
              min={1}
              value={form.per_hour}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  per_hour: parseInt(e.target.value) || 1,
                }))
              }
            />
          </Field>
        </div>

        <Field label="System prompt">
          <Textarea
            value={form.system_prompt}
            onChange={(e) =>
              setForm((f) => ({ ...f, system_prompt: e.target.value }))
            }
            rows={10}
            className="font-mono text-xs"
            placeholder="Tu es un agent qui... Étapes : 1. ... Renvoie un JSON dans ```json"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Astuce : termine par un schéma JSON attendu en sortie. Le custom
            skill accepte un input libre (z.record(z.unknown())) — explicite la
            forme attendue dans le prompt.
          </p>
        </Field>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <Label className="text-xs">
              Tools autorisés ({form.tools_allowed.length}/{tools.length})
            </Label>
            <Input
              value={toolFilter}
              onChange={(e) => setToolFilter(e.target.value)}
              placeholder="Filtrer…"
              className="h-7 ml-auto w-48 text-xs"
            />
          </div>
          <div className="border rounded-md max-h-72 overflow-auto p-2 space-y-3 bg-muted/30">
            {grouped.map(([domain, list]) => {
              const visible = list.filter(
                (t) =>
                  !toolFilter ||
                  t.name.toLowerCase().includes(toolFilter.toLowerCase()),
              );
              if (visible.length === 0) return null;
              return (
                <div key={domain}>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                    {domain}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                    {visible.map((t) => {
                      const checked = form.tools_allowed.includes(t.name);
                      return (
                        <label
                          key={t.name}
                          className="flex items-start gap-2 text-xs px-2 py-1 rounded cursor-pointer hover:bg-background"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleTool(t.name)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono">{t.name}</span>
                              <Badge
                                variant={
                                  t.kind === "write" ? "destructive" : "outline"
                                }
                                className="text-[9px] py-0"
                              >
                                {t.kind}
                              </Badge>
                            </div>
                            <div className="text-[10px] text-muted-foreground line-clamp-1">
                              {t.description}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {tools.length === 0 && (
              <div className="text-xs text-muted-foreground italic p-2">
                Aucun tool disponible (l'edge function n'est peut-être pas
                encore déployée).
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Switch
            id="enabled"
            checked={form.enabled}
            onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
          />
          <Label htmlFor="enabled" className="text-xs cursor-pointer">
            Activé (sinon le skill n'apparaît pas dans le runtime)
          </Label>
          <div className="flex-1" />
          {error && <span className="text-xs text-destructive">{error}</span>}
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending
              ? "Sauvegarde…"
              : initial
                ? "Mettre à jour"
                : "Créer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
