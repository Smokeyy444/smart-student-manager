import { describe, it, expect } from "vitest";
import {
  createEventSchema,
  updateEventSchema,
  filterEventsSchema,
  reminderInputSchema,
} from "@/lib/validations/events";

describe("Event Validation Schemas", () => {
  describe("createEventSchema", () => {
    it("should accept valid event inputs with sensible defaults", () => {
      const valid = createEventSchema.safeParse({
        title: "DBMS Mid-Sem Exam",
        date: "2026-10-12",
        time: "10:00",
        eventType: "EXAM",
        priority: "HIGH",
      });

      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.title).toBe("DBMS Mid-Sem Exam");
        expect(valid.data.eventType).toBe("EXAM");
        expect(valid.data.priority).toBe("HIGH");
        expect(valid.data.isAllDay).toBe(false);
      }
    });

    it("should reject empty title or whitespace-only title", () => {
      const empty = createEventSchema.safeParse({
        title: "   ",
        date: "2026-10-12",
      });
      expect(empty.success).toBe(false);
      if (!empty.success) {
        expect(empty.error.flatten().fieldErrors.title).toBeDefined();
      }
    });

    it("should reject title exceeding 200 characters", () => {
      const longTitle = "A".repeat(201);
      const res = createEventSchema.safeParse({
        title: longTitle,
        date: "2026-10-12",
      });
      expect(res.success).toBe(false);
    });

    it("should support all required event types", () => {
      const types = [
        "EXAM",
        "TEST",
        "ASSIGNMENT",
        "PROJECT",
        "PRESENTATION",
        "COLLEGE_EVENT",
        "PERSONAL",
        "OTHER",
      ];

      for (const t of types) {
        const res = createEventSchema.safeParse({
          title: `Event of type ${t}`,
          date: "2026-10-12",
          eventType: t,
        });
        expect(res.success).toBe(true);
      }
    });

    it("should reject invalid event type", () => {
      const res = createEventSchema.safeParse({
        title: "Invalid Type",
        date: "2026-10-12",
        eventType: "UNKNOWN_TYPE",
      });
      expect(res.success).toBe(false);
    });

    it("should support priority levels LOW, MEDIUM, HIGH, URGENT", () => {
      for (const p of ["LOW", "MEDIUM", "HIGH", "URGENT"]) {
        const res = createEventSchema.safeParse({
          title: "Priority Test",
          date: "2026-10-12",
          priority: p,
        });
        expect(res.success).toBe(true);
      }
    });

    it("should reject invalid date format", () => {
      const res = createEventSchema.safeParse({
        title: "Date Test",
        date: "12-10-2026", // Not YYYY-MM-DD
      });
      expect(res.success).toBe(false);
    });

    it("should reject invalid time format", () => {
      const res = createEventSchema.safeParse({
        title: "Time Test",
        date: "2026-10-12",
        time: "25:70", // Invalid hours and minutes
      });
      expect(res.success).toBe(false);
    });

    it("should reject when end date precedes start date", () => {
      const res = createEventSchema.safeParse({
        title: "Reverse dates",
        date: "2026-10-12",
        endDate: "2026-10-10",
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.flatten().fieldErrors.endDate).toBeDefined();
      }
    });

    it("should reject when end time precedes start time on the same date", () => {
      const res = createEventSchema.safeParse({
        title: "Reverse time on same date",
        date: "2026-10-12",
        time: "14:00",
        endDate: "2026-10-12",
        endTime: "11:00",
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.flatten().fieldErrors.endDate).toBeDefined();
      }
    });

    it("should accept valid date-only event with isAllDay: true", () => {
      const res = createEventSchema.safeParse({
        title: "College Holiday",
        date: "2026-10-15",
        isAllDay: true,
        eventType: "COLLEGE_EVENT",
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.isAllDay).toBe(true);
      }
    });
  });

  describe("reminderInputSchema", () => {
    it("should accept non-negative lead time minutes", () => {
      const res = reminderInputSchema.safeParse({
        leadTimeMinutes: 60,
      });
      expect(res.success).toBe(true);
    });

    it("should reject negative lead time minutes", () => {
      const res = reminderInputSchema.safeParse({
        leadTimeMinutes: -10,
      });
      expect(res.success).toBe(false);
    });
  });

  describe("updateEventSchema", () => {
    it("should require event id", () => {
      const res = updateEventSchema.safeParse({
        title: "Updated",
      });
      expect(res.success).toBe(false);
    });

    it("should accept partial updates with valid id", () => {
      const res = updateEventSchema.safeParse({
        id: "evt_123",
        status: "COMPLETED",
      });
      expect(res.success).toBe(true);
    });
  });

  describe("filterEventsSchema", () => {
    it("should apply default status ALL and date-asc sort", () => {
      const res = filterEventsSchema.safeParse({});
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.status).toBe("ALL");
        expect(res.data.sortBy).toBe("date-asc");
      }
    });

    it("should accept valid query, priority, and date range filters", () => {
      const res = filterEventsSchema.safeParse({
        query: "DBMS",
        priority: "HIGH",
        status: "PENDING",
        sortBy: "priority",
      });
      expect(res.success).toBe(true);
    });
  });
});
