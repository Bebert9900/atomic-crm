import {
  Bolt,
  Calendar as CalendarIcon,
  CheckSquare,
  Flame,
  Mail,
  Sparkles,
  Zap,
} from "lucide-react";
import { useGetIdentity, useGetList } from "ra-core";
import { Link } from "react-router";

import { Card } from "@/components/ui/card";

import { Avatar } from "../contacts/Avatar";
import type { Contact, Deal, Task } from "../types";

function sectionTitle(icon: React.ReactNode, label: string) {
  return (
    <div className="flex items-center gap-2 mb-3 text-[13px] font-medium text-foreground/90">
      {icon}
      {label}
    </div>
  );
}

function PrioritiesCard({
  overdueCount,
  todayCount,
  unreadCount,
  staleCount,
}: {
  overdueCount: number;
  todayCount: number;
  unreadCount: number;
  staleCount: number;
}) {
  const topCount = Math.min(
    3,
    Math.max(1, overdueCount + (staleCount > 0 ? 1 : 0) + 1),
  );
  const todayLabel = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return (
    <Card className="relative overflow-hidden p-4">
      <div
        className="absolute inset-0 opacity-[0.08] pointer-events-none"
        style={{
          background:
            "radial-gradient(600px 200px at 0% 0%, var(--accent-solid), transparent)",
        }}
      />
      <div className="flex items-start gap-3">
        <div
          className="size-9 rounded-lg grid place-items-center shrink-0"
          style={{
            background:
              "color-mix(in oklch, var(--accent-solid) 15%, transparent)",
            color: "var(--accent-solid)",
          }}
        >
          <Sparkles className="size-4" />
        </div>
        <div className="flex-1">
          <div className="text-[11.5px] text-muted-foreground capitalize">
            Ta journée · {todayLabel}
          </div>
          <div className="text-[15px] font-semibold mt-0.5">
            {topCount} priorité{topCount > 1 ? "s" : ""} aujourd'hui
          </div>
          <div className="text-[12.5px] text-muted-foreground mt-1">
            {overdueCount} tâche{overdueCount > 1 ? "s" : ""} en retard ·{" "}
            {todayCount} prévue{todayCount > 1 ? "s" : ""} · {staleCount} deal
            {staleCount > 1 ? "s" : ""} qui glisse
            {staleCount > 1 ? "nt" : ""} · {unreadCount} email
            {unreadCount > 1 ? "s" : ""} à traiter
          </div>
        </div>
      </div>
    </Card>
  );
}

type TimelineItem = {
  kind: "task" | "mail" | "deal" | "meeting";
  tone: "accent" | "warm" | "red" | "cool" | "muted";
  time: string;
  title: string;
  meta: string;
  href: string;
};

const toneMap: Record<TimelineItem["tone"], string> = {
  accent: "var(--accent-solid)",
  warm: "oklch(0.78 0.14 60)",
  red: "oklch(0.7 0.18 20)",
  cool: "oklch(0.72 0.1 245)",
  muted: "oklch(0.5 0 0)",
};

const iconMap: Record<TimelineItem["kind"], React.ReactNode> = {
  task: <CheckSquare className="size-3.5" />,
  mail: <Mail className="size-3.5" />,
  deal: <Zap className="size-3.5" />,
  meeting: <CalendarIcon className="size-3.5" />,
};

function TimelineRow({ item }: { item: TimelineItem }) {
  return (
    <Link
      to={item.href}
      className="px-4 py-2.5 flex gap-3 items-center hover:bg-muted/30 no-underline text-foreground"
    >
      <div className="w-12 text-[11px] text-muted-foreground tabular-nums">
        {item.time}
      </div>
      <div
        className="size-7 shrink-0 rounded-md grid place-items-center"
        style={{
          background: `color-mix(in oklch, ${toneMap[item.tone]} 14%, transparent)`,
          color: toneMap[item.tone],
        }}
      >
        {iconMap[item.kind]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] leading-snug truncate">{item.title}</div>
        <div className="text-[11px] text-muted-foreground truncate">
          {item.meta}
        </div>
      </div>
    </Link>
  );
}

function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-border text-[12.5px] font-medium flex items-center gap-2">
        <CalendarIcon className="size-4 text-muted-foreground" />
        Timeline du jour
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-8 text-[12px] text-muted-foreground text-center">
          Rien de prévu. Profite du calme pour prospecter.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((it, i) => (
            <TimelineRow key={i} item={it} />
          ))}
        </div>
      )}
    </Card>
  );
}

