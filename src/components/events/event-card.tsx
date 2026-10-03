"use client";

import * as React from "react";
import { type EventWithDetails } from "@/lib/actions/events";
import { EVENT_TYPES, PRIORITIES } from "@/lib/constants/events";
import {
  formatHumanDate,
  formatHumanTime,
  formatHumanRelativeDate,
} from "@/lib/utils/events";
import { ConfirmDialog } from "../ui/confirm-dialog";
import {
  Calendar,
  Clock,
  Bell,
  MoreVertical,
  Edit2,
  Trash2,
  CheckCircle2,
  RotateCcw,
  BookOpen,
  Flag,
} from "lucide-react";
import { Dropdown, DropdownItem } from "../ui/dropdown";

interface EventCardProps {
  event: EventWithDetails;
  onEdit: (event: EventWithDetails) => void;
  onComplete: (eventId: string) => void;
  onReopen: (eventId: string) => void;
  onDelete: (eventId: string) => void;
  onViewDetails: (event: EventWithDetails) => void;
}

export function EventCard({
  event,
  onEdit,
  onComplete,
  onReopen,
  onDelete,
  onViewDetails,
}: EventCardProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const isCompleted = event.status === "COMPLETED";

  const eventTypeConfig = EVENT_TYPES[event.eventType] || EVENT_TYPES.OTHER;
  const priorityConfig = PRIORITIES[event.priority] || PRIORITIES.MEDIUM;

  const startDate = new Date(event.startTime);
  const relativeDate = formatHumanRelativeDate(startDate);
  const formattedDate = formatHumanDate(startDate, false);
  const formattedTime = event.isAllDay ? "All Day" : formatHumanTime(startDate);

  const activeRemindersCount = event.reminders.length;

  return (
    <>
      <div
        className={`group relative flex flex-col justify-between rounded-xl border p-4 transition-all duration-200 shadow-xs hover:shadow-lg backdrop-blur-md ${
          isCompleted
            ? "border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 opacity-70"
            : "border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-luminous)]/40 hover:-translate-y-0.5"
        }`}
      >
        <div>
          {/* Top row: Checkbox, Event Type Badge, Priority Badge, Actions Menu */}
          <div className="flex items-start justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Completion Quick-Toggle Checkbox */}
              <button
                type="button"
                onClick={() => (isCompleted ? onReopen(event.id) : onComplete(event.id))}
                className={`flex h-5 w-5 items-center justify-center rounded-md border transition-colors cursor-pointer ${
                  isCompleted
                    ? "bg-[var(--accent-success)] border-[var(--accent-success)] text-white"
                    : "border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--brand-primary)] text-transparent"
                }`}
                aria-label={isCompleted ? "Reopen event" : "Mark event as completed"}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </button>

              {/* Event Type Badge */}
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${eventTypeConfig.colorClass}`}
              >
                {eventTypeConfig.label}
              </span>

              {/* Priority Indicator (Icon + Label to avoid relying only on color) */}
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${priorityConfig.badgeClass}`}
              >
                <Flag className="h-2.5 w-2.5" />
                <span>{priorityConfig.shortLabel}</span>
              </span>
            </div>

            {/* Actions Dropdown */}
            <Dropdown
              trigger={
                <button
                  type="button"
                  className="rounded-md p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition-colors cursor-pointer"
                  aria-label="Event options"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              }
            >
              {isCompleted ? (
                <DropdownItem onClick={() => onReopen(event.id)}>
                  <RotateCcw className="h-3.5 w-3.5 text-[var(--brand-primary)]" />
                  <span>Reopen Event</span>
                </DropdownItem>
              ) : (
                <DropdownItem onClick={() => onComplete(event.id)}>
                  <CheckCircle2 className="h-3.5 w-3.5 text-[var(--accent-success)]" />
                  <span>Mark Completed</span>
                </DropdownItem>
              )}
              <DropdownItem onClick={() => onEdit(event)}>
                <Edit2 className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                <span>Edit Event</span>
              </DropdownItem>
              <DropdownItem danger onClick={() => setDeleteConfirmOpen(true)}>
                <Trash2 className="h-3.5 w-3.5 text-[var(--accent-danger)]" />
                <span>Delete Event</span>
              </DropdownItem>
            </Dropdown>
          </div>

          {/* Title - clickable to view details */}
          <h3
            onClick={() => onViewDetails(event)}
            className={`font-semibold text-sm leading-snug cursor-pointer hover:text-[var(--brand-primary)] transition-colors line-clamp-2 ${
              isCompleted
                ? "line-through text-[var(--text-muted)]"
                : "text-[var(--text-primary)]"
            }`}
          >
            {event.title}
          </h3>

          {/* Subject tag if connected */}
          {event.subject && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-[var(--text-secondary)] font-medium">
              <BookOpen className="h-3.5 w-3.5 text-[var(--brand-primary)] shrink-0" />
              <span className="truncate">
                {event.subject.code ? `${event.subject.code} — ` : ""}
                {event.subject.name}
              </span>
            </div>
          )}

          {/* Description snippet if any */}
          {event.description && (
            <p className="text-xs text-[var(--text-muted)] mt-1.5 line-clamp-2 leading-relaxed">
              {event.description}
            </p>
          )}
        </div>

        {/* Footer: Date, Time & Reminder state */}
        <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1 font-medium text-[var(--text-primary)]">
              <Calendar className="h-3.5 w-3.5 text-[var(--brand-primary)]" />
              <span>{relativeDate}</span>
              <span className="text-[11px] text-[var(--text-muted)]">({formattedDate})</span>
            </span>

            <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
              <Clock className="h-3.5 w-3.5" />
              <span>{formattedTime}</span>
            </span>
          </div>

          {/* Reminder status badge */}
          {activeRemindersCount > 0 && (
            <div
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[10px] font-medium text-[var(--text-secondary)] shrink-0"
              title={`${activeRemindersCount} reminder(s) configured`}
            >
              <Bell className="h-3 w-3 text-[var(--brand-primary)]" />
              <span>{activeRemindersCount}</span>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Event"
        description={`Are you sure you want to delete "${event.title}"? Any scheduled reminders for this event will also be removed. This action cannot be undone.`}
        confirmText="Delete Event"
        variant="danger"
        onConfirm={() => onDelete(event.id)}
      />
    </>
  );
}
