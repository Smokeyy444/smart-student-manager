import { describe, it, expect } from "vitest";
import {
  combineDateAndTime,
  toLocalDateString,
  toLocalTimeString,
  formatHumanRelativeDate,
  categorizeEvent,
  calculateReminderTrigger,
} from "@/lib/utils/events";

describe("Event Date and Time Utilities", () => {
  describe("combineDateAndTime", () => {
    it("should parse date-only into local midnight without timezone day shift", () => {
      const date = combineDateAndTime("2026-10-15", null, true);
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(9); // 0-indexed October
      expect(date.getDate()).toBe(15);
      expect(date.getHours()).toBe(0);
      expect(date.getMinutes()).toBe(0);
    });

    it("should parse date with time into local hours and minutes", () => {
      const date = combineDateAndTime("2026-10-15", "14:30", false);
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(9);
      expect(date.getDate()).toBe(15);
      expect(date.getHours()).toBe(14);
      expect(date.getMinutes()).toBe(30);
    });
  });

  describe("toLocalDateString and toLocalTimeString", () => {
    it("should extract YYYY-MM-DD format correctly", () => {
      const d = new Date(2026, 9, 8, 12, 0, 0);
      expect(toLocalDateString(d)).toBe("2026-10-08");
    });

    it("should extract HH:mm format correctly", () => {
      const d = new Date(2026, 9, 8, 9, 5, 0);
      expect(toLocalTimeString(d)).toBe("09:05");
    });
  });

  describe("formatHumanRelativeDate", () => {
    const fixedNow = new Date(2026, 9, 10, 12, 0, 0); // Oct 10, 2026

    it("should return 'Today' for events occurring on the same date", () => {
      const eventDate = new Date(2026, 9, 10, 18, 0, 0);
      expect(formatHumanRelativeDate(eventDate, fixedNow)).toBe("Today");
    });

    it("should return 'Tomorrow' for events occurring one day later", () => {
      const eventDate = new Date(2026, 9, 11, 10, 0, 0);
      expect(formatHumanRelativeDate(eventDate, fixedNow)).toBe("Tomorrow");
    });

    it("should return 'Yesterday' for events occurring one day earlier", () => {
      const eventDate = new Date(2026, 9, 9, 15, 0, 0);
      expect(formatHumanRelativeDate(eventDate, fixedNow)).toBe("Yesterday");
    });

    it("should return weekday name for events within 6 days", () => {
      const eventDate = new Date(2026, 9, 14, 10, 0, 0); // 4 days later (Wednesday)
      const res = formatHumanRelativeDate(eventDate, fixedNow);
      expect(res).toContain("Wednesday");
    });
  });

  describe("categorizeEvent", () => {
    const fixedNow = new Date(2026, 9, 10, 12, 0, 0); // Oct 10, 2026 at 12:00 PM

    it("should return 'COMPLETED' if event status is COMPLETED regardless of date", () => {
      const future = new Date(2026, 9, 20);
      expect(categorizeEvent(future, true, "COMPLETED", fixedNow)).toBe("COMPLETED");
    });

    it("should return 'OVERDUE' for past dates", () => {
      const past = new Date(2026, 9, 5, 10, 0, 0);
      expect(categorizeEvent(past, false, "PENDING", fixedNow)).toBe("OVERDUE");
    });

    it("should return 'OVERDUE' for events earlier today that already passed", () => {
      const earlierToday = new Date(2026, 9, 10, 9, 0, 0); // 9 AM when now is 12 PM
      expect(categorizeEvent(earlierToday, false, "PENDING", fixedNow)).toBe("OVERDUE");
    });

    it("should return 'TODAY' for events today later in the day", () => {
      const laterToday = new Date(2026, 9, 10, 16, 0, 0); // 4 PM
      expect(categorizeEvent(laterToday, false, "PENDING", fixedNow)).toBe("TODAY");
    });

    it("should return 'TOMORROW' for tomorrow's events", () => {
      const tomorrow = new Date(2026, 9, 11, 10, 0, 0);
      expect(categorizeEvent(tomorrow, false, "PENDING", fixedNow)).toBe("TOMORROW");
    });

    it("should return 'THIS_WEEK' for events within next 7 days", () => {
      const thisWeek = new Date(2026, 9, 14, 10, 0, 0);
      expect(categorizeEvent(thisWeek, false, "PENDING", fixedNow)).toBe("THIS_WEEK");
    });

    it("should return 'UPCOMING' for events further in the future", () => {
      const future = new Date(2026, 10, 25, 10, 0, 0);
      expect(categorizeEvent(future, false, "PENDING", fixedNow)).toBe("UPCOMING");
    });
  });

  describe("calculateReminderTrigger", () => {
    it("should calculate exact trigger time based on lead time minutes", () => {
      const eventStart = new Date(2026, 9, 10, 10, 0, 0); // 10:00 AM

      // 60 minutes prior = 9:00 AM
      const trigger60 = calculateReminderTrigger(eventStart, 60);
      expect(trigger60.getHours()).toBe(9);
      expect(trigger60.getMinutes()).toBe(0);

      // 1440 minutes prior = 1 day before at 10:00 AM
      const trigger1d = calculateReminderTrigger(eventStart, 1440);
      expect(trigger1d.getDate()).toBe(9);
      expect(trigger1d.getHours()).toBe(10);

      // 0 minutes prior = exact start time
      const trigger0 = calculateReminderTrigger(eventStart, 0);
      expect(trigger0.getTime()).toBe(eventStart.getTime());
    });
  });
});
