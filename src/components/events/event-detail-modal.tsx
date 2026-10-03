"use client";

import * as React from "react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { type EventWithDetails } from "@/lib/actions/events";
import { EVENT_TYPES, PRIORITIES, getLeadTimeLabel } from "@/lib/constants/events";
import {
  formatHumanDate,
  formatHumanTime,
  formatHumanRelativeDate,
} from "@/lib/utils/events";
import {
  Calendar,
  Clock,
  Bell,
  BookOpen,
  GraduationCap,
  Flag,
  CheckCircle2,
  RotateCcw,
  Edit2,
  Trash2,
} from "lucide-react";
import { ConfirmDialog } from "../ui/confirm-dialog";

interface EventDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: EventWithDetails | null;
  onEdit: (event: EventWithDetails) => void;
  onComplete: (eventId: string) => void;
  onReopen: (eventId: string) => void;
  onDelete: (eventId: string) => void;
}

export function EventDetailModal({
  open,
  onOpenChange,
  event,
  onEdit,
  onComplete,
  onReopen,
  onDelete,
}: EventDetailModalProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);

  if (!event) return null;

  const isCompleted = event.status === "COMPLETED";
  const typeConfig = EVENT_TYPES[event.eventType] || EVENT_TYPES.OTHER;
  const priorityConfig = PRIORITIES[event.priority] || PRIORITIES.MEDIUM;

  const startDate = new Date(event.startTime);
  const relativeDate = formatHumanRelativeDate(startDate);
  const formattedDate = formatHumanDate(startDate, true);
  const formattedTime = event.isAllDay ? "All Day" : formatHumanTime(startDate);

  let formattedEndDate: string | null = null;
  if (event.endTime) {
    const endDate = new Date(event.endTime);
    formattedEndDate = `${formatHumanDate(endDate, true)} at ${formatHumanTime(endDate)}`;
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange} className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold border ${typeConfig.colorClass}`}
            >
              {typeConfig.label}
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${priorityConfig.badgeClass}`}
            >
              <Flag className="h-3 w-3" />
              <span>{priorityConfig.label}</span>
            </span>
            {isCompleted && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50">
                <CheckCircle2 className="h-3 w-3" /> Completed
              </span>
            )}
          </div>
          <DialogTitle className="text-xl font-bold">{event.title}</DialogTitle>
          <DialogDescription className="text-xs">
            {relativeDate} ({formattedDate}) • {formattedTime}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          {/* Schedule Info */}
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/40 p-3.5 space-y-2">
            <div className="flex items-start gap-2.5 text-xs text-[var(--text-secondary)]">
              <Calendar className="h-4 w-4 text-[var(--brand-primary)] shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-[var(--text-primary)]">Starts</p>
                <p>
                  {formattedDate} {event.isAllDay ? "(All Day)" : `at ${formattedTime}`}
                </p>
              </div>
            </div>

            {formattedEndDate && (
              <div className="flex items-start gap-2.5 text-xs text-[var(--text-secondary)] pt-2 border-t border-[var(--border-subtle)]">
                <Clock className="h-4 w-4 text-[var(--brand-primary)] shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-[var(--text-primary)]">Ends</p>
                  <p>{formattedEndDate}</p>
                </div>
              </div>
            )}
          </div>

          {/* Academic Associations: Semester & Subject */}
          {(event.subject || event.semester) && (
            <div className="rounded-lg border border-[var(--border-subtle)] p-3.5 space-y-2 text-xs">
              <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Academic Association
              </p>
              {event.semester && (
                <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                  <GraduationCap className="h-4 w-4 text-[var(--brand-primary)]" />
                  <span>{event.semester.name}</span>
                </div>
              )}
              {event.subject && (
                <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                  <BookOpen className="h-4 w-4 text-[var(--brand-primary)]" />
                  <span className="font-medium text-[var(--text-primary)]">
                    {event.subject.code ? `[${event.subject.code}] ` : ""}
                    {event.subject.name}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Notes & Description
              </p>
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-xs leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap">
                {event.description}
              </div>
            </div>
          )}

          {/* Reminders List */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5 text-[var(--brand-primary)]" />
              Scheduled Reminders ({event.reminders.length})
            </p>
            {event.reminders.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {event.reminders.map((rem) => {
                  const triggerTime = new Date(rem.triggerAt);
                  return (
                    <div
                      key={rem.id}
                      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-2.5 text-xs"
                    >
                      <p className="font-semibold text-[var(--text-primary)]">
                        {getLeadTimeLabel(rem.leadTimeMinutes)}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {formatHumanDate(triggerTime, false)} at {formatHumanTime(triggerTime)}
                      </p>
                      <p className="text-[10px] text-[var(--brand-primary)] font-medium mt-1 uppercase">
                        Status: {rem.status}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-muted)] italic">
                No reminders scheduled for this event.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 justify-between">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                onEdit(event);
              }}
            >
              <Edit2 className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-[var(--accent-danger)] hover:bg-[var(--accent-danger)]/10"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Delete
            </Button>
          </div>

          <div className="flex gap-2">
            {isCompleted ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onReopen(event.id);
                  onOpenChange(false);
                }}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Reopen Event
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onComplete(event.id);
                  onOpenChange(false);
                }}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                Mark Completed
              </Button>
            )}
          </div>
        </DialogFooter>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Event"
        description={`Are you sure you want to delete "${event.title}"?`}
        confirmText="Delete Event"
        variant="danger"
        onConfirm={() => {
          onDelete(event.id);
          onOpenChange(false);
        }}
      />
    </>
  );
}
