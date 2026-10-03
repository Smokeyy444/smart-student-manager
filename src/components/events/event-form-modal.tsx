"use client";

import * as React from "react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import {
  PRIMARY_EVENT_TYPE_OPTIONS,
  PRIORITY_OPTIONS,
  REMINDER_PRESETS,
  getLeadTimeLabel,
} from "@/lib/constants/events";
import {
  createEvent,
  updateEvent,
  type EventWithDetails,
} from "@/lib/actions/events";
import {
  type EventTypeValue,
  type PriorityValue,
} from "@/lib/validations/events";
import { useToast } from "../ui/toast";
import { toLocalDateString, toLocalTimeString } from "@/lib/utils/events";
import { Bell, Plus, X, Calendar as CalendarIcon, Clock, ChevronDown, ChevronUp } from "lucide-react";

interface SemesterWithSubjects {
  id: string;
  name: string;
  semesterNumber: number;
  subjects: {
    id: string;
    code: string | null;
    name: string;
  }[];
}

interface EventFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventToEdit?: EventWithDetails | null;
  initialDate?: string;
  semesters: SemesterWithSubjects[];
  onSuccess: (event: EventWithDetails) => void;
}

export function EventFormModal({
  open,
  onOpenChange,
  eventToEdit,
  initialDate,
  semesters,
  onSuccess,
}: EventFormModalProps) {
  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-xl">
      <DialogHeader>
        <DialogTitle>
          {eventToEdit ? "Edit Academic Event" : "Create New Event"}
        </DialogTitle>
        <DialogDescription>
          {eventToEdit
            ? "Update details, associated course, priority, and reminders."
            : "Quickly schedule an exam, assignment deadline, quiz, or task."}
        </DialogDescription>
      </DialogHeader>

      <EventFormInner
        key={eventToEdit ? eventToEdit.id : initialDate || "new"}
        eventToEdit={eventToEdit}
        initialDate={initialDate}
        semesters={semesters}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />
    </Dialog>
  );
}

interface EventFormInnerProps {
  eventToEdit?: EventWithDetails | null;
  initialDate?: string;
  semesters: SemesterWithSubjects[];
  onOpenChange: (open: boolean) => void;
  onSuccess: (event: EventWithDetails) => void;
}

