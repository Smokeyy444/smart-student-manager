"use server";

import { prisma } from "../prisma";
import { getCurrentUser, assertUserOwnsRecord } from "../auth/guards";
import {
  aggregateAttendanceUpdateSchema,
  quickAttendanceUpdateSchema,
  resetAttendanceSchema,
  attendanceLogCreateSchema,
  attendanceLogUpdateSchema,
  type AggregateAttendanceUpdateInput,
  type QuickAttendanceUpdateInput,
  type ResetAttendanceInput,
  type AttendanceLogCreateInput,
  type AttendanceLogUpdateInput,
} from "../validations/attendance";
import { aggregateAttendanceLogs } from "../calculations/attendance";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./auth";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Graceful fallback when executed outside Next.js request context (e.g. unit/integration tests)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA LOADING
// ─────────────────────────────────────────────────────────────────────────────

export interface AttendanceSubjectData {
  id: string;
  name: string;
  code: string | null;
  creditHours: number;
  category: string;
  isAudit: boolean;
  customAttendanceTarget: number | null;
  semesterId: string;
  attendance: {
    id: string;
    classesAttended: number;
    classesConducted: number;
    lastUpdated: Date;
  } | null;
}

export interface AttendanceSemesterData {
  id: string;
  name: string;
  semesterNumber: number;
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  subjects: AttendanceSubjectData[];
}

export interface AttendancePageData {
  semesters: AttendanceSemesterData[];
  defaultAttendanceTarget: number;
  currentSemesterNumber: number;
}

/**
 * Loads all semesters, subjects, and attendance records for the attendance page.
 * Returns semesters ordered by semesterNumber ascending.
 */
