"use server";

import { prisma } from "../prisma";
import { getCurrentUser, requireAuth, assertUserOwnsRecord } from "../auth/guards";
import {
  createEventSchema,
  updateEventSchema,
  filterEventsSchema,
  type CreateEventInput,
  type UpdateEventInput,
  type FilterEventsInput,
} from "../validations/events";
import {
  combineDateAndTime,
  calculateReminderTrigger,
} from "../utils/events";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./auth";
import type {
  Event as PrismaEvent,
  Reminder as PrismaReminder,
  EventType,
  Priority,
  EventStatus,
  ReminderStatus,
} from "@prisma/client";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Graceful fallback when executed outside Next.js request context (e.g. tests)
  }
}

export type EventWithDetails = PrismaEvent & {
  subject: {
    id: string;
    code: string | null;
    name: string;
    semester: {
      id: string;
      name: string;
      semesterNumber: number;
    };
  } | null;
  semester: {
    id: string;
    name: string;
    semesterNumber: number;
  } | null;
  reminders: PrismaReminder[];
};

export type ReminderWithEvent = PrismaReminder & {
  event: PrismaEvent & {
    subject: {
      id: string;
      code: string | null;
      name: string;
    } | null;
  };
  isDue: boolean;
};

/**
 * Creates an event with optional multiple reminders atomically.
 */
export async function createEvent(
  input: CreateEventInput
): Promise<ActionResult<EventWithDetails>> {
  const user = await requireAuth();

  const validation = createEventSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: "Validation failed. Please check the form fields.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const {
    title,
    description,
    eventType,
    priority,
    date,
    time,
    endDate,
    endTime,
    isAllDay,
    semesterId,
    subjectId,
    reminders,
  } = validation.data;

  try {
    // Verify subject ownership if subjectId is specified
    let verifiedSemesterId: string | null = semesterId || null;
    if (subjectId && subjectId.trim() !== "") {
      const subject = await prisma.subject.findUnique({
        where: { id: subjectId },
        include: { semester: true },
      });

      if (!subject) {
        return { success: false, error: "The selected subject does not exist." };
      }

      assertUserOwnsRecord(subject.semester.userId, user.id);
      // Automatically associate the subject's semester if not explicitly set
      if (!verifiedSemesterId) {
        verifiedSemesterId = subject.semesterId;
      }
    }

    // Verify semester ownership if semesterId is specified
    if (verifiedSemesterId && verifiedSemesterId.trim() !== "") {
      const semester = await prisma.semester.findUnique({
        where: { id: verifiedSemesterId },
      });

      if (!semester) {
        return { success: false, error: "The selected semester does not exist." };
      }

      assertUserOwnsRecord(semester.userId, user.id);
    }

    // Parse start and end timestamps safely
    const startTime = combineDateAndTime(date, time, isAllDay);
    const endTimestamp = endDate && endDate.trim() !== ""
      ? combineDateAndTime(endDate, endTime, isAllDay)
      : null;

    // Deduplicate reminders by leadTimeMinutes
    const uniqueRemindersMap = new Map<number, number>();
    if (reminders && reminders.length > 0) {
      for (const r of reminders) {
        if (!uniqueRemindersMap.has(r.leadTimeMinutes)) {
          uniqueRemindersMap.set(r.leadTimeMinutes, r.leadTimeMinutes);
        }
      }
    }

    const createdEvent = await prisma.$transaction(async (tx) => {
      const newEvent = await tx.event.create({
        data: {
          userId: user.id,
          title,
          description: description || null,
          eventType: eventType as EventType,
          priority: priority as Priority,
          status: "PENDING",
          startTime,
          endTime: endTimestamp,
          isAllDay: !!isAllDay,
          semesterId: verifiedSemesterId,
          subjectId: subjectId && subjectId.trim() !== "" ? subjectId : null,
        },
      });

      // Create reminders atomically if provided
      if (uniqueRemindersMap.size > 0) {
        const reminderData = Array.from(uniqueRemindersMap.values()).map(
          (leadMinutes) => ({
            eventId: newEvent.id,
            leadTimeMinutes: leadMinutes,
            triggerAt: calculateReminderTrigger(startTime, leadMinutes),
            status: "SCHEDULED" as ReminderStatus,
            channel: "IN_APP",
          })
        );

        for (const rem of reminderData) {
          await tx.reminder.create({ data: rem });
        }
      }

      return tx.event.findUniqueOrThrow({
        where: { id: newEvent.id },
        include: {
          subject: {
            include: { semester: true },
          },
          semester: true,
          reminders: {
            orderBy: { triggerAt: "asc" },
          },
        },
      });
    });

    safeRevalidate("/events");
    safeRevalidate("/reminders");
    safeRevalidate("/dashboard");

    return {
      success: true,
      data: createdEvent as EventWithDetails,
    };
  } catch (error) {
    console.error("Error creating event:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to create event.",
    };
  }
}