function EventFormInner({
  eventToEdit,
  initialDate,
  semesters,
  onOpenChange,
  onSuccess,
}: EventFormInnerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  // Direct initializers from props without any useEffect
  const [title, setTitle] = React.useState(() => eventToEdit?.title || "");
  const [description, setDescription] = React.useState(() => eventToEdit?.description || "");
  const [eventType, setEventType] = React.useState<EventTypeValue>(
    () => (eventToEdit?.eventType as EventTypeValue) || "EXAM"
  );
  const [priority, setPriority] = React.useState<PriorityValue>(
    () => (eventToEdit?.priority as PriorityValue) || "MEDIUM"
  );

  const [date, setDate] = React.useState(() => {
    if (eventToEdit) return toLocalDateString(new Date(eventToEdit.startTime));
    return initialDate || toLocalDateString(new Date());
  });

  const [time, setTime] = React.useState(() => {
    if (eventToEdit) {
      return eventToEdit.isAllDay ? "" : toLocalTimeString(new Date(eventToEdit.startTime));
    }
    return "10:00";
  });

  const [endDate, setEndDate] = React.useState(() => {
    if (eventToEdit?.endTime) return toLocalDateString(new Date(eventToEdit.endTime));
    return "";
  });

  const [endTime, setEndTime] = React.useState(() => {
    if (eventToEdit?.endTime && !eventToEdit.isAllDay) {
      return toLocalTimeString(new Date(eventToEdit.endTime));
    }
    return "";
  });

  const [isAllDay, setIsAllDay] = React.useState(() => eventToEdit?.isAllDay || false);
  const [semesterId, setSemesterId] = React.useState(() => eventToEdit?.semesterId || semesters[0]?.id || "");
  const [subjectId, setSubjectId] = React.useState(() => eventToEdit?.subjectId || "");
  const [selectedReminders, setSelectedReminders] = React.useState<number[]>(() => {
    if (eventToEdit) return eventToEdit.reminders.map((r) => r.leadTimeMinutes);
    return [1440]; // 1 day before default
  });

  const [customReminderMinutes, setCustomReminderMinutes] = React.useState("");
  const [showCustomReminder, setShowCustomReminder] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(() =>
    !!(eventToEdit?.description || eventToEdit?.endTime)
  );

  // Derived subjects based on selected semester
  const availableSubjects = React.useMemo(() => {
    if (!semesterId) {
      return semesters.flatMap((s) => s.subjects);
    }
    const sem = semesters.find((s) => s.id === semesterId);
    return sem?.subjects || [];
  }, [semesterId, semesters]);

  const handleSemesterChange = (newSemesterId: string) => {
    setSemesterId(newSemesterId);
    if (newSemesterId) {
      const sem = semesters.find((s) => s.id === newSemesterId);
      if (sem && !sem.subjects.some((s) => s.id === subjectId)) {
        setSubjectId("");
      }
    }
  };

  const handleSubjectChange = (newSubjectId: string) => {
    setSubjectId(newSubjectId);
    if (newSubjectId) {
      const parentSem = semesters.find((s) =>
        s.subjects.some((sub) => sub.id === newSubjectId)
      );
      if (parentSem && parentSem.id !== semesterId) {
        setSemesterId(parentSem.id);
      }
    }
  };

  const toggleReminder = (leadMinutes: number) => {
    setSelectedReminders((prev) =>
      prev.includes(leadMinutes)
        ? prev.filter((m) => m !== leadMinutes)
        : [...prev, leadMinutes]
    );
  };

  const addCustomReminder = () => {
    const mins = parseInt(customReminderMinutes, 10);
    if (!isNaN(mins) && mins >= 0) {
      if (!selectedReminders.includes(mins)) {
        setSelectedReminders((prev) => [...prev, mins]);
      }
      setCustomReminderMinutes("");
      setShowCustomReminder(false);
    }
  };

  const removeReminder = (leadMinutes: number) => {
    setSelectedReminders((prev) => prev.filter((m) => m !== leadMinutes));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    try {
      const remindersPayload = selectedReminders.map((minutes) => ({
        leadTimeMinutes: minutes,
      }));

      if (eventToEdit) {
        const res = await updateEvent({
          id: eventToEdit.id,
          title,
          description: description.trim() === "" ? null : description,
          eventType: eventType as EventTypeValue,
          priority: priority as PriorityValue,
          date,
          time: isAllDay ? "" : time,
          endDate: endDate.trim() === "" ? null : endDate,
          endTime: isAllDay ? "" : endTime,
          isAllDay,
          semesterId: semesterId.trim() === "" ? null : semesterId,
          subjectId: subjectId.trim() === "" ? null : subjectId,
          reminders: remindersPayload,
        });

        if (res.success && res.data) {
          toast({
            title: "Event Updated",
            description: `"${res.data.title}" was successfully updated.`,
            type: "success",
          });
          onSuccess(res.data);
          onOpenChange(false);
        } else {
          setErrors(res.fieldErrors || {});
          toast({
            title: "Update Failed",
            description: res.error || "Please check the form inputs.",
            type: "error",
          });
        }
      } else {
        const res = await createEvent({
          title,
          description: description.trim() === "" ? null : description,
          eventType: eventType as EventTypeValue,
          priority: priority as PriorityValue,
          date,
          time: isAllDay ? "" : time,
          endDate: endDate.trim() === "" ? null : endDate,
          endTime: isAllDay ? "" : endTime,
          isAllDay,
          semesterId: semesterId.trim() === "" ? null : semesterId,
          subjectId: subjectId.trim() === "" ? null : subjectId,
          reminders: remindersPayload,
        });

        if (res.success && res.data) {
          toast({
            title: "Event Created",
            description: `"${res.data.title}" was scheduled with ${remindersPayload.length} reminder(s).`,
            type: "success",
          });
          onSuccess(res.data);
          onOpenChange(false);
        } else {
          setErrors(res.fieldErrors || {});
          toast({
            title: "Creation Failed",
            description: res.error || "Please check the form inputs.",
            type: "error",
          });
        }
      }
    } catch (err) {
      console.error(err);
      toast({
        title: "Unexpected Error",
        description: "Something went wrong. Please try again.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
      {/* Title Input */}
      <div>
        <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
          Event Title <span className="text-[var(--accent-danger)]">*</span>
        </label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. DBMS Mid-Sem Exam, OS Project Submission"
          required
          autoFocus
        />
        {errors.title && (
          <p className="text-[11px] text-[var(--accent-danger)] mt-1">
            {errors.title[0]}
          </p>
        )}
      </div>

      {/* Event Type & Priority (Two-column) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
            Event Type
          </label>
          <Select
            value={eventType}
            onChange={(e) => setEventType(e.target.value as EventTypeValue)}
            options={PRIMARY_EVENT_TYPE_OPTIONS}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
            Priority
          </label>
          <Select
            value={priority}
            onChange={(e) => setPriority(e.target.value as PriorityValue)}
            options={PRIORITY_OPTIONS}
          />
        </div>
      </div>

      {/* Date and Time */}
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/50 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5 text-[var(--brand-primary)]" />
            Schedule & Timing
          </span>
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isAllDay}
              onChange={(e) => setIsAllDay(e.target.checked)}
              className="rounded border-[var(--border-subtle)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
            />
            All-Day / Date Only
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
              Event Date <span className="text-[var(--accent-danger)]">*</span>
            </label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
            {errors.date && (
              <p className="text-[11px] text-[var(--accent-danger)] mt-1">
                {errors.date[0]}
              </p>
            )}
          </div>

          {!isAllDay && (
            <div>
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Start Time
              </label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
              {errors.time && (
                <p className="text-[11px] text-[var(--accent-danger)] mt-1">
                  {errors.time[0]}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Semester & Subject Selection */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
            Semester (Optional)
          </label>
          <Select
            value={semesterId}
            onChange={(e) => handleSemesterChange(e.target.value)}
            options={[
              { value: "", label: "None / General" },
              ...semesters.map((s) => ({
                value: s.id,
                label: s.name,
              })),
            ]}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
            Subject (Optional)
          </label>
          <Select
            value={subjectId}
            onChange={(e) => handleSubjectChange(e.target.value)}
            options={[
              { value: "", label: "None / Not linked" },
              ...availableSubjects.map((sub) => ({
                value: sub.id,
                label: sub.code ? `${sub.code} - ${sub.name}` : sub.name,
              })),
            ]}
          />
        </div>
      </div>

      {/* Reminder Configuration Presets */}
      <div className="rounded-lg border border-[var(--border-subtle)] p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5 text-[var(--brand-primary)]" />
            Reminders & Notifications
          </span>
          <span className="text-[11px] text-[var(--text-muted)]">
            {selectedReminders.length} active
          </span>
        </div>

        {/* Quick preset chips */}
        <div className="flex flex-wrap gap-1.5">
          {REMINDER_PRESETS.map((preset) => {
            const isSelected = selectedReminders.includes(preset.leadTimeMinutes);
            return (
              <button
                key={preset.leadTimeMinutes}
                type="button"
                onClick={() => toggleReminder(preset.leadTimeMinutes)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer select-none ${
                  isSelected
                    ? "bg-[var(--brand-primary)]/15 border-[var(--brand-primary)] text-[var(--brand-primary)]"
                    : "bg-[var(--bg-surface-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {isSelected ? "✓ " : "+ "}
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Custom reminder toggle */}
        {showCustomReminder ? (
          <div className="flex items-center gap-2 pt-1">
            <Input
              type="number"
              min="0"
              placeholder="Minutes before event"
              value={customReminderMinutes}
              onChange={(e) => setCustomReminderMinutes(e.target.value)}
              className="w-44 text-xs h-8"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addCustomReminder}
            >
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowCustomReminder(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowCustomReminder(true)}
            className="text-[11px] text-[var(--brand-primary)] font-medium hover:underline inline-flex items-center gap-1 pt-1 cursor-pointer"
          >
            <Plus className="h-3 w-3" /> Add Custom Reminder
          </button>
        )}

        {/* Selected reminders pill list */}
        {selectedReminders.length > 0 && (
          <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold mr-1">
              Scheduled:
            </span>
            {selectedReminders.sort((a, b) => a - b).map((minutes) => (
              <span
                key={minutes}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
              >
                {getLeadTimeLabel(minutes)}
                <button
                  type="button"
                  onClick={() => removeReminder(minutes)}
                  className="text-[var(--text-muted)] hover:text-[var(--accent-danger)] cursor-pointer"
                  aria-label={`Remove reminder ${getLeadTimeLabel(minutes)}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Collapsible Advanced Options (End Date/Time, Description) */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium cursor-pointer py-1"
        >
          {showAdvanced ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" /> Hide Advanced Options
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" /> Show Advanced (End Time, Description)
            </>
          )}
        </button>

        {showAdvanced && (
          <div className="space-y-3 pt-2 animate-in fade-in duration-150">
            {/* Optional End Date & Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/30">
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  End Date (Optional)
                </label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
                {errors.endDate && (
                  <p className="text-[11px] text-[var(--accent-danger)] mt-1">
                    {errors.endDate[0]}
                  </p>
                )}
              </div>

              {!isAllDay && (
                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                    End Time (Optional)
                  </label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Description / Notes */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Description / Notes / Links
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add syllabus topics, room number, submission portal link, or prep notes..."
                rows={3}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--brand-primary)] focus:outline-hidden focus:ring-1 focus:ring-[var(--brand-primary)]"
              />
            </div>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading
            ? eventToEdit
              ? "Saving..."
              : "Creating..."
            : eventToEdit
            ? "Save Changes"
            : "Create Event"}
        </Button>
      </DialogFooter>
    </form>
  );
}
