"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, CheckCircle2, ExternalLink, X, Clock } from "lucide-react";
import { Dropdown, DropdownItem, DropdownSeparator } from "../ui/dropdown";
import {
  getReminders,
  dismissReminder,
  type ReminderWithEvent,
} from "@/lib/actions/events";
import { formatHumanDate } from "@/lib/utils/events";
import { getLeadTimeLabel } from "@/lib/constants/events";
import { dispatchBrowserNotification } from "@/lib/notifications/browser";

export function NotificationBell() {
  const [dueReminders, setDueReminders] = React.useState<ReminderWithEvent[]>([]);
  const [hasNotified, setHasNotified] = React.useState(false);

  React.useEffect(() => {
    let isCancelled = false;

    async function load() {
      try {
        const active = await getReminders("DUE");
        if (!isCancelled) {
          setDueReminders(active);

          if (active.length > 0 && !hasNotified) {
            setHasNotified(true);
            const first = active[0];
            dispatchBrowserNotification({
              title: `Deadline Alert: ${first.event.title}`,
              body: `Reminder: ${getLeadTimeLabel(first.leadTimeMinutes)} for ${first.event.title}.`,
              tag: `reminder-${first.id}`,
            });
          }
        }
      } catch {
        // Quiet fail if unauthenticated
      }
    }

    load();
    const interval = setInterval(load, 60000);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [hasNotified]);

  const handleDismiss = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDueReminders((prev) => prev.filter((r) => r.id !== id));
    await dismissReminder(id);
  };

  const count = dueReminders.length;

  return (
    <Dropdown
      trigger={
        <button
          type="button"
          aria-label={`View notifications (${count} due)`}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition-colors cursor-pointer"
        >
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent-danger)] px-1 text-[10px] font-bold text-white shadow-xs">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </button>
      }
      className="w-80 sm:w-96"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)]">
        <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
          <Bell className="h-3.5 w-3.5 text-[var(--brand-primary)]" />
          Due Alerts & Reminders
        </span>
        {count > 0 && (
          <span className="text-[10px] font-semibold bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 px-1.5 py-0.5 rounded-full">
            {count} Due
          </span>
        )}
      </div>

      <div className="max-h-72 overflow-y-auto divide-y divide-[var(--border-subtle)]">
        {dueReminders.length === 0 ? (
          <div className="py-6 text-center text-xs text-[var(--text-muted)]">
            <CheckCircle2 className="h-6 w-6 text-[var(--accent-success)] mx-auto mb-1.5 opacity-80" />
            No due alerts right now! You are all caught up.
          </div>
        ) : (
          dueReminders.map((rem) => {
            const eventTime = new Date(rem.event.startTime);
            return (
              <div
                key={rem.id}
                className="p-3 hover:bg-[var(--bg-surface-elevated)] transition-colors flex items-start justify-between gap-2"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                      ● Due
                    </span>
                    <span className="text-[10px] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] px-1.5 py-0.2 rounded font-medium text-[var(--text-secondary)]">
                      {getLeadTimeLabel(rem.leadTimeMinutes)}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    {rem.event.title}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Event on {formatHumanDate(eventTime, false)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={(e) => handleDismiss(e, rem.id)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-sm cursor-pointer"
                  title="Dismiss alert"
                  aria-label="Dismiss alert"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      <DropdownSeparator />

      <Link href="/reminders">
        <DropdownItem>
          <ExternalLink className="h-4 w-4 text-[var(--brand-primary)]" />
          <span className="font-semibold text-xs text-[var(--brand-primary)]">
            Open Reminder Center
          </span>
        </DropdownItem>
      </Link>
    </Dropdown>
  );
}