/**
 * Updates an existing event, verifying student ownership and relationships.
 */
export async function updateEvent(
  input: UpdateEventInput
): Promise<ActionResult<EventWithDetails>> {
  const user = await requireAuth();

  const validation = updateEventSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: "Validation failed. Please check the form fields.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { id, reminders, ...updateFields } = validation.data;

  try {
    const existing = await prisma.event.findUnique({
      where: { id },
      include: {
        subject: { include: { semester: true } },
        semester: true,
      },
    });

    if (!existing) {
      return { success: false, error: "Event not found." };
    }

    assertUserOwnsRecord(existing.userId, user.id);

    // Verify subject ownership if subjectId is provided or changed
    let verifiedSemesterId = updateFields.semesterId !== undefined
      ? updateFields.semesterId || null
      : existing.semesterId;

    if (updateFields.subjectId && updateFields.subjectId.trim() !== "") {
      const subject = await prisma.subject.findUnique({
        where: { id: updateFields.subjectId },
        include: { semester: true },
      });

      if (!subject) {
        return { success: false, error: "The selected subject does not exist." };
      }

      assertUserOwnsRecord(subject.semester.userId, user.id);
      if (!verifiedSemesterId) {
        verifiedSemesterId = subject.semesterId;
      }
    }

    // Verify semester ownership if semesterId is provided
    if (verifiedSemesterId && verifiedSemesterId.trim() !== "") {
      const semester = await prisma.semester.findUnique({
        where: { id: verifiedSemesterId },
      });

      if (!semester) {
        return { success: false, error: "The selected semester does not exist." };
      }

      assertUserOwnsRecord(semester.userId, user.id);
    }

    // Calculate dates
    let startTime = existing.startTime;
    if (updateFields.date) {
      const isAllDay = updateFields.isAllDay !== undefined
        ? updateFields.isAllDay
        : existing.isAllDay;
      startTime = combineDateAndTime(updateFields.date, updateFields.time, isAllDay);
    }

    let endTime = existing.endTime;
    if (updateFields.endDate !== undefined) {
      if (updateFields.endDate && updateFields.endDate.trim() !== "") {
        const isAllDay = updateFields.isAllDay !== undefined
          ? updateFields.isAllDay
          : existing.isAllDay;
        endTime = combineDateAndTime(updateFields.endDate, updateFields.endTime, isAllDay);
      } else {
        endTime = null;
      }
    }

    const updatedEvent = await prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id },
        data: {
          ...(updateFields.title && { title: updateFields.title }),
          ...(updateFields.description !== undefined && {
            description: updateFields.description || null,
          }),
          ...(updateFields.eventType && {
            eventType: updateFields.eventType as EventType,
          }),
          ...(updateFields.priority && {
            priority: updateFields.priority as Priority,
          }),
          ...(updateFields.status && {
            status: updateFields.status as EventStatus,
          }),
          startTime,
          endTime,
          ...(updateFields.isAllDay !== undefined && {
            isAllDay: updateFields.isAllDay,
          }),
          semesterId: verifiedSemesterId,
          subjectId: updateFields.subjectId !== undefined
            ? updateFields.subjectId && updateFields.subjectId.trim() !== ""
              ? updateFields.subjectId
              : null
            : existing.subjectId,
        },
      });

      // If reminders list is explicitly provided, synchronize reminders
      if (reminders !== undefined) {
        // Delete previous reminders
        await tx.reminder.deleteMany({
          where: { eventId: id },
        });

        // Deduplicate reminders by leadTimeMinutes
        const uniqueRemindersMap = new Map<number, number>();
        for (const r of reminders) {
          if (!uniqueRemindersMap.has(r.leadTimeMinutes)) {
            uniqueRemindersMap.set(r.leadTimeMinutes, r.leadTimeMinutes);
          }
        }

        for (const leadMinutes of uniqueRemindersMap.values()) {
          await tx.reminder.create({
            data: {
              eventId: id,
              leadTimeMinutes: leadMinutes,
              triggerAt: calculateReminderTrigger(startTime, leadMinutes),
              status: "SCHEDULED",
              channel: "IN_APP",
            },
          });
        }
      }

      return tx.event.findUniqueOrThrow({
        where: { id },
        include: {
          subject: { include: { semester: true } },
          semester: true,
          reminders: { orderBy: { triggerAt: "asc" } },
        },
      });
    });

    safeRevalidate("/events");
    safeRevalidate("/reminders");
    safeRevalidate("/dashboard");

    return {
      success: true,
      data: updatedEvent as EventWithDetails,
    };
  } catch (error) {
    console.error("Error updating event:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to update event.",
    };
  }
}

