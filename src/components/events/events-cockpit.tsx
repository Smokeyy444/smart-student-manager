"use client";

import * as React from "react";
import {
  type EventWithDetails,
  completeEvent,
  reopenEvent,
  deleteEvent,
} from "@/lib/actions/events";
import { EventFilterBar, type ViewMode } from "./event-filter-bar";
import { EventListView } from "./event-list-view";
import { CalendarView } from "./calendar-view";
import { EventFormModal } from "./event-form-modal";
import { EventDetailModal } from "./event-detail-modal";
import { useToast } from "../ui/toast";

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

interface EventsCockpitProps {
  initialEvents: EventWithDetails[];
  semesters: SemesterWithSubjects[];
}

export function EventsCockpit({
  initialEvents,
  semesters,
}: EventsCockpitProps) {
  const { toast } = useToast();
  const [events, setEvents] = React.useState<EventWithDetails[]>(initialEvents);
  const [prevInitialEvents, setPrevInitialEvents] = React.useState(initialEvents);

  if (initialEvents !== prevInitialEvents) {
    setPrevInitialEvents(initialEvents);
    setEvents(initialEvents);
  }

  // View mode: 'list' or 'calendar'
  const [viewMode, setViewMode] = React.useState<ViewMode>("list");

  // Filters state
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedType, setSelectedType] = React.useState("ALL");
  const [selectedPriority, setSelectedPriority] = React.useState("ALL");
  const [selectedStatus, setSelectedStatus] = React.useState("ALL");
  const [sortBy, setSortBy] = React.useState("date-asc");

  // Modals state
  const [formModalOpen, setFormModalOpen] = React.useState(false);
  const [eventToEdit, setEventToEdit] = React.useState<EventWithDetails | null>(null);
  const [initialDateForCreate, setInitialDateForCreate] = React.useState<string | undefined>(undefined);

  const [detailModalOpen, setDetailModalOpen] = React.useState(false);
  const [selectedEventForDetail, setSelectedEventForDetail] = React.useState<EventWithDetails | null>(null);

  // Filtered and sorted events
  const filteredEvents = React.useMemo(() => {
    let result = [...events];
    const now = new Date();

    // Search query filter
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (ev) =>
          ev.title.toLowerCase().includes(q) ||
          (ev.description && ev.description.toLowerCase().includes(q)) ||
          (ev.subject && ev.subject.name.toLowerCase().includes(q)) ||
          (ev.subject?.code && ev.subject.code.toLowerCase().includes(q))
      );
    }

    // Event type filter
    if (selectedType !== "ALL") {
      result = result.filter((ev) => ev.eventType === selectedType);
    }

    // Priority filter
    if (selectedPriority !== "ALL") {
      result = result.filter((ev) => ev.priority === selectedPriority);
    }

    // Status filter
    if (selectedStatus === "PENDING") {
      result = result.filter((ev) => ev.status !== "COMPLETED");
    } else if (selectedStatus === "COMPLETED") {
      result = result.filter((ev) => ev.status === "COMPLETED");
    } else if (selectedStatus === "OVERDUE") {
      result = result.filter(
        (ev) =>
          ev.status !== "COMPLETED" && new Date(ev.startTime).getTime() < now.getTime()
      );
    }

    // Sorting
    result.sort((a, b) => {
      const timeA = new Date(a.startTime).getTime();
      const timeB = new Date(b.startTime).getTime();

      if (sortBy === "date-desc") {
        return timeB - timeA;
      }
      if (sortBy === "title") {
        return a.title.localeCompare(b.title);
      }
      if (sortBy === "priority") {
        const priorityOrder: Record<string, number> = {
          URGENT: 4,
          HIGH: 3,
          MEDIUM: 2,
          LOW: 1,
        };
        const pA = priorityOrder[a.priority] || 0;
        const pB = priorityOrder[b.priority] || 0;
        return pB - pA;
      }

      // Default: date-asc
      return timeA - timeB;
    });

    return result;
  }, [events, searchQuery, selectedType, selectedPriority, selectedStatus, sortBy]);

  // Handlers for Event Actions
  const handleComplete = async (eventId: string) => {
    // Optimistic update
    setEvents((prev) =>
      prev.map((ev) => (ev.id === eventId ? { ...ev, status: "COMPLETED" } : ev))
    );

    const res = await completeEvent(eventId);
    if (res.success && res.data) {
      setEvents((prev) =>
        prev.map((ev) => (ev.id === eventId ? res.data! : ev))
      );
      toast({
        title: "Event Completed",
        description: "Great job! Event marked as completed.",
        type: "success",
      });
    } else {
      // Revert on error
      setEvents(initialEvents);
      toast({
        title: "Action Failed",
        description: res.error || "Could not complete event.",
        type: "error",
      });
    }
  };

  const handleReopen = async (eventId: string) => {
    // Optimistic update
    setEvents((prev) =>
      prev.map((ev) => (ev.id === eventId ? { ...ev, status: "PENDING" } : ev))
    );

    const res = await reopenEvent(eventId);
    if (res.success && res.data) {
      setEvents((prev) =>
        prev.map((ev) => (ev.id === eventId ? res.data! : ev))
      );
      toast({
        title: "Event Reopened",
        description: "Event has been marked as active again.",
        type: "info",
      });
    } else {
      // Revert on error
      setEvents(initialEvents);
      toast({
        title: "Action Failed",
        description: res.error || "Could not reopen event.",
        type: "error",
      });
    }
  };

  const handleDelete = async (eventId: string) => {
    const target = events.find((e) => e.id === eventId);
    // Optimistic removal
    setEvents((prev) => prev.filter((ev) => ev.id !== eventId));

    const res = await deleteEvent(eventId);
    if (res.success) {
      toast({
        title: "Event Deleted",
        description: `"${target?.title || "Event"}" was deleted.`,
        type: "info",
      });
    } else {
      setEvents(initialEvents);
      toast({
        title: "Delete Failed",
        description: res.error || "Could not delete event.",
        type: "error",
      });
    }
  };

  const handleOpenEdit = (event: EventWithDetails) => {
    setEventToEdit(event);
    setInitialDateForCreate(undefined);
    setFormModalOpen(true);
  };

  const handleOpenQuickAdd = (dateStr?: string) => {
    setEventToEdit(null);
    setInitialDateForCreate(dateStr);
    setFormModalOpen(true);
  };

  const handleViewDetails = (event: EventWithDetails) => {
    setSelectedEventForDetail(event);
    setDetailModalOpen(true);
  };

  const handleFormSuccess = (savedEvent: EventWithDetails) => {
    setEvents((prev) => {
      const index = prev.findIndex((e) => e.id === savedEvent.id);
      if (index >= 0) {
        const copy = [...prev];
        copy[index] = savedEvent;
        return copy;
      }
      return [savedEvent, ...prev];
    });
  };

  return (
    <div className="space-y-6">
      {/* Filter and Control Bar */}
      <EventFilterBar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        selectedType={selectedType}
        onSelectedTypeChange={setSelectedType}
        selectedPriority={selectedPriority}
        onSelectedPriorityChange={setSelectedPriority}
        selectedStatus={selectedStatus}
        onSelectedStatusChange={setSelectedStatus}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        onQuickAdd={() => handleOpenQuickAdd()}
        totalCount={events.length}
        filteredCount={filteredEvents.length}
      />

      {/* Main Content Area */}
      {viewMode === "list" ? (
        <EventListView
          events={filteredEvents}
          onEdit={handleOpenEdit}
          onComplete={handleComplete}
          onReopen={handleReopen}
          onDelete={handleDelete}
          onViewDetails={handleViewDetails}
          onQuickAdd={() => handleOpenQuickAdd()}
        />
      ) : (
        <CalendarView
          events={filteredEvents}
          onEdit={handleOpenEdit}
          onComplete={handleComplete}
          onReopen={handleReopen}
          onDelete={handleDelete}
          onViewDetails={handleViewDetails}
          onAddOnDate={(dateStr) => handleOpenQuickAdd(dateStr)}
        />
      )}

      {/* Event Create / Edit Form Modal */}
      <EventFormModal
        open={formModalOpen}
        onOpenChange={setFormModalOpen}
        eventToEdit={eventToEdit}
        initialDate={initialDateForCreate}
        semesters={semesters}
        onSuccess={handleFormSuccess}
      />

      {/* Event Details View Modal */}
      <EventDetailModal
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        event={selectedEventForDetail}
        onEdit={handleOpenEdit}
        onComplete={handleComplete}
        onReopen={handleReopen}
        onDelete={handleDelete}
      />
    </div>
  );
}
