"use client";

import * as React from "react";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Button } from "../ui/button";
import {
  PRIMARY_EVENT_TYPE_OPTIONS,
  PRIORITY_OPTIONS,
} from "@/lib/constants/events";
import {
  Search,
  Plus,
  List,
  Calendar as CalendarIcon,
  SlidersHorizontal,
  X,
} from "lucide-react";

export type ViewMode = "list" | "calendar";

interface EventFilterBarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  selectedType: string;
  onSelectedTypeChange: (type: string) => void;
  selectedPriority: string;
  onSelectedPriorityChange: (priority: string) => void;
  selectedStatus: string;
  onSelectedStatusChange: (status: string) => void;
  sortBy: string;
  onSortByChange: (sort: string) => void;
  onQuickAdd: () => void;
  totalCount: number;
  filteredCount: number;
}

export function EventFilterBar({
  viewMode,
  onViewModeChange,
  searchQuery,
  onSearchQueryChange,
  selectedType,
  onSelectedTypeChange,
  selectedPriority,
  onSelectedPriorityChange,
  selectedStatus,
  onSelectedStatusChange,
  sortBy,
  onSortByChange,
  onQuickAdd,
  totalCount,
  filteredCount,
}: EventFilterBarProps) {
  const [showMobileFilters, setShowMobileFilters] = React.useState(false);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    selectedType !== "ALL" ||
    selectedPriority !== "ALL" ||
    selectedStatus !== "ALL";

  const clearFilters = () => {
    onSearchQueryChange("");
    onSelectedTypeChange("ALL");
    onSelectedPriorityChange("ALL");
    onSelectedStatusChange("ALL");
  };

  return (
    <div className="space-y-3">
      {/* Top Bar: Search, View Switch, Add Button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Search events, courses, keywords..."
            className="pl-9 pr-8 h-9 text-xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchQueryChange("")}
              className="absolute right-2.5 top-2.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* View Toggle & Action Buttons */}
        <div className="flex items-center gap-2 self-end sm:self-auto w-full sm:w-auto justify-between sm:justify-start">
          {/* Mobile Filter Toggle */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="sm:hidden text-xs h-9 flex items-center gap-1.5"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters {hasActiveFilters && "•"}
          </Button>

          {/* View Mode Toggle: List vs Calendar */}
          <div className="flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5">
            <button
              type="button"
              onClick={() => onViewModeChange("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                viewMode === "list"
                  ? "bg-[var(--brand-primary)] text-white shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>List</span>
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("calendar")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                viewMode === "calendar"
                  ? "bg-[var(--brand-primary)] text-white shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              <span>Calendar</span>
            </button>
          </div>

          {/* Primary Quick Add Button */}
          <Button
            type="button"
            onClick={onQuickAdd}
            className="text-xs h-9 shrink-0 flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            <span>Add Event</span>
          </Button>
        </div>
      </div>

      {/* Filter Row: Type, Priority, Status, Sort (Responsive) */}
      <div
        className={`${
          showMobileFilters ? "block" : "hidden sm:flex"
        } flex-wrap items-center gap-2.5 pt-1`}
      >
        {/* Type Filter */}
        <div className="w-full sm:w-40">
          <Select
            value={selectedType}
            onChange={(e) => onSelectedTypeChange(e.target.value)}
            className="h-8 text-xs py-1"
            options={[
              { value: "ALL", label: "All Event Types" },
              ...PRIMARY_EVENT_TYPE_OPTIONS,
            ]}
          />
        </div>

        {/* Priority Filter */}
        <div className="w-full sm:w-36">
          <Select
            value={selectedPriority}
            onChange={(e) => onSelectedPriorityChange(e.target.value)}
            className="h-8 text-xs py-1"
            options={[
              { value: "ALL", label: "All Priorities" },
              ...PRIORITY_OPTIONS,
            ]}
          />
        </div>

        {/* Status Filter */}
        <div className="w-full sm:w-36">
          <Select
            value={selectedStatus}
            onChange={(e) => onSelectedStatusChange(e.target.value)}
            className="h-8 text-xs py-1"
            options={[
              { value: "ALL", label: "All Status" },
              { value: "PENDING", label: "Pending" },
              { value: "OVERDUE", label: "Overdue" },
              { value: "COMPLETED", label: "Completed" },
            ]}
          />
        </div>

        {/* Sort By Filter (List View only) */}
        {viewMode === "list" && (
          <div className="w-full sm:w-36">
            <Select
              value={sortBy}
              onChange={(e) => onSortByChange(e.target.value)}
              className="h-8 text-xs py-1"
              options={[
                { value: "date-asc", label: "Date: Soonest" },
                { value: "date-desc", label: "Date: Latest" },
                { value: "priority", label: "Priority: High" },
                { value: "title", label: "Title: A-Z" },
              ]}
            />
          </div>
        )}

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-[var(--brand-primary)] hover:underline inline-flex items-center gap-1 py-1 cursor-pointer"
          >
            Clear Filters ({filteredCount} of {totalCount})
          </button>
        )}
      </div>
    </div>
  );
}