/**
 * Deletes an event and its cascading reminders after confirming student ownership.
 */
export async function deleteEvent(eventId: string): Promise<ActionResult> {
  const user = await requireAuth();

  try {
    const existing = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!existing) {
      return { success: false, error: "Event not found." };
    }

    assertUserOwnsRecord(existing.userId, user.id);

    await prisma.event.delete({
      where: { id: eventId },
    });

    safeRevalidate("/events");
    safeRevalidate("/reminders");
    safeRevalidate("/dashboard");

    return { success: true };
  } catch (error) {
    console.error("Error deleting event:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to delete event.",
    };
  }
}

/**
 * Marks an event as COMPLETED and completes its associated active reminders.
 */
export async function completeEvent(eventId: string): Promise<ActionResult<EventWithDetails>> {
  const user = await requireAuth();

  try {
    const existing = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!existing) {
      return { success: false, error: "Event not found." };
    }

    assertUserOwnsRecord(existing.userId, user.id);

    const updated = await prisma.$transaction(async (tx) => {
      const ev = await tx.event.update({
        where: { id: eventId },
        data: { status: "COMPLETED" },
        include: {
          subject: { include: { semester: true } },
          semester: true,
          reminders: true,
        },
      });

      // Mark scheduled/due reminders as COMPLETED
      await tx.reminder.updateMany({
        where: {
          eventId,
          status: { in: ["SCHEDULED", "DUE", "TRIGGERED"] },
        },
        data: { status: "COMPLETED" },
      });

      return ev;
    });

    safeRevalidate("/events");
    safeRevalidate("/reminders");
    safeRevalidate("/dashboard");

    return { success: true, data: updated as EventWithDetails };
  } catch (error) {
    console.error("Error completing event:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to complete event.",
    };
  }
}

/**
 * Reopens an event, setting status back to PENDING.
 */
export async function reopenEvent(eventId: string): Promise<ActionResult<EventWithDetails>> {
  const user = await requireAuth();

  try {
    const existing = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!existing) {
      return { success: false, error: "Event not found." };
    }

    assertUserOwnsRecord(existing.userId, user.id);

    const updated = await prisma.event.update({
      where: { id: eventId },
      data: { status: "PENDING" },
      include: {
        subject: { include: { semester: true } },
        semester: true,
        reminders: true,
      },
    });

    safeRevalidate("/events");
    safeRevalidate("/reminders");
    safeRevalidate("/dashboard");

    return { success: true, data: updated as EventWithDetails };
  } catch (error) {
    console.error("Error reopening event:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to reopen event.",
    };
  }
}

/**
 * Fetches events belonging to the authenticated student, supporting search, filters, and sort.
 */
