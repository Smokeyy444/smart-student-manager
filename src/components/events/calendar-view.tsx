"use client";

import * as React from "react";
import { type EventWithDetails } from "@/lib/actions/events";
import { EVENT_TYPES } from "@/lib/constants/events";
import {
  toLocalDateString,
  formatHumanDate,
} from "@/lib/utils/events";
import { EventCard } from "./event-card";
import { Button } from "../ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
} from "lucide-react";

interface CalendarViewProps {
  events: EventWithDetails[];
  onEdit: (event: EventWithDetails) => void;
  onComplete: (eventId: string) => void;
  onReopen: (eventId: string) => void;
  onDelete: (eventId: string) => void;
  onViewDetails: (event: EventWithDetails) => void;
  onAddOnDate: (dateStr: string) => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarView({
  events,
  onEdit,
  onComplete,
  onReopen,
  onDelete,
  onViewDetails,
  onAddOnDate,
}: CalendarViewProps) {
  // Calendar current view month and selected date
  const [currentDate, setCurrentDate] = React.useState(() => new Date());
  const [selectedDateStr, setSelectedDateStr] = React.useState(() =>
    toLocalDateString(new Date())
  );

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthName = currentDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDateStr(toLocalDateString(today));
  };

  // Map events by their local date string YYYY-MM-DD
  const eventsByDate = React.useMemo(() => {
    const map = new Map<string, EventWithDetails[]>();
    for (const ev of events) {
      const dateKey = toLocalDateString(new Date(ev.startTime));
      const existing = map.get(dateKey) || [];
      existing.push(ev);
      map.set(dateKey, existing);
    }
    return map;
  }, [events]);

  // Compute calendar grid days
  const calendarGrid = React.useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 = Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const cells: {
      date: Date;
      dateStr: string;
      isCurrentMonth: boolean;
      isToday: boolean;
    }[] = [];

    const todayStr = toLocalDateString(new Date());

    // Leading days from previous month
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      const prevDate = new Date(year, month - 1, daysInPrevMonth - i);
      const dateStr = toLocalDateString(prevDate);
      cells.push({
        date: prevDate,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
      });
    }

    // Days in current month
    for (let day = 1; day <= daysInMonth; day++) {
      const thisDate = new Date(year, month, day);
      const dateStr = toLocalDateString(thisDate);
      cells.push({
        date: thisDate,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
      });
    }

    // Trailing days for next month to complete the 35 or 42 grid cells
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let day = 1; day <= remaining; day++) {
      const nextDate = new Date(year, month + 1, day);
      const dateStr = toLocalDateString(nextDate);
      cells.push({
        date: nextDate,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
      });
    }

    return cells;
  }, [year, month]);

  const selectedDateEvents = eventsByDate.get(selectedDateStr) || [];
  const selectedDateObj = new Date(selectedDateStr + "T00:00:00");
  const formattedSelectedDate = formatHumanDate(selectedDateObj, true);

  return (
    <div className="space-y-6">
      {/* Calendar Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-surface)] p-4 rounded-xl border border-[var(--border-subtle)]">
        <div className="flex items-center gap-3">
          <CalendarIcon className="h-5 w-5 text-[var(--brand-primary)]" />
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            {monthName}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={goToToday}
            className="text-xs h-8"
          >
            Today
          </Button>

          <div className="flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="Previous month"
              className="p-1.5 hover:bg-[var(--bg-surface-elevated)] rounded-l-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="h-4 w-px bg-[var(--border-subtle)]" />
            <button
              type="button"
              onClick={nextMonth}
              aria-label="Next month"
              className="p-1.5 hover:bg-[var(--bg-surface-elevated)] rounded-r-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Monthly Grid */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-xs">
        {/* Day of Week Headers */}
        <div className="grid grid-cols-7 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-center text-xs font-semibold text-[var(--text-secondary)] py-2.5">
          {WEEKDAYS.map((day) => (
            <div key={day} className="truncate">
              {day}
            </div>
          ))}
        </div>

        {/* Date Cells Grid */}
        <div className="grid grid-cols-7 divide-x divide-y divide-[var(--border-subtle)]">
          {calendarGrid.map((cell) => {
            const dayEvents = eventsByDate.get(cell.dateStr) || [];
            const isSelected = cell.dateStr === selectedDateStr;

            return (
              <div
                key={cell.dateStr}
                onClick={() => setSelectedDateStr(cell.dateStr)}
                className={`min-h-[75px] sm:min-h-[100px] p-1.5 sm:p-2 transition-colors cursor-pointer flex flex-col justify-between ${
                  !cell.isCurrentMonth
                    ? "bg-[var(--bg-surface-elevated)]/30 text-[var(--text-muted)]"
                    : "bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)]/50"
                } ${
                  isSelected
                    ? "ring-2 ring-inset ring-[var(--brand-primary)] bg-[var(--brand-primary)]/5"
                    : ""
                }`}
              >
                {/* Cell Header: Day Number & Today Highlight */}
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      cell.isToday
                        ? "bg-[var(--brand-primary)] text-white shadow-xs"
                        : cell.isCurrentMonth
                        ? "text-[var(--text-primary)]"
                        : "text-[var(--text-muted)]"
                    }`}
                  >
                    {cell.date.getDate()}
                  </span>

                  {dayEvents.length > 0 && (
                    <span className="sm:hidden flex h-2 w-2 rounded-full bg-[var(--brand-primary)]" />
                  )}
                </div>

                {/* Event previews in calendar cell (desktop: mini chips, mobile: dots) */}
                <div className="mt-1 space-y-1 hidden sm:block overflow-hidden">
                  {dayEvents.slice(0, 2).map((ev) => {
                    const typeConfig = EVENT_TYPES[ev.eventType] || EVENT_TYPES.OTHER;
                    return (
                      <div
                        key={ev.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewDetails(ev);
                        }}
                        className={`truncate rounded px-1.5 py-0.5 text-[10px] font-medium border ${typeConfig.colorClass} hover:opacity-80 transition-opacity`}
                        title={ev.title}
                      >
                        {ev.title}
                      </div>
                    );
                  })}
                  {dayEvents.length > 2 && (
                    <span className="text-[10px] font-medium text-[var(--text-muted)] block pl-0.5">
                      +{dayEvents.length - 2} more
                    </span>
                  )}
                </div>

                {/* Mobile dots container */}
                <div className="flex sm:hidden gap-1 mt-1 flex-wrap">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <span
                      key={ev.id}
                      className="h-1.5 w-1.5 rounded-full bg-[var(--brand-primary)]"
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Date Inspector Section */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
          <div>
            <h3 className="font-bold text-base text-[var(--text-primary)]">
              {formattedSelectedDate}
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              {selectedDateEvents.length} event(s) scheduled on this day
            </p>
          </div>

          <Button
            type="button"
            size="sm"
            onClick={() => onAddOnDate(selectedDateStr)}
            className="text-xs"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add Event on This Date
          </Button>
        </div>

        {selectedDateEvents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
            {selectedDateEvents.map((event) => (
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
        ) : (
          <div className="py-8 text-center text-xs text-[var(--text-muted)]">
            No events scheduled on this date. Click &quot;+ Add Event on This Date&quot; to create one.
          </div>
        )}
      </div>
    </div>
  );
}
