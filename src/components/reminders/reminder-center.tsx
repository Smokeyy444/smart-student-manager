"use client";

import * as React from "react";
import Link from "next/link";
import {
  type ReminderWithEvent,
  completeReminder,
  dismissReminder,
  dismissAllDueReminders,
} from "@/lib/actions/events";
import { getLeadTimeLabel } from "@/lib/constants/events";
import { formatHumanDate, formatHumanTime } from "@/lib/utils/events";
import {
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  isBrowserNotificationSupported,
  dispatchBrowserNotification,
  type NotificationPermissionStatus,
} from "@/lib/notifications/browser";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { useToast } from "../ui/toast";
import {
  Bell,
  CheckCircle2,
  X,
  ExternalLink,
  Calendar,
  Clock,
  BookOpen,
  ShieldCheck,
  BellRing,
} from "lucide-react";

interface ReminderCenterProps {
  initialReminders: ReminderWithEvent[];
  browserNotificationsEnabledSetting: boolean;
}

type TabKey = "DUE" | "UPCOMING" | "OVERDUE" | "COMPLETED" | "DISMISSED" | "ALL";

const emptySubscribe = () => () => {};
function useMounted() {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export function ReminderCenter({
  initialReminders,
  browserNotificationsEnabledSetting,
}: ReminderCenterProps) {
  const { toast } = useToast();
  const [reminders, setReminders] = React.useState<ReminderWithEvent[]>(initialReminders);
  const [prevInitialReminders, setPrevInitialReminders] = React.useState(initialReminders);

  if (initialReminders !== prevInitialReminders) {
    setPrevInitialReminders(initialReminders);
    setReminders(initialReminders);
  }

  const [activeTab, setActiveTab] = React.useState<TabKey>("DUE");
  const isMounted = useMounted();
  const [userPermissionStatus, setUserPermissionStatus] =
    React.useState<NotificationPermissionStatus | null>(null);
  const permissionStatus =
    userPermissionStatus ?? (isMounted ? getBrowserNotificationPermission() : "default");
  const [loadingActionId, setLoadingActionId] = React.useState<string | null>(null);

  // Filter reminders by category
  const filteredReminders = React.useMemo(() => {
    switch (activeTab) {
      case "DUE":
        return reminders.filter(
          (r) =>
            r.status === "DUE" ||
            r.status === "TRIGGERED" ||
            (r.status === "SCHEDULED" && r.isDue && r.event.status !== "COMPLETED")
        );
      case "UPCOMING":
        return reminders.filter(
          (r) => r.status === "SCHEDULED" && !r.isDue && r.event.status !== "COMPLETED"
        );
      case "OVERDUE":
        return reminders.filter(
          (r) =>
            r.status !== "COMPLETED" &&
            r.status !== "DISMISSED" &&
            r.event.status !== "COMPLETED" &&
            r.isDue
        );
      case "COMPLETED":
        return reminders.filter(
          (r) => r.status === "COMPLETED" || r.event.status === "COMPLETED"
        );
      case "DISMISSED":
        return reminders.filter((r) => r.status === "DISMISSED");
      case "ALL":
      default:
        return reminders;
    }
  }, [reminders, activeTab]);

  const dueCount = React.useMemo(() => {
    return reminders.filter(
      (r) =>
        r.status === "DUE" ||
        r.status === "TRIGGERED" ||
        (r.status === "SCHEDULED" && r.isDue && r.event.status !== "COMPLETED")
    ).length;
  }, [reminders]);

  const handleRequestPermission = async () => {
    const status = await requestBrowserNotificationPermission();
    setUserPermissionStatus(status);
    if (status === "granted") {
      toast({
        title: "Permission Granted",
        description: "Browser notifications are now active for upcoming deadlines.",
        type: "success",
      });
      // Test notification
      dispatchBrowserNotification({
        title: "Smart Student Manager",
        body: "Browser alerts are configured for your upcoming academic events.",
      });
    } else if (status === "denied") {
      toast({
        title: "Permission Blocked",
        description:
          "Notification permission was denied. You can re-enable it in browser settings.",
        type: "warning",
      });
    }
  };

  const handleComplete = async (reminderId: string) => {
    setLoadingActionId(reminderId);
    setReminders((prev) =>
      prev.map((r) => (r.id === reminderId ? { ...r, status: "COMPLETED" } : r))
    );

    const res = await completeReminder(reminderId);
    setLoadingActionId(null);
    if (res.success) {
      toast({
        title: "Reminder Completed",
        description: "Reminder marked as completed.",
        type: "success",
      });
    } else {
      setReminders(initialReminders);
      toast({
        title: "Action Failed",
        description: res.error || "Could not complete reminder.",
        type: "error",
      });
    }
  };

  const handleDismiss = async (reminderId: string) => {
    setLoadingActionId(reminderId);
    setReminders((prev) =>
      prev.map((r) => (r.id === reminderId ? { ...r, status: "DISMISSED" } : r))
    );

    const res = await dismissReminder(reminderId);
    setLoadingActionId(null);
    if (res.success) {
      toast({
        title: "Reminder Dismissed",
        description: "Reminder has been dismissed.",
        type: "info",
      });
    } else {
      setReminders(initialReminders);
      toast({
        title: "Action Failed",
        description: res.error || "Could not dismiss reminder.",
        type: "error",
      });
    }
  };

  const handleDismissAll = async () => {
    setReminders((prev) =>
      prev.map((r) =>
        r.status === "DUE" || r.status === "TRIGGERED" || (r.status === "SCHEDULED" && r.isDue)
          ? { ...r, status: "DISMISSED" }
          : r
      )
    );

    const res = await dismissAllDueReminders();
    if (res.success) {
      toast({
        title: "All Due Reminders Dismissed",
        description: "Cleared all currently active reminder notifications.",
        type: "info",
      });
    } else {
      setReminders(initialReminders);
      toast({
        title: "Action Failed",
        description: res.error || "Could not dismiss reminders.",
        type: "error",
      });
    }
  };

  const tabs: { key: TabKey; label: string; badge?: number }[] = [
    { key: "DUE", label: "Due & Active", badge: dueCount },
    { key: "UPCOMING", label: "Upcoming" },
    { key: "OVERDUE", label: "Overdue" },
    { key: "COMPLETED", label: "Completed" },
    { key: "DISMISSED", label: "Dismissed" },
    { key: "ALL", label: "All Reminders" },
  ];

  return (
    <div className="space-y-6">
      {/* Browser Notification Banner / Capability Honesty */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="rounded-lg p-2 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] shrink-0 mt-0.5">
            <BellRing className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                Browser & Device Notifications
              </h3>
              {isMounted && permissionStatus === "granted" && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  <ShieldCheck className="h-3 w-3" /> Granted
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-2xl leading-relaxed">
              In-app reminders display notifications across the header and action center.
              Desktop browser notifications trigger locally while your browser is open.
              {browserNotificationsEnabledSetting ? " (Profile setting: enabled)" : " (Profile setting: disabled)"}
            </p>
          </div>
        </div>

        {isMounted && permissionStatus !== "granted" && isBrowserNotificationSupported() && (
          <Button
            type="button"
            size="sm"
            onClick={handleRequestPermission}
            className="shrink-0 text-xs"
          >
            Enable Browser Alerts
          </Button>
        )}
      </div>

      {/* Navigation Tabs and Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-2">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === tab.key
                  ? "bg-[var(--brand-primary)] text-white shadow-xs"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span>{tab.label}</span>
              {typeof tab.badge === "number" && tab.badge > 0 && (
                <span
                  className={`inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] font-bold ${
                    activeTab === tab.key
                      ? "bg-white text-[var(--brand-primary)]"
                      : "bg-[var(--accent-danger)] text-white"
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === "DUE" && dueCount > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDismissAll}
            className="text-xs shrink-0 self-end sm:self-auto"
          >
            Dismiss All Due
          </Button>
        )}
      </div>

      {/* Reminder Cards List */}
      {filteredReminders.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-8 w-8 text-[var(--brand-primary)]" />}
          title={`No ${tabs.find((t) => t.key === activeTab)?.label} Reminders`}
          description={
            activeTab === "DUE"
              ? "You have zero due alerts! All reminders are scheduled or completed."
              : "No reminder notifications match this category."
          }
          action={
            <Link href="/events">
              <Button size="sm">
                <Calendar className="h-4 w-4 mr-1.5" />
                Go to Events
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredReminders.map((rem) => {
            const triggerTime = new Date(rem.triggerAt);
            const eventTime = new Date(rem.event.startTime);
            const isDue =
              rem.status === "DUE" ||
              rem.status === "TRIGGERED" ||
              (rem.status === "SCHEDULED" && rem.isDue);

            return (
              <div
                key={rem.id}
                className={`rounded-xl border p-4 transition-all duration-150 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                  isDue && rem.status !== "COMPLETED" && rem.status !== "DISMISSED"
                    ? "border-[var(--brand-primary)]/50 bg-[var(--brand-primary)]/5 shadow-xs"
                    : rem.status === "COMPLETED" || rem.status === "DISMISSED"
                    ? "border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 opacity-70"
                    : "border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                }`}
              >
                {/* Left Details */}
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)]">
                      {getLeadTimeLabel(rem.leadTimeMinutes)}
                    </span>

                    {rem.status === "COMPLETED" && (
                      <span className="text-[11px] font-medium text-[var(--accent-success)]">
                        ✓ Completed
                      </span>
                    )}
                    {rem.status === "DISMISSED" && (
                      <span className="text-[11px] font-medium text-[var(--text-muted)]">
                        Dismissed
                      </span>
                    )}
                    {isDue &&
                      rem.status !== "COMPLETED" &&
                      rem.status !== "DISMISSED" && (
                        <span className="text-[11px] font-bold text-[var(--accent-danger)] animate-pulse">
                          ● Due Now
                        </span>
                      )}

                    {rem.event.subject && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)] font-medium">
                        <BookOpen className="h-3 w-3 text-[var(--brand-primary)]" />
                        {rem.event.subject.name}
                      </span>
                    )}
                  </div>

                  <h4 className="font-semibold text-sm text-[var(--text-primary)] truncate">
                    {rem.event.title}
                  </h4>

                  <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-[var(--brand-primary)]" />
                      Alert time: {formatHumanDate(triggerTime, false)} at{" "}
                      {formatHumanTime(triggerTime)}
                    </span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      Event on {formatHumanDate(eventTime, false)} at{" "}
                      {rem.event.isAllDay ? "All Day" : formatHumanTime(eventTime)}
                    </span>
                  </div>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  {rem.status !== "COMPLETED" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleComplete(rem.id)}
                      disabled={loadingActionId === rem.id}
                      className="text-xs h-8"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-[var(--accent-success)]" />
                      Complete
                    </Button>
                  )}

                  {rem.status !== "DISMISSED" && rem.status !== "COMPLETED" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDismiss(rem.id)}
                      disabled={loadingActionId === rem.id}
                      className="text-xs h-8 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Dismiss
                    </Button>
                  )}

                  <Link href={`/events`}>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-xs h-8"
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1 text-[var(--brand-primary)]" />
                      Open Event
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