export async function getEvents(
  filters?: FilterEventsInput
): Promise<EventWithDetails[]> {
  const user = await requireAuth();

  const validated = filterEventsSchema.safeParse(filters || {});
  const { query, eventType, priority, status, semesterId, subjectId, from, to, sortBy } =
    validated.success ? validated.data : ({} as FilterEventsInput);

  // Build Prisma where clause strictly isolated to user.id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    userId: user.id,
  };

  // Search filter across title, description, subject name, subject code
  if (query && query.trim() !== "") {
    const q = query.trim();
    where.OR = [
      { title: { contains: q } },
      { description: { contains: q } },
      { subject: { name: { contains: q } } },
      { subject: { code: { contains: q } } },
    ];
  }

  // Event Type filter
  if (eventType && eventType !== "ALL") {
    where.eventType = eventType;
  }

  // Priority filter
  if (priority && priority !== "ALL") {
    where.priority = priority;
  }

  // Completion status filter
  const now = new Date();
  if (status === "PENDING") {
    where.status = { not: "COMPLETED" };
  } else if (status === "COMPLETED") {
    where.status = "COMPLETED";
  } else if (status === "OVERDUE") {
    where.status = { not: "COMPLETED" };
    where.startTime = { lt: now };
  }

  // Semester filter
  if (semesterId && semesterId.trim() !== "" && semesterId !== "ALL") {
    where.semesterId = semesterId;
  }

  // Subject filter
  if (subjectId && subjectId.trim() !== "" && subjectId !== "ALL") {
    where.subjectId = subjectId;
  }

  // Date range filter
  if (from || to) {
    where.startTime = {};
    if (from) where.startTime.gte = new Date(from);
    if (to) where.startTime.lte = new Date(to);
  }

  // Sort order
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let orderBy: any = { startTime: "asc" };
  if (sortBy === "date-desc") {
    orderBy = { startTime: "desc" };
  } else if (sortBy === "title") {
    orderBy = { title: "asc" };
  } else if (sortBy === "priority") {
    orderBy = { priority: "desc" };
  }

  const events = await prisma.event.findMany({
    where,
    orderBy,
    include: {
      subject: {
        include: { semester: true },
      },
      semester: true,
      reminders: {
        orderBy: { triggerAt: "asc" },
      },
    },
  });

  return events as EventWithDetails[];
}

/**
 * Fetches a single event by ID, asserting authenticated ownership.
 */
export async function getEventById(
  eventId: string
): Promise<EventWithDetails | null> {
  const user = await requireAuth();

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      subject: {
        include: { semester: true },
      },
      semester: true,
      reminders: {
        orderBy: { triggerAt: "asc" },
      },
    },
  });

  if (!event) return null;

  assertUserOwnsRecord(event.userId, user.id);
  return event as EventWithDetails;
}

/**
 * Fetches semesters and subjects belonging to current student for select dropdowns.
 */
export async function getUserSemestersAndSubjects() {
  const user = await requireAuth();

  const semesters = await prisma.semester.findMany({
    where: { userId: user.id },
    orderBy: { semesterNumber: "asc" },
    include: {
      subjects: {
        orderBy: { name: "asc" },
      },
    },
  });

  return semesters;
}

/**
 * Fetches reminders for the authenticated student.
 */
