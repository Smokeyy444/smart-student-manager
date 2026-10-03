import { getCurrentUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { getActiveGradingScale } from "@/lib/actions/academic";
import { calculateSGPA, calculateCGPA } from "@/lib/calculations/gpa";
import type { SemesterCalculationInput } from "@/lib/calculations/types";
import {
  calculateOverallSemesterAttendance,
  calculateAttendancePercentage,
  calculateAttendanceStatus,
  calculateBunkBuffer,
  calculateRecoveryClasses,
} from "@/lib/calculations/attendance";

export interface DashboardData {
  academic: {
    cgpa: number | null;
    cgpaScaleMax: number;
    scaleName: string;
    totalCredits: number;
    totalEarnedCredits: number;
    currentSemesterNumber: number;
    currentSemesterName: string | null;
    currentSemesterSgpa: number | null;
    currentSemesterCredits: number;
    semestersTrend: Array<{
      id: string;
      name: string;
      semesterNumber: number;
      sgpa: number | null;
      credits: number;
      isCompleted: boolean;
    }>;
  };
  attendance: {
    overallPercentage: number | null;
    targetPercentage: number;
    trackedSubjectsCount: number;
    belowTargetCount: number;
    totalBunkBuffer: number;
    totalRecoveryNeeded: number;
    lowestSubject: {
      name: string;
      code: string | null;
      percentage: number;
      attended: number;
      conducted: number;
      target: number;
      recoveryClasses: number;
      status: "ON_TRACK" | "WARNING" | "CRITICAL" | "NEUTRAL";
    } | null;
    subjectsNeedingAttention: Array<{
      id: string;
      name: string;
      code: string | null;
      percentage: number;
      attended: number;
      conducted: number;
      target: number;
      status: "WARNING" | "CRITICAL";
      recoveryClasses: number;
      bunkBuffer: number;
    }>;
  };
  events: {
    todayCount: number;
    todayEvents: Array<{
      id: string;
      title: string;
      type: string;
      priority: string;
      startTime: Date;
      isAllDay: boolean;
      status: string;
      subjectName?: string | null;
    }>;
    nextEvent: {
      id: string;
      title: string;
      type: string;
      priority: string;
      startTime: Date;
      isAllDay: boolean;
      subjectName?: string | null;
    } | null;
    upcomingExamsCount: number;
    upcomingDeadlinesCount: number;
    nearestExamsAndDeadlines: Array<{
      id: string;
      title: string;
      type: string;
      priority: string;
      startTime: Date;
      isAllDay: boolean;
      subjectName?: string | null;
    }>;
    totalUpcomingCount: number;
  };
  reminders: {
    dueCount: number;
    nextReminder: {
      id: string;
      triggerAt: Date;
      leadTimeMinutes: number;
      eventTitle: string;
      eventStartTime: Date;
    } | null;
  };
}

/**
 * Aggregates live server data across Academic, Attendance, Events, and Reminders
 * specifically tailored for the authenticated student's dashboard command center.
 */
export async function getDashboardData(): Promise<DashboardData | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const currentSemesterNumber = user.profile?.currentSemester ?? 1;
  const targetPercentage = user.settings?.defaultAttendanceTarget ?? 75.0;

  // 1. Fetch Grading Scale and Semesters with Subjects, Grades, and Attendance
  const [gradingScale, semesters, allEvents, dueReminders, nextReminderRaw] = await Promise.all([
    getActiveGradingScale(user.id),
    prisma.semester.findMany({
      where: { userId: user.id },
      orderBy: { semesterNumber: "asc" },
      include: {
        subjects: {
          orderBy: { createdAt: "asc" },
          include: {
            grade: true,
            attendance: true,
          },
        },
      },
    }),
    prisma.event.findMany({
      where: {
        userId: user.id,
        status: { not: "CANCELLED" },
      },
      orderBy: { startTime: "asc" },
      include: {
        subject: {
          select: { name: true, code: true },
        },
      },
    }),
    prisma.reminder.findMany({
      where: {
        event: {
          userId: user.id,
          status: { not: "COMPLETED" },
        },
        triggerAt: { lte: new Date() },
        status: { in: ["SCHEDULED", "DUE", "TRIGGERED"] },
      },
      include: {
        event: {
          select: { title: true, startTime: true },
        },
      },
    }),
    prisma.reminder.findFirst({
      where: {
        event: {
          userId: user.id,
          status: { not: "COMPLETED" },
        },
        triggerAt: { gt: new Date() },
        status: "SCHEDULED",
      },
      orderBy: { triggerAt: "asc" },
      include: {
        event: {
          select: { title: true, startTime: true },
        },
      },
    }),
  ]);

  // ─── ACADEMIC CALCULATIONS ──────────────────────────────────────────────────
  const calculationInputs: SemesterCalculationInput[] = semesters.map((sem) => ({
    id: sem.id,
    semesterNumber: sem.semesterNumber,
    name: sem.name,
    isCompleted: sem.status === "COMPLETED",
    subjects: sem.subjects.map((sub) => ({
      id: sub.id,
      name: sub.name,
      code: sub.code || undefined,
      creditHours: sub.creditHours,
      isAudit: sub.isAudit,
      gradeLetter: sub.grade?.gradeLetter || null,
      gradePoint: sub.grade?.gradePoint !== null && sub.grade?.gradePoint !== undefined ? sub.grade.gradePoint : null,
      marksObtained: sub.grade?.marksObtained !== null && sub.grade?.marksObtained !== undefined ? sub.grade.marksObtained : null,
      maxMarks: sub.grade?.maxMarks || 100,
    })),
  }));

  let totalEarnedCredits = 0;
  const semestersTrend = semesters.map((sem, index) => {
    const sgpaResult = calculateSGPA(calculationInputs[index].subjects, gradingScale);
    totalEarnedCredits += sgpaResult.earnedCredits;
    return {
      id: sem.id,
      name: sem.name,
      semesterNumber: sem.semesterNumber,
      sgpa: sgpaResult.sgpa,
      credits: sgpaResult.totalCreditBearingCredits,
      isCompleted: sem.status === "COMPLETED",
    };
  });

  const cgpaResult = calculateCGPA(calculationInputs, gradingScale);

  // Determine max scale points from mappings
  const scaleMax =
    gradingScale.mappings.length > 0
      ? Math.max(...gradingScale.mappings.map((m) => m.points))
      : 10.0;

  // Find Current Semester Metrics
  const currentSemester =
    semesters.find((s) => s.semesterNumber === currentSemesterNumber) ??
    semesters.find((s) => s.status === "ACTIVE") ??
    semesters[0] ??
    null;

  let currentSemesterSgpa: number | null = null;
  let currentSemesterCredits = 0;

  if (currentSemester) {
    const currentSemIndex = semesters.findIndex((s) => s.id === currentSemester.id);
    if (currentSemIndex !== -1) {
      const semSgpa = calculateSGPA(calculationInputs[currentSemIndex].subjects, gradingScale);
      currentSemesterSgpa = semSgpa.sgpa;
      currentSemesterCredits = semSgpa.totalCreditBearingCredits;
    }
  }

  // ─── ATTENDANCE CALCULATIONS ────────────────────────────────────────────────
  const currentSemSubjects = currentSemester?.subjects.filter((s) => !s.isAudit) ?? [];
  const attendanceRecords = currentSemSubjects.map((s) => ({
    classesAttended: s.attendance?.classesAttended ?? 0,
    classesConducted: s.attendance?.classesConducted ?? 0,
  }));

  const overallAttendanceResult = calculateOverallSemesterAttendance(attendanceRecords);

  let totalBunkBuffer = 0;
  let totalRecoveryNeeded = 0;
  let belowTargetCount = 0;
  let lowestSubject: DashboardData["attendance"]["lowestSubject"] = null;
  let minPct = Infinity;

  const subjectsNeedingAttention: DashboardData["attendance"]["subjectsNeedingAttention"] = [];

  for (const sub of currentSemSubjects) {
    const attended = sub.attendance?.classesAttended ?? 0;
    const conducted = sub.attendance?.classesConducted ?? 0;
    const subTarget = sub.customAttendanceTarget ?? targetPercentage;

    if (conducted === 0) {
      continue;
    }

    const pct = calculateAttendancePercentage(attended, conducted);
    const status = calculateAttendanceStatus(pct, subTarget, conducted);
    const recovery = calculateRecoveryClasses(attended, conducted, subTarget);
    const bunk = calculateBunkBuffer(attended, conducted, subTarget);

    if (pct < minPct) {
      minPct = pct;
      lowestSubject = {
        name: sub.name,
        code: sub.code,
        percentage: Math.round(pct * 10) / 10,
        attended,
        conducted,
        target: subTarget,
        recoveryClasses: recovery.classesRequired,
        status,
      };
    }

    if (status === "WARNING" || status === "CRITICAL") {
      belowTargetCount++;
      totalRecoveryNeeded += recovery.classesRequired;
      subjectsNeedingAttention.push({
        id: sub.id,
        name: sub.name,
        code: sub.code,
        percentage: Math.round(pct * 10) / 10,
        attended,
        conducted,
        target: subTarget,
        status,
        recoveryClasses: recovery.classesRequired,
        bunkBuffer: bunk,
      });
    } else if (status === "ON_TRACK") {
      totalBunkBuffer += bunk;
    }
  }

  // ─── EVENTS CALCULATIONS ────────────────────────────────────────────────────
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const todayEvents = allEvents
    .filter((e) => e.startTime >= startOfToday && e.startTime <= endOfToday)
    .map((e) => ({
      id: e.id,
      title: e.title,
      type: e.eventType,
      priority: e.priority,
      startTime: e.startTime,
      isAllDay: e.isAllDay,
      status: e.status,
      subjectName: e.subject?.name ?? null,
    }));

  const upcomingEvents = allEvents.filter(
    (e) => e.startTime >= now && e.status === "PENDING"
  );

  const nextEvent = upcomingEvents.length > 0 ? {
    id: upcomingEvents[0].id,
    title: upcomingEvents[0].title,
    type: upcomingEvents[0].eventType,
    priority: upcomingEvents[0].priority,
    startTime: upcomingEvents[0].startTime,
    isAllDay: upcomingEvents[0].isAllDay,
    subjectName: upcomingEvents[0].subject?.name ?? null,
  } : null;

  const upcomingExams = upcomingEvents.filter(
    (e) => e.eventType === "EXAM" || e.eventType === "TEST"
  );

  const upcomingDeadlines = upcomingEvents.filter(
    (e) =>
      e.eventType === "ASSIGNMENT" ||
      e.eventType === "PROJECT" ||
      e.eventType === "PRESENTATION"
  );

  const nearestExamsAndDeadlines = upcomingEvents
    .filter(
      (e) =>
        e.eventType === "EXAM" ||
        e.eventType === "TEST" ||
        e.eventType === "ASSIGNMENT" ||
        e.eventType === "PROJECT" ||
        e.eventType === "PRESENTATION"
    )
    .slice(0, 4)
    .map((e) => ({
      id: e.id,
      title: e.title,
      type: e.eventType,
      priority: e.priority,
      startTime: e.startTime,
      isAllDay: e.isAllDay,
      subjectName: e.subject?.name ?? null,
    }));

  // ─── REMINDERS CALCULATIONS ─────────────────────────────────────────────────
  const nextReminder = nextReminderRaw
    ? {
        id: nextReminderRaw.id,
        triggerAt: nextReminderRaw.triggerAt,
        leadTimeMinutes: nextReminderRaw.leadTimeMinutes,
        eventTitle: nextReminderRaw.event.title,
        eventStartTime: nextReminderRaw.event.startTime,
      }
    : null;

  return {
    academic: {
      cgpa: cgpaResult.cgpa,
      cgpaScaleMax: scaleMax,
      scaleName: gradingScale.name,
      totalCredits: cgpaResult.totalCredits,
      totalEarnedCredits,
      currentSemesterNumber: currentSemester?.semesterNumber ?? currentSemesterNumber,
      currentSemesterName: currentSemester?.name ?? null,
      currentSemesterSgpa,
      currentSemesterCredits,
      semestersTrend,
    },
    attendance: {
      overallPercentage: overallAttendanceResult.overallPercentage,
      targetPercentage,
      trackedSubjectsCount: currentSemSubjects.length,
      belowTargetCount,
      totalBunkBuffer,
      totalRecoveryNeeded,
      lowestSubject,
      subjectsNeedingAttention,
    },
    events: {
      todayCount: todayEvents.length,
      todayEvents,
      nextEvent,
      upcomingExamsCount: upcomingExams.length,
      upcomingDeadlinesCount: upcomingDeadlines.length,
      nearestExamsAndDeadlines,
      totalUpcomingCount: upcomingEvents.length,
    },
    reminders: {
      dueCount: dueReminders.length,
      nextReminder,
    },
  };
}
