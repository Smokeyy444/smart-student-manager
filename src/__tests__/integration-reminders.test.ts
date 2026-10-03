import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createEvent,
  getReminders,
  getDueRemindersCount,
  completeReminder,
  dismissReminder,
  dismissAllDueReminders,
} from "@/lib/actions/events";
import { hashPassword } from "@/lib/auth/password";
import { createSessionCookie } from "@/lib/auth/session";

describe("Reminder Subsystem & Due Detection Integration", () => {
  const studentAEmail = "reminders.alice@university.edu";
  const studentBEmail = "reminders.bob@university.edu";
  const password = "Password123!";

  let studentAId = "";
  let studentBId = "";
  let reminderScheduledId = "";
  let reminderDueId = "";

  beforeAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [studentAEmail, studentBEmail] } },
    });

    // Create Student A
    const userA = await prisma.user.create({
      data: {
        email: studentAEmail,
        passwordHash: await hashPassword(password),
        role: "STUDENT",
      },
    });
    studentAId = userA.id;

    // Create Student B
    const userB = await prisma.user.create({
      data: {
        email: studentBEmail,
        passwordHash: await hashPassword(password),
        role: "STUDENT",
      },
    });
    studentBId = userB.id;

    // Student A creates an event with upcoming reminder
    await createSessionCookie(studentAId, studentAEmail);
    const eventRes = await createEvent({
      title: "Data Science Project Demo",
      date: "2026-11-01",
      time: "14:00",
      reminders: [
        { leadTimeMinutes: 1440 }, // 1 day before
      ],
    });
    reminderScheduledId = eventRes.data!.reminders[0].id;

    // Directly insert an event with a DUE reminder (triggerAt 1 hour ago, event in future)
    const now = new Date();
    const pastTrigger = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago
    const futureEvent = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now

    const dueEvent = await prisma.event.create({
      data: {
        userId: studentAId,
        title: "Immediate Quiz Alert",
        startTime: futureEvent,
        eventType: "TEST",
        priority: "URGENT",
        status: "PENDING",
        reminders: {
          create: {
            triggerAt: pastTrigger,
            leadTimeMinutes: 180,
            status: "SCHEDULED",
          },
        },
      },
      include: { reminders: true },
    });
    reminderDueId = dueEvent.reminders[0].id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [studentAEmail, studentBEmail] } },
    });
  });

  it("should detect due reminders accurately with getReminders('DUE')", async () => {
    await createSessionCookie(studentAId, studentAEmail);

    const dueReminders = await getReminders("DUE");
    expect(dueReminders.length).toBeGreaterThanOrEqual(1);
    expect(dueReminders.some((r) => r.id === reminderDueId)).toBe(true);

    const dueReminder = dueReminders.find((r) => r.id === reminderDueId);
    expect(dueReminder?.isDue).toBe(true);
    expect(dueReminder?.event.title).toBe("Immediate Quiz Alert");
  });

  it("should count unacknowledged due reminders accurately for notification bell", async () => {
    await createSessionCookie(studentAId, studentAEmail);

    const count = await getDueRemindersCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("should return upcoming reminders with getReminders('UPCOMING')", async () => {
    await createSessionCookie(studentAId, studentAEmail);

    const upcoming = await getReminders("UPCOMING");
    expect(upcoming.some((r) => r.id === reminderScheduledId)).toBe(true);
  });

  it("should mark a reminder as COMPLETED", async () => {
    await createSessionCookie(studentAId, studentAEmail);

    const res = await completeReminder(reminderScheduledId);
    expect(res.success).toBe(true);

    const completed = await getReminders("COMPLETED");
    expect(completed.some((r) => r.id === reminderScheduledId)).toBe(true);
  });

  it("should dismiss a due reminder", async () => {
    await createSessionCookie(studentAId, studentAEmail);

    const res = await dismissReminder(reminderDueId);
    expect(res.success).toBe(true);

    const dismissed = await getReminders("DISMISSED");
    expect(dismissed.some((r) => r.id === reminderDueId)).toBe(true);
  });

  it("should dismiss all due reminders in bulk", async () => {
    await createSessionCookie(studentAId, studentAEmail);

    // Create another due reminder
    const now = new Date();
    await prisma.event.create({
      data: {
        userId: studentAId,
        title: "Bulk Test Event",
        startTime: new Date(now.getTime() + 3600000),
        reminders: {
          create: {
            triggerAt: new Date(now.getTime() - 10000),
            leadTimeMinutes: 60,
            status: "SCHEDULED",
          },
        },
      },
    });

    const bulkRes = await dismissAllDueReminders();
    expect(bulkRes.success).toBe(true);

    const dueAfter = await getReminders("DUE");
    expect(dueAfter.length).toBe(0);
  });

  it("should prevent Student B from modifying Student A's reminders", async () => {
    await createSessionCookie(studentBId, studentBEmail);

    const completeAttempt = await completeReminder(reminderScheduledId);
    expect(completeAttempt.success).toBe(false);
    expect(completeAttempt.error).toContain("Forbidden");

    const dismissAttempt = await dismissReminder(reminderScheduledId);
    expect(dismissAttempt.success).toBe(false);
    expect(dismissAttempt.error).toContain("Forbidden");
  });
});