export async function getReminders(
  categoryFilter?: "UPCOMING" | "DUE" | "OVERDUE" | "COMPLETED" | "DISMISSED" | "ALL"
): Promise<ReminderWithEvent[]> {
  const user = await requireAuth();
  const now = new Date();

  // Fetch reminders for events owned by this student
  const reminders = await prisma.reminder.findMany({
    where: {
      event: { userId: user.id },
    },
    orderBy: { triggerAt: "asc" },
    include: {
      event: {
        include: {
          subject: true,
        },
      },
    },
  });

  const remindersWithDue = reminders.map((r) => {
    const isDue =
      r.status === "SCHEDULED" && new Date(r.triggerAt).getTime() <= now.getTime();
    return {
      ...r,
      isDue,
    };
  });

  if (!categoryFilter || categoryFilter === "ALL") {
    return remindersWithDue as ReminderWithEvent[];
  }

  if (categoryFilter === "DUE") {
    return remindersWithDue.filter(
      (r) =>
        r.status === "DUE" ||
        r.status === "TRIGGERED" ||
        (r.status === "SCHEDULED" && r.isDue && new Date(r.event.startTime).getTime() >= now.getTime())
    ) as ReminderWithEvent[];
  }

  if (categoryFilter === "OVERDUE") {
    return remindersWithDue.filter(
      (r) =>
        r.status !== "COMPLETED" &&
        r.status !== "DISMISSED" &&
        new Date(r.event.startTime).getTime() < now.getTime()
    ) as ReminderWithEvent[];
  }

  if (categoryFilter === "UPCOMING") {
    return remindersWithDue.filter(
      (r) =>
        r.status === "SCHEDULED" &&
        !r.isDue &&
        new Date(r.event.startTime).getTime() > now.getTime()
    ) as ReminderWithEvent[];
  }

  if (categoryFilter === "COMPLETED") {
    return remindersWithDue.filter(
      (r) => r.status === "COMPLETED" || r.event.status === "COMPLETED"
    ) as ReminderWithEvent[];
  }

  if (categoryFilter === "DISMISSED") {
    return remindersWithDue.filter(
      (r) => r.status === "DISMISSED"
    ) as ReminderWithEvent[];
  }

  return remindersWithDue as ReminderWithEvent[];
}

/**
 * Counts unacknowledged due reminders for the in-app notification bell.
 */
export async function getDueRemindersCount(): Promise<number> {
  const user = await getCurrentUser();
  if (!user) return 0;

  const now = new Date();

  // Find reminders where triggerAt <= now and status is SCHEDULED or DUE
  const count = await prisma.reminder.count({
    where: {
      event: {
        userId: user.id,
        status: { not: "COMPLETED" },
      },
      status: { in: ["SCHEDULED", "DUE", "TRIGGERED"] },
      triggerAt: { lte: now },
    },
  });

  return count;
}

/**
 * Marks a single reminder as COMPLETED.
 */
export async function completeReminder(reminderId: string): Promise<ActionResult> {
  const user = await requireAuth();

  try {
    const reminder = await prisma.reminder.findUnique({
      where: { id: reminderId },
      include: { event: true },
    });

    if (!reminder) {
      return { success: false, error: "Reminder not found." };
    }

    assertUserOwnsRecord(reminder.event.userId, user.id);

    await prisma.reminder.update({
      where: { id: reminderId },
      data: { status: "COMPLETED" },
    });

    safeRevalidate("/reminders");
    safeRevalidate("/events");
    safeRevalidate("/dashboard");

    return { success: true };
  } catch (error) {
    console.error("Error completing reminder:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to complete reminder.",
    };
  }
}

/**
 * Dismisses a single reminder.
 */
export async function dismissReminder(reminderId: string): Promise<ActionResult> {
  const user = await requireAuth();

  try {
    const reminder = await prisma.reminder.findUnique({
      where: { id: reminderId },
      include: { event: true },
    });

    if (!reminder) {
      return { success: false, error: "Reminder not found." };
    }

    assertUserOwnsRecord(reminder.event.userId, user.id);

    await prisma.reminder.update({
      where: { id: reminderId },
      data: { status: "DISMISSED" },
    });

    safeRevalidate("/reminders");
    safeRevalidate("/events");
    safeRevalidate("/dashboard");

    return { success: true };
  } catch (error) {
    console.error("Error dismissing reminder:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to dismiss reminder.",
    };
  }
}

/**
 * Dismisses all active/due reminders for the current student.
 */
export async function dismissAllDueReminders(): Promise<ActionResult> {
  const user = await requireAuth();
  const now = new Date();

  try {
    await prisma.reminder.updateMany({
      where: {
        event: { userId: user.id },
        status: { in: ["SCHEDULED", "DUE", "TRIGGERED"] },
        triggerAt: { lte: now },
      },
      data: { status: "DISMISSED" },
    });

    safeRevalidate("/reminders");
    safeRevalidate("/events");
    safeRevalidate("/dashboard");

    return { success: true };
  } catch (error) {
    console.error("Error dismissing all reminders:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to dismiss reminders.",
    };
  }
}