export async function getAttendancePageData(): Promise<AttendancePageData | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const defaultTarget = user.settings?.defaultAttendanceTarget ?? 75.0;
  const currentSemesterNumber = user.profile?.currentSemester ?? 1;

  const semesters = await prisma.semester.findMany({
    where: { userId: user.id },
    orderBy: { semesterNumber: "asc" },
    include: {
      subjects: {
        orderBy: { createdAt: "asc" },
        include: {
          attendance: true,
        },
      },
    },
  });

  const semesterData: AttendanceSemesterData[] = semesters.map((sem) => ({
    id: sem.id,
    name: sem.name,
    semesterNumber: sem.semesterNumber,
    status: sem.status as "ACTIVE" | "COMPLETED" | "ARCHIVED",
    subjects: sem.subjects.map((sub) => ({
      id: sub.id,
      name: sub.name,
      code: sub.code,
      creditHours: sub.creditHours,
      category: sub.category as string,
      isAudit: sub.isAudit,
      customAttendanceTarget: sub.customAttendanceTarget,
      semesterId: sub.semesterId,
      attendance: sub.attendance
        ? {
            id: sub.attendance.id,
            classesAttended: sub.attendance.classesAttended,
            classesConducted: sub.attendance.classesConducted,
            lastUpdated: sub.attendance.lastUpdated,
          }
        : null,
    })),
  }));

  return {
    semesters: semesterData,
    defaultAttendanceTarget: defaultTarget,
    currentSemesterNumber,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AGGREGATE ATTENDANCE UPDATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Directly sets the aggregate classesConducted / classesAttended on a subject.
 *
 * ARCHITECTURE NOTE:
 * This is the "fast mode" update. It writes directly to AttendanceRecord without
 * creating AttendanceLog rows. Aggregate edits must NOT silently create fake log entries.
 */
export async function updateAggregateAttendance(
  input: AggregateAttendanceUpdateInput
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Authentication required." };

  const validation = aggregateAttendanceUpdateSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: "Validation failed. Please check your attendance values.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { subjectId, classesAttended, classesConducted } = validation.data;

  try {
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      include: { semester: true },
    });
    if (!subject) return { success: false, error: "Subject not found." };
    assertUserOwnsRecord(subject.semester.userId, user.id);

    const updated = await prisma.attendanceRecord.upsert({
      where: { subjectId },
      update: { classesAttended, classesConducted },
      create: { subjectId, classesAttended, classesConducted },
    });

    safeRevalidate("/attendance");
    safeRevalidate("/dashboard");

    return { success: true, data: updated };
  } catch (error) {
    console.error("Error updating aggregate attendance:", error);
    return { success: false, error: "Failed to update attendance." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// QUICK PRESENT / ABSENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One-tap quick update for daily use.
 * PRESENT: increments both classesAttended and classesConducted by 1.
 * ABSENT:  increments only classesConducted by 1.
 *
 * ARCHITECTURE NOTE:
 * This is a pure aggregate update. It does NOT create an AttendanceLog row.
 * To avoid double-counting, callers that also want a log entry should use
 * createAttendanceLog() instead (which calls this logic internally).
 */
export async function quickUpdateAttendance(
  input: QuickAttendanceUpdateInput
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Authentication required." };

  const validation = quickAttendanceUpdateSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message || "Invalid input.",
    };
  }

  const { subjectId, action } = validation.data;

  try {
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      include: { semester: true, attendance: true },
    });
    if (!subject) return { success: false, error: "Subject not found." };
    assertUserOwnsRecord(subject.semester.userId, user.id);

    const current = subject.attendance ?? { classesAttended: 0, classesConducted: 0 };
    const newConducted = current.classesConducted + 1;
    const newAttended = action === "PRESENT" ? current.classesAttended + 1 : current.classesAttended;

    const updated = await prisma.attendanceRecord.upsert({
      where: { subjectId },
      update: { classesAttended: newAttended, classesConducted: newConducted },
      create: { subjectId, classesAttended: newAttended, classesConducted: newConducted },
    });

    safeRevalidate("/attendance");
    safeRevalidate("/dashboard");

    return { success: true, data: updated };
  } catch (error) {
    console.error("Error in quick attendance update:", error);
    return { success: false, error: "Failed to update attendance." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RESET ATTENDANCE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resets both aggregate counts and all attendance log entries for a subject.
 * Requires explicit user confirmation before calling this action.
 */
export async function resetAttendance(input: ResetAttendanceInput): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Authentication required." };

  const validation = resetAttendanceSchema.safeParse(input);
  if (!validation.success) {
    return { success: false, error: "Invalid subject ID." };
  }

  const { subjectId } = validation.data;

  try {
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      include: { semester: true },
    });
    if (!subject) return { success: false, error: "Subject not found." };
    assertUserOwnsRecord(subject.semester.userId, user.id);

    await prisma.$transaction(async (tx) => {
      // Delete all log entries first
      await tx.attendanceLog.deleteMany({ where: { subjectId } });
      // Reset aggregate record
      await tx.attendanceRecord.upsert({
        where: { subjectId },
        update: { classesAttended: 0, classesConducted: 0 },
        create: { subjectId, classesAttended: 0, classesConducted: 0 },
      });
    });

    safeRevalidate("/attendance");
    safeRevalidate("/dashboard");

    return { success: true };
  } catch (error) {
    console.error("Error resetting attendance:", error);
    return { success: false, error: "Failed to reset attendance." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANCE LOG — CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns all attendance log entries for a subject, ordered by sessionDate descending.
 */
export async function getAttendanceLogs(
  subjectId: string
): Promise<ActionResult & { logs?: AttendanceLogEntry[] }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Authentication required." };

  try {
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      include: { semester: true },
    });
    if (!subject) return { success: false, error: "Subject not found." };
    assertUserOwnsRecord(subject.semester.userId, user.id);

    const logs = await prisma.attendanceLog.findMany({
      where: { subjectId },
      orderBy: { sessionDate: "desc" },
    });

    return {
      success: true,
      logs: logs.map((l) => ({
        id: l.id,
        subjectId: l.subjectId,
        sessionDate: l.sessionDate.toISOString(),
        status: l.status as "PRESENT" | "ABSENT" | "CANCELLED",
        notes: l.notes ?? null,
        createdAt: l.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error("Error fetching attendance logs:", error);
    return { success: false, error: "Failed to fetch attendance history." };
  }
}

export interface AttendanceLogEntry {
  id: string;
  subjectId: string;
  sessionDate: string;
  status: "PRESENT" | "ABSENT" | "CANCELLED";
  notes: string | null;
  createdAt: string;
}

/**
 * Creates a new attendance log entry and recalculates the aggregate AttendanceRecord.
 *
 * ARCHITECTURE NOTE:
 * When using detailed log mode, the aggregate is always derived from the log.
 * This prevents double-counting: if a student uses the quick buttons for
 * daily use they should not also add log entries for the same sessions.
 * The aggregate is rebuilt from the log after each log mutation.
 *
 * CANCELLED sessions do NOT increment either attended or conducted.
 */
export async function createAttendanceLog(
  input: AttendanceLogCreateInput
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Authentication required." };

  const validation = attendanceLogCreateSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: "Validation failed.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { subjectId, sessionDate, status, notes } = validation.data;

  try {
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      include: { semester: true },
    });
    if (!subject) return { success: false, error: "Subject not found." };
    assertUserOwnsRecord(subject.semester.userId, user.id);

    await prisma.$transaction(async (tx) => {
      // Create the log entry
      await tx.attendanceLog.create({
        data: {
          subjectId,
          sessionDate: new Date(sessionDate),
          status: status as "PRESENT" | "ABSENT" | "CANCELLED",
          notes: notes ?? null,
        },
      });

      // Recalculate aggregate from all logs to maintain consistency
      const allLogs = await tx.attendanceLog.findMany({ where: { subjectId } });
      const agg = aggregateAttendanceLogs(
        allLogs.map((l) => ({ sessionDate: l.sessionDate, status: l.status as "PRESENT" | "ABSENT" | "CANCELLED" }))
      );

      await tx.attendanceRecord.upsert({
        where: { subjectId },
        update: {
          classesAttended: agg.classesAttended,
          classesConducted: agg.classesConducted,
        },
        create: {
          subjectId,
          classesAttended: agg.classesAttended,
          classesConducted: agg.classesConducted,
        },
      });
    });

    safeRevalidate("/attendance");
    safeRevalidate("/dashboard");

    return { success: true };
  } catch (error) {
    console.error("Error creating attendance log:", error);
    return { success: false, error: "Failed to create attendance log entry." };
  }
}

/**
 * Updates an existing attendance log entry and recalculates the aggregate.
 */
export async function updateAttendanceLog(
  input: AttendanceLogUpdateInput
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Authentication required." };

  const validation = attendanceLogUpdateSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: "Validation failed.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { logId, sessionDate, status, notes } = validation.data;

  try {
    const log = await prisma.attendanceLog.findUnique({
      where: { id: logId },
      include: { subject: { include: { semester: true } } },
    });
    if (!log) return { success: false, error: "Attendance log entry not found." };
    assertUserOwnsRecord(log.subject.semester.userId, user.id);

    const subjectId = log.subjectId;

    await prisma.$transaction(async (tx) => {
      await tx.attendanceLog.update({
        where: { id: logId },
        data: {
          sessionDate: new Date(sessionDate),
          status: status as "PRESENT" | "ABSENT" | "CANCELLED",
          notes: notes ?? null,
        },
      });

      // Recalculate aggregate from all logs
      const allLogs = await tx.attendanceLog.findMany({ where: { subjectId } });
      const agg = aggregateAttendanceLogs(
        allLogs.map((l) => ({ sessionDate: l.sessionDate, status: l.status as "PRESENT" | "ABSENT" | "CANCELLED" }))
      );

      await tx.attendanceRecord.upsert({
        where: { subjectId },
        update: {
          classesAttended: agg.classesAttended,
          classesConducted: agg.classesConducted,
        },
        create: {
          subjectId,
          classesAttended: agg.classesAttended,
          classesConducted: agg.classesConducted,
        },
      });
    });

    safeRevalidate("/attendance");
    safeRevalidate("/dashboard");

    return { success: true };
  } catch (error) {
    console.error("Error updating attendance log:", error);
    return { success: false, error: "Failed to update attendance log entry." };
  }
}

/**
 * Deletes an attendance log entry and recalculates the aggregate.
 */
export async function deleteAttendanceLog(logId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Authentication required." };

  if (!logId) return { success: false, error: "Log ID is required." };

  try {
    const log = await prisma.attendanceLog.findUnique({
      where: { id: logId },
      include: { subject: { include: { semester: true } } },
    });
    if (!log) return { success: false, error: "Attendance log entry not found." };
    assertUserOwnsRecord(log.subject.semester.userId, user.id);

    const subjectId = log.subjectId;

    await prisma.$transaction(async (tx) => {
      await tx.attendanceLog.delete({ where: { id: logId } });

      // Recalculate aggregate from remaining logs
      const remainingLogs = await tx.attendanceLog.findMany({ where: { subjectId } });
      const agg = aggregateAttendanceLogs(
        remainingLogs.map((l) => ({ sessionDate: l.sessionDate, status: l.status as "PRESENT" | "ABSENT" | "CANCELLED" }))
      );

      await tx.attendanceRecord.upsert({
        where: { subjectId },
        update: {
          classesAttended: agg.classesAttended,
          classesConducted: agg.classesConducted,
        },
        create: {
          subjectId,
          classesAttended: agg.classesAttended,
          classesConducted: agg.classesConducted,
        },
      });
    });

    safeRevalidate("/attendance");
    safeRevalidate("/dashboard");

    return { success: true };
  } catch (error) {
    console.error("Error deleting attendance log:", error);
    return { success: false, error: "Failed to delete attendance log entry." };
  }
}