function StaleDealsCard({ deals }: { deals: Deal[] }) {
  const now = Date.now();
  const stale = deals
    .map((d) => ({
      deal: d,
      daysSince: Math.floor(
        (now - new Date(d.updated_at ?? d.created_at).getTime()) /
          (24 * 60 * 60 * 1000),
      ),
    }))
    .filter((x) => x.daysSince >= 7)
    .sort((a, b) => b.daysSince - a.daysSince)
    .slice(0, 5);

  return (
    <Card className="p-4">
      {sectionTitle(
        <Bolt className="size-4 text-muted-foreground" />,
        "Deals qui glissent",
      )}
      {stale.length === 0 ? (
        <div className="text-[12px] text-muted-foreground">
          Aucun deal à relancer pour l'instant.
        </div>
      ) : (
        <div className="space-y-2 text-[12.5px]">
          {stale.map(({ deal, daysSince }) => (
            <Link
              key={deal.id}
              to={`/deals/${deal.id}/show`}
              className="flex items-center gap-3 py-1.5 border-b border-border last:border-0 hover:bg-muted/30 -mx-1.5 px-1.5 rounded no-underline text-foreground"
            >
              <Flame className="size-3.5 text-orange-400 shrink-0" />
              <div className="flex-1 min-w-0 truncate">{deal.name}</div>
              <div className="tabular-nums text-muted-foreground shrink-0">
                {((deal.amount ?? 0) / 1000).toFixed(0)}k€
              </div>
              <div className="text-[11px] text-rose-400 tabular-nums shrink-0">
                {daysSince}j
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

function FollowUpContactsCard({ contacts }: { contacts: Contact[] }) {
  const now = Date.now();
  const followUps = contacts
    .filter((c) => c.status === "warm" || c.status === "hot")
    .map((c) => ({
      contact: c,
      daysSince: Math.floor(
        (now - new Date(c.last_seen ?? c.first_seen).getTime()) /
          (24 * 60 * 60 * 1000),
      ),
    }))
    .filter((x) => x.daysSince >= 7)
    .sort((a, b) => b.daysSince - a.daysSince)
    .slice(0, 5);

  return (
    <Card className="p-4">
      {sectionTitle(
        <Bolt className="size-4 text-muted-foreground" />,
        "Contacts à relancer",
      )}
      {followUps.length === 0 ? (
        <div className="text-[12px] text-muted-foreground">
          Tous tes contacts chauds sont à jour.
        </div>
      ) : (
        <div className="space-y-2">
          {followUps.map(({ contact, daysSince }) => (
            <Link
              key={contact.id}
              to={`/contacts/${contact.id}/show`}
              className="flex items-center gap-2.5 hover:bg-muted/30 -mx-1.5 px-1.5 py-1 rounded no-underline text-foreground"
            >
              <Avatar record={contact} width={25} height={25} />
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] truncate">
                  {contact.first_name} {contact.last_name}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  Pas de contact en {daysSince}j
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

export const MyDayPage = () => {
  const { identity } = useGetIdentity();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: tasks } = useGetList<Task>(
    "tasks",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "due_date", order: "ASC" },
      filter: identity?.id
        ? { sales_id: identity.id, "done_date@is": null }
        : { "done_date@is": null },
    },
    { enabled: !!identity },
  );

  const { data: deals } = useGetList<Deal>("deals", {
    pagination: { page: 1, perPage: 200 },
    filter: { "pipeline_status@eq": "in-progress" },
  });

  const { data: contacts } = useGetList<Contact>("contacts", {
    pagination: { page: 1, perPage: 200 },
    sort: { field: "last_seen", order: "DESC" },
    filter: identity?.id ? { sales_id: identity.id } : {},
  });

  const unreadSummary = useGetList<{ total_unread: number }>(
    "unread_emails_summary",
    { pagination: { page: 1, perPage: 10 } },
  );
  const unreadCount =
    unreadSummary.data?.reduce((s, r) => s + (r.total_unread ?? 0), 0) ?? 0;

  const todayEnd = new Date(startOfDay);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const overdue = (tasks ?? []).filter(
    (t) => new Date(t.due_date) < startOfDay,
  );
  const todayTasks = (tasks ?? []).filter(
    (t) =>
      new Date(t.due_date) >= startOfDay && new Date(t.due_date) < todayEnd,
  );

  const staleDeals = (deals ?? []).filter((d) => {
    const ref = new Date(d.updated_at ?? d.created_at).getTime();
    return Date.now() - ref >= 7 * 24 * 60 * 60 * 1000;
  });

  // Build timeline: overdue first, then today by time
  const items: TimelineItem[] = [
    ...overdue.slice(0, 5).map<TimelineItem>((t) => ({
      kind: "task",
      tone: "red",
      time: new Date(t.due_date).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
      }),
      title: `⚠ ${t.text}`,
      meta: "En retard",
      href: t.contact_id ? `/contacts/${t.contact_id}/show` : "/tasks",
    })),
    ...todayTasks.map<TimelineItem>((t) => ({
      kind: "task",
      tone: "accent",
      time: new Date(t.due_date).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      title: t.text,
      meta: t.type || "Tâche",
      href: t.contact_id ? `/contacts/${t.contact_id}/show` : "/tasks",
    })),
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 max-w-6xl">
      <div className="lg:col-span-2 space-y-4">
        <PrioritiesCard
          overdueCount={overdue.length}
          todayCount={todayTasks.length}
          unreadCount={unreadCount}
          staleCount={staleDeals.length}
        />
        <Timeline items={items} />
      </div>

      <div className="space-y-4">
        <StaleDealsCard deals={deals ?? []} />
        <FollowUpContactsCard contacts={contacts ?? []} />
      </div>
    </div>
  );
};

MyDayPage.path = "/my-day";
