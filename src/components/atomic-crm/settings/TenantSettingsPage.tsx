import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import { useListSkills } from "@/hooks/useListSkills";

type TenantRow = {
  tenant_id: string;
  agentic_enabled: boolean;
  agentic_enabled_skills: string[];
  agentic_usage_limits: {
    per_day?: number;
    per_month?: number;
    max_cost_usd_per_month?: number;
  };
  stripe_subscription_id: string | null;
};

export default function TenantSettingsPage() {
  const qc = useQueryClient();
  const { skills } = useListSkills();

  const { data: tenants = [] } = useQuery({
    queryKey: ["tenant_settings_list"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("tenant_settings")
        .select("*")
        .order("tenant_id");
      if (error) throw error;
      return (data ?? []) as TenantRow[];
    },
  });

  const [newTenantId, setNewTenantId] = useState("");

  const addTenant = async () => {
    if (!newTenantId) return;
    const supabase = getSupabaseClient();
    await supabase.from("tenant_settings").insert({ tenant_id: newTenantId });
    setNewTenantId("");
    qc.invalidateQueries({ queryKey: ["tenant_settings_list"] });
  };

  const patch = async (tenantId: string, diff: Partial<TenantRow>) => {
    const supabase = getSupabaseClient();
    await supabase
      .from("tenant_settings")
      .update(diff)
      .eq("tenant_id", tenantId);
    qc.invalidateQueries({ queryKey: ["tenant_settings_list"] });
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Tenant settings</h1>
        <p className="text-sm text-muted-foreground">
          Activation agentique par tenant (SaaS).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add tenant</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input
            placeholder="tenant uuid"
            value={newTenantId}
            onChange={(e) => setNewTenantId(e.target.value)}
          />
          <Button onClick={addTenant}>Add</Button>
        </CardContent>
      </Card>

      {tenants.map((t) => (
        <Card key={t.tenant_id}>
          <CardHeader>
            <CardTitle className="text-base font-mono">{t.tenant_id}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={t.agentic_enabled}
                onCheckedChange={(v) =>
                  patch(t.tenant_id, { agentic_enabled: v })
                }
              />
              Agentic enabled
            </label>

            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Enabled skills
              </p>
              <div className="flex flex-wrap gap-2">
                {skills.map((s) => {
                  const on = t.agentic_enabled_skills.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      className={`px-2 py-1 text-xs rounded border ${
                        on
                          ? "bg-primary text-primary-foreground"
                          : "bg-background"
                      }`}
                      onClick={() =>
                        patch(t.tenant_id, {
                          agentic_enabled_skills: on
                            ? t.agentic_enabled_skills.filter((x) => x !== s.id)
                            : [...t.agentic_enabled_skills, s.id],
                        })
                      }
                    >
                      {s.id}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <LimitField
                label="Runs/day"
                value={t.agentic_usage_limits.per_day}
                onChange={(n) =>
                  patch(t.tenant_id, {
                    agentic_usage_limits: {
                      ...t.agentic_usage_limits,
                      per_day: n,
                    },
                  })
                }
              />
              <LimitField
                label="Runs/month"
                value={t.agentic_usage_limits.per_month}
                onChange={(n) =>
                  patch(t.tenant_id, {
                    agentic_usage_limits: {
                      ...t.agentic_usage_limits,
                      per_month: n,
                    },
                  })
                }
              />
              <LimitField
                label="Max $/month"
                value={t.agentic_usage_limits.max_cost_usd_per_month}
                onChange={(n) =>
                  patch(t.tenant_id, {
                    agentic_usage_limits: {
                      ...t.agentic_usage_limits,
                      max_cost_usd_per_month: n,
                    },
                  })
                }
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function LimitField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (n: number) => void;
}) {
  return (
    <label className="text-xs">
      <div>{label}</div>
      <Input
        type="number"
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
