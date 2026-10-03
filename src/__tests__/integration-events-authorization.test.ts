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

describe("Event Multi-Tenancy & Authorization Security", () => {
  const studentAEmail = "auth.alice@university.edu";
  const studentBEmail = "auth.bob@university.edu";
  const password = "Password123!";

  let studentAId = "";
  let studentBId = "";
  let studentASemesterId = "";
  let studentASubjectId = "";
  let studentAEventId = "";

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
        semesters: {
          create: {
            name: "Semester 4",
            semesterNumber: 4,
            status: "ACTIVE",
            subjects: {
              create: {
                name: "Operating Systems",
                code: "CS401",
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

    studentAId = userA.id;
    studentASemesterId = userA.semesters[0].id;
    studentASubjectId = userA.semesters[0].subjects[0].id;

    // Create Student B
    const userB = await prisma.user.create({
      data: {
        email: studentBEmail,
        passwordHash: await hashPassword(password),
        role: "STUDENT",
      },
    });
    studentBId = userB.id;

    // Student A creates an event
    await createSessionCookie(studentAId, studentAEmail);
    const eventRes = await createEvent({
      title: "Alice's Secret Exam",
      date: "2026-10-20",
      time: "09:00",
      subjectId: studentASubjectId,
      semesterId: studentASemesterId,
    });
    studentAEventId = eventRes.data!.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [studentAEmail, studentBEmail] } },
    });
  });

  it("should prevent Student B from reading Student A's event by ID", async () => {
    await createSessionCookie(studentBId, studentBEmail);

    await expect(getEventById(studentAEventId)).rejects.toThrow("Forbidden");
  });

  it("should not return Student A's events in Student B's getEvents list", async () => {
    await createSessionCookie(studentBId, studentBEmail);

    const events = await getEvents();
    expect(events.some((e) => e.id === studentAEventId)).toBe(false);
  });

  it("should prevent Student B from updating Student A's event", async () => {
    await createSessionCookie(studentBId, studentBEmail);

    const res = await updateEvent({
      id: studentAEventId,
      title: "Hacked by Bob",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Forbidden");
  });

  it("should prevent Student B from completing Student A's event", async () => {
    await createSessionCookie(studentBId, studentBEmail);

    const res = await completeEvent(studentAEventId);
    expect(res.success).toBe(false);
    expect(res.error).toContain("Forbidden");
  });

  it("should prevent Student B from reopening Student A's event", async () => {
    await createSessionCookie(studentBId, studentBEmail);

    const res = await reopenEvent(studentAEventId);
    expect(res.success).toBe(false);
    expect(res.error).toContain("Forbidden");
  });

  it("should prevent Student B from deleting Student A's event", async () => {
    await createSessionCookie(studentBId, studentBEmail);

    const res = await deleteEvent(studentAEventId);
    expect(res.success).toBe(false);
    expect(res.error).toContain("Forbidden");
  });

  it("should prevent Student B from linking an event to Student A's subject", async () => {
    await createSessionCookie(studentBId, studentBEmail);

    const res = await createEvent({
      title: "Bob's Malicious Event",
      date: "2026-10-22",
      subjectId: studentASubjectId, // Belongs to Student A
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Forbidden");
  });

  it("should prevent Student B from linking an event to Student A's semester", async () => {
    await createSessionCookie(studentBId, studentBEmail);

    const res = await createEvent({
      title: "Bob's Malicious Semester Event",
      date: "2026-10-22",
      semesterId: studentASemesterId, // Belongs to Student A
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Forbidden");
  });
});
