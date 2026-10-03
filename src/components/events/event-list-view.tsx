"use client";

import * as React from "react";
import { type EventWithDetails } from "@/lib/actions/events";
import { categorizeEvent, type EventGroupCategory } from "@/lib/utils/events";
import { EventCard } from "./event-card";
import { EmptyState } from "../ui/empty-state";
import { Button } from "../ui/button";
import {
  CalendarDays,
  AlertCircle,
  Clock,
  CalendarCheck,
  CheckCircle2,
  Calendar,
  Plus,
} from "lucide-react";

interface EventListViewProps {
  events: EventWithDetails[];
  onEdit: (event: EventWithDetails) => void;
  onComplete: (eventId: string) => void;
  onReopen: (eventId: string) => void;
  onDelete: (eventId: string) => void;
  onViewDetails: (event: EventWithDetails) => void;
  onQuickAdd: () => void;
}

interface GroupConfig {
  key: EventGroupCategory;
  title: string;
  description: string;
  badgeClass: string;
  icon: React.ReactNode;
}

const GROUP_CONFIGS: GroupConfig[] = [
  {
    key: "OVERDUE",
    title: "Overdue",
    description: "Deadlines and events that have passed",
    badgeClass: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-900/50",
    icon: <AlertCircle className="h-4 w-4 text-[var(--accent-danger)]" />,
  },
  {
    key: "TODAY",
    title: "Today",
    description: "Scheduled for today",
    badgeClass: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-900/50",
    icon: <Clock className="h-4 w-4 text-[var(--brand-primary)]" />,
  },
  {
    key: "TOMORROW",
    title: "Tomorrow",
    description: "Scheduled for tomorrow",
    badgeClass: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900/50",
    icon: <Calendar className="h-4 w-4 text-indigo-500" />,
  },
  {
    key: "THIS_WEEK",
    title: "This Week",
    description: "Upcoming within the next 7 days",
    badgeClass: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 dark:border-purple-900/50",
    icon: <CalendarDays className="h-4 w-4 text-purple-500" />,
  },
  {
    key: "UPCOMING",
    title: "Later",
    description: "Upcoming further in the semester",
    badgeClass: "bg-slate-100 text-slate-700 dark:bg-slate-800/80 dark:text-slate-300 border-slate-200 dark:border-slate-700",
    icon: <CalendarCheck className="h-4 w-4 text-slate-500" />,
  },
  {
    key: "COMPLETED",
    title: "Completed",
    description: "Finished exams, submissions, and tasks",
    badgeClass: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/50",
    icon: <CheckCircle2 className="h-4 w-4 text-[var(--accent-success)]" />,
  },
];

export function EventListView({
  events,
  onEdit,
  onComplete,
  onReopen,
  onDelete,
  onViewDetails,
  onQuickAdd,
}: EventListViewProps) {
  // Categorize events into groups
  const groupedEvents = React.useMemo(() => {
    const groups: Record<EventGroupCategory, EventWithDetails[]> = {
      OVERDUE: [],
      TODAY: [],
      TOMORROW: [],
      THIS_WEEK: [],
      UPCOMING: [],
      COMPLETED: [],
    };

    const now = new Date();

    for (const ev of events) {
      const category = categorizeEvent(ev.startTime, ev.isAllDay, ev.status, now);
      groups[category].push(ev);
    }

    return groups;
  }, [events]);

  if (events.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays className="h-8 w-8 text-[var(--brand-primary)]" />}
        title="No Events Found"
        description="There are no academic events or tasks matching your current filters. Add a new deadline or quiz to stay organized."
        action={
          <Button onClick={onQuickAdd} size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            Add First Event
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-8">
      {GROUP_CONFIGS.map((group) => {
        const groupItems = groupedEvents[group.key];
        if (groupItems.length === 0) return null;

        return (
          <section key={group.key} className="space-y-3">
            {/* Section Header */}
            <div className="flex items-center justify-between pb-1 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                {group.icon}
                <h2 className="font-semibold text-sm text-[var(--text-primary)]">
                  {group.title}
                </h2>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${group.badgeClass}`}
                >
                  {groupItems.length}
                </span>
              </div>
              <span className="text-xs text-[var(--text-muted)] hidden sm:inline">
                {group.description}
              </span>
            </div>

            {/* Grid of Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {groupItems.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onEdit={onEdit}
                  onComplete={onComplete}
                  onReopen={onReopen}
                  onDelete={onDelete}
                  onViewDetails={onViewDetails}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
