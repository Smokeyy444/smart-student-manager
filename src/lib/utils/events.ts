/**
 * Timezone-safe date and time utilities for Academic Events and Reminders.
 *
 * Rules:
 * 1. Date-only events are treated by their calendar date components (year, month, day)
 *    so UTC conversion does not shift "Oct 12" to "Oct 11" or "Oct 13".
 * 2. Events with times are parsed into local dates and stored as standard ISO timestamps.
 * 3. Reminder trigger times are calculated accurately relative to the event start timestamp.
 */

/**
 * Parses YYYY-MM-DD and optional HH:mm into a Date object.
 */
export function combineDateAndTime(
  dateStr: string,
  timeStr?: string | null,
  isAllDay: boolean = false
): Date {
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);

  if (isAllDay || !timeStr || timeStr.trim() === "") {
    // For date-only / all-day events, use midnight
    return new Date(year, month, day, 0, 0, 0, 0);
  }

  const [hoursStr, minutesStr] = timeStr.split(":");
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);

  return new Date(year, month, day, hours, minutes, 0, 0);
}

/**
 * Extracts YYYY-MM-DD from a Date object in local time.
 */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Extracts HH:mm (24-hour) from a Date object in local time.
 */
export function toLocalTimeString(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Formats a date for human readability: e.g. "Monday, Oct 12, 2026" or "Oct 12".
 */
export function formatHumanDate(dateInput: Date | string, includeYear = true): string {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
  };
  return d.toLocaleDateString("en-US", options);
}

/**
 * Formats a time string: e.g. "10:00 AM".
 */
export function formatHumanTime(dateInput: Date | string): string {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Returns a human-friendly relative date string:
 * "Today", "Tomorrow", "Yesterday", or "Monday, Oct 12"
 */
export function formatHumanRelativeDate(
  dateInput: Date | string,
  nowInput?: Date
): string {
  const target = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const now = nowInput || new Date();

  const targetDateOnly = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate()
  );
  const nowDateOnly = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const diffTime = targetDateOnly.getTime() - nowDateOnly.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) {
    return target.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }

  const isCurrentYear = target.getFullYear() === now.getFullYear();
  return target.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(isCurrentYear ? {} : { year: "numeric" }),
  });
}

export type EventGroupCategory =
  | "OVERDUE"
  | "TODAY"
  | "TOMORROW"
  | "THIS_WEEK"
  | "UPCOMING"
  | "COMPLETED";

/**
 * Categorizes an event into group sections:
 * OVERDUE, TODAY, TOMORROW, THIS_WEEK, UPCOMING, or COMPLETED.
 */
export function categorizeEvent(
  startTimeInput: Date | string,
  isAllDay: boolean,
  status: string,
  nowInput?: Date
): EventGroupCategory {
  if (status === "COMPLETED") {
    return "COMPLETED";
  }

  const start =
    typeof startTimeInput === "string"
      ? new Date(startTimeInput)
      : startTimeInput;
  const now = nowInput || new Date();

  const startDateOnly = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate()
  );
  const nowDateOnly = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const diffDays = Math.round(
    (startDateOnly.getTime() - nowDateOnly.getTime()) / (1000 * 60 * 60 * 24)
  );

  // If start date is before today
  if (diffDays < 0) {
    return "OVERDUE";
  }

  // If start date is today
  if (diffDays === 0) {
    if (!isAllDay && start.getTime() < now.getTime()) {
      return "OVERDUE";
    }
    return "TODAY";
  }

  // If start date is tomorrow
  if (diffDays === 1) {
    return "TOMORROW";
  }

  // If start date is in 2 to 7 days
  if (diffDays > 1 && diffDays <= 7) {
    return "THIS_WEEK";
  }

  return "UPCOMING";
}

/**
 * Calculates reminder trigger timestamp.
 */
export function calculateReminderTrigger(
  eventStartTime: Date,
  leadTimeMinutes: number
): Date {
  return new Date(eventStartTime.getTime() - leadTimeMinutes * 60 * 1000);
}
