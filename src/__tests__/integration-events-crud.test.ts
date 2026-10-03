import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createEvent,
  getEvents,
  getEventById,
  updateEvent,
  completeEvent,
  reopenEvent,
  deleteEvent,
} from "@/lib/actions/events";
import { hashPassword } from "@/lib/auth/password";
import { createSessionCookie } from "@/lib/auth/session";

describe("Event CRUD & Search Integration", () => {
  const testEmail = "events.alice@university.edu";
  const password = "Password123!";
  let userId = "";
  let semesterId = "";
  let subjectId = "";

  beforeAll(async () => {
    // Cleanup existing user
    await prisma.user.deleteMany({
      where: { email: testEmail },
    });

    const user = await prisma.user.create({
      data: {
        email: testEmail,
        passwordHash: await hashPassword(password),
        role: "STUDENT",
        profile: {
          create: {
            fullName: "Alice Eventer",
            currentSemester: 3,
          },
        },
        semesters: {
          create: {
            name: "Semester 3",
            semesterNumber: 3,
            status: "ACTIVE",
            subjects: {
              create: {
                name: "Database Management Systems",
                code: "CS301",
                creditHours: 4.0,
              },
            },
          },
        },
      },
      include: {
        semesters: {
          include: { subjects: true },
        },
      },
    });

    userId = user.id;
    semesterId = user.semesters[0].id;
    subjectId = user.semesters[0].subjects[0].id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: testEmail },
    });
  });

  let createdEventId = "";

  it("should create an event with time, subject association, and multiple reminders atomically", async () => {
    await createSessionCookie(userId, testEmail);

    const res = await createEvent({
      title: "DBMS Mid-Sem Exam",
      description: "Covers SQL, Normalization, and Relational Algebra",
      eventType: "EXAM",
      priority: "HIGH",
      date: "2026-10-15",
      time: "10:00",
      semesterId,
      subjectId,
      reminders: [
        { leadTimeMinutes: 1440 }, // 1 day before
        { leadTimeMinutes: 60 },   // 1 hour before
        { leadTimeMinutes: 1440 }, // Duplicate preset - should be deduplicated
      ],
    });

    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();

    if (res.data) {
      createdEventId = res.data.id;
      expect(res.data.title).toBe("DBMS Mid-Sem Exam");
      expect(res.data.eventType).toBe("EXAM");
      expect(res.data.priority).toBe("HIGH");
      expect(res.data.status).toBe("PENDING");
      expect(res.data.subjectId).toBe(subjectId);
      expect(res.data.subject?.code).toBe("CS301");
      // Reminders should be deduplicated from 3 to 2
      expect(res.data.reminders.length).toBe(2);
      expect(res.data.reminders.map((r) => r.leadTimeMinutes).sort((a, b) => a - b)).toEqual([60, 1440]);
    }
  });

  it("should create a date-only all-day event successfully", async () => {
    await createSessionCookie(userId, testEmail);

    const res = await createEvent({
      title: "College Tech Fest",
      date: "2026-10-25",
      isAllDay: true,
      eventType: "COLLEGE_EVENT",
      priority: "LOW",
    });

    expect(res.success).toBe(true);
    if (res.data) {
      expect(res.data.isAllDay).toBe(true);
      expect(res.data.title).toBe("College Tech Fest");
    }
  });

  it("should retrieve events with getEvents and getEventById", async () => {
    await createSessionCookie(userId, testEmail);

    const allEvents = await getEvents();
    expect(allEvents.length).toBeGreaterThanOrEqual(2);

    const fetched = await getEventById(createdEventId);
    expect(fetched).toBeDefined();
    expect(fetched?.title).toBe("DBMS Mid-Sem Exam");
    expect(fetched?.reminders.length).toBe(2);
  });

  it("should search events by title and subject code", async () => {
    await createSessionCookie(userId, testEmail);

    const titleSearch = await getEvents({ query: "Mid-Sem" });
    expect(titleSearch.some((e) => e.id === createdEventId)).toBe(true);

    const codeSearch = await getEvents({ query: "CS301" });
    expect(codeSearch.some((e) => e.id === createdEventId)).toBe(true);

    const noMatch = await getEvents({ query: "NonExistentKeyword999" });
    expect(noMatch.length).toBe(0);
  });

  it("should filter events by eventType, priority, and status", async () => {
    await createSessionCookie(userId, testEmail);

    const examOnly = await getEvents({ eventType: "EXAM" });
    expect(examOnly.every((e) => e.eventType === "EXAM")).toBe(true);

    const highPriority = await getEvents({ priority: "HIGH" });
    expect(highPriority.every((e) => e.priority === "HIGH")).toBe(true);

    const pendingOnly = await getEvents({ status: "PENDING" });
    expect(pendingOnly.some((e) => e.id === createdEventId)).toBe(true);
  });

  it("should update an event and synchronize its reminders", async () => {
    await createSessionCookie(userId, testEmail);

    const updateRes = await updateEvent({
      id: createdEventId,
      title: "DBMS Mid-Sem Exam (Postponed)",
      time: "11:30",
      reminders: [
        { leadTimeMinutes: 30 }, // Single 30-min reminder
      ],
    });

    expect(updateRes.success).toBe(true);
    if (updateRes.data) {
      expect(updateRes.data.title).toBe("DBMS Mid-Sem Exam (Postponed)");
      expect(updateRes.data.reminders.length).toBe(1);
      expect(updateRes.data.reminders[0].leadTimeMinutes).toBe(30);
    }
  });

  it("should complete an event and mark its scheduled reminders as COMPLETED", async () => {
    await createSessionCookie(userId, testEmail);

    const completeRes = await completeEvent(createdEventId);
    expect(completeRes.success).toBe(true);
    expect(completeRes.data?.status).toBe("COMPLETED");

    // Verify reminder status in database
    const reminders = await prisma.reminder.findMany({
      where: { eventId: createdEventId },
    });
    expect(reminders.every((r) => r.status === "COMPLETED")).toBe(true);
  });

  it("should reopen an event setting status back to PENDING", async () => {
    await createSessionCookie(userId, testEmail);

    const reopenRes = await reopenEvent(createdEventId);
    expect(reopenRes.success).toBe(true);
    expect(reopenRes.data?.status).toBe("PENDING");
  });

  it("should delete an event and cascade delete its reminders", async () => {
    await createSessionCookie(userId, testEmail);

    const delRes = await deleteEvent(createdEventId);
    expect(delRes.success).toBe(true);

    // Verify event is deleted
    const eventCheck = await prisma.event.findUnique({
      where: { id: createdEventId },
    });
    expect(eventCheck).toBeNull();

    // Verify reminders are deleted
    const reminderCheck = await prisma.reminder.findMany({
      where: { eventId: createdEventId },
    });
    expect(reminderCheck.length).toBe(0);
  });
});
