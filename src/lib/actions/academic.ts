"use server";

import { prisma } from "../prisma";
import { getCurrentUser, assertUserOwnsRecord } from "../auth/guards";
import {
  semesterSchema,
  subjectSchema,
  subjectGradeSchema,
  bulkSubjectsSchema,
  bulkGradesSchema,
  bulkAttendanceSchema,
  type SemesterInput,
  type SubjectInput,
  type SubjectGradeInput,
  type BulkSubjectsInput,
  type BulkGradesInput,
  type BulkAttendanceInput,
} from "../validations/academic";
import {
  DEFAULT_10_POINT_SCALE,
  SYSTEM_GRADING_SCALES,
  type GradingScaleDefinition,
} from "../constants/grading";
import {
  resolveGradePoint,
  resolveGradeFromMarks,
  validateMarksAndGrade,
  isGradePassing,
} from "../calculations/grading-scale";
import { calculateSGPA, calculateCGPA } from "../calculations/gpa";
import type { SemesterCalculationInput } from "../calculations/types";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./auth";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Graceful fallback when executed outside Next.js request context (e.g. unit/integration tests)
  }
}

/**
 * Loads the active grading scale for the current student.
 */
export async function getActiveGradingScale(userId: string): Promise<GradingScaleDefinition> {
  try {
    const settings = await prisma.userSetting.findUnique({
      where: { userId },
    });

    const scaleId = settings?.defaultGradingScaleId || "standard-10-point";

    // 1. Check system presets
    const systemPreset = SYSTEM_GRADING_SCALES.find((s) => s.id === scaleId);
    if (systemPreset) {
      return systemPreset;
    }

    // 2. Check custom user scales
    const custom = await prisma.gradingScale.findFirst({
      where: {
        id: scaleId,
        userId,
      },
    });

    if (custom) {
      try {
        const mappings = JSON.parse(custom.gradeMappings);
        return {
          id: custom.id,
          name: custom.name,
          scaleType: custom.scaleType as GradingScaleDefinition["scaleType"],
          isDefault: custom.isDefault,
          mappings,
        };
      } catch {
        return DEFAULT_10_POINT_SCALE;
      }
    }

    return DEFAULT_10_POINT_SCALE;
  } catch (error) {
    console.error("Error resolving active grading scale:", error);
    return DEFAULT_10_POINT_SCALE;
  }
}

/**
 * Retrieves the complete academic hierarchy for the authenticated student.
 */
export async function getStudentAcademicData() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const gradingScale = await getActiveGradingScale(user.id);

  const semesters = await prisma.semester.findMany({
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
  });

  // Transform into domain calculation input to compute SGPA and CGPA
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

  // Calculate SGPA for each semester
  const enrichedSemesters = semesters.map((sem, index) => {
    const sgpaResult = calculateSGPA(calculationInputs[index].subjects, gradingScale);
    return {
      ...sem,
      metrics: sgpaResult,
    };
  });

  // Calculate cumulative CGPA across all relevant semesters
  const cgpaResult = calculateCGPA(calculationInputs, gradingScale);

  return {
    semesters: enrichedSemesters,
    cgpaResult,
    gradingScale,
    currentSemesterNumber: user.profile?.currentSemester || 1,
  };
}

/**
 * Creates a new semester for the authenticated student.
 */
export async function createSemester(input: SemesterInput): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const validation = semesterSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: "Validation failed. Please verify your semester inputs.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { name, semesterNumber, status, startDate, endDate } = validation.data;

  try {
    const existing = await prisma.semester.findUnique({
      where: {
        userId_semesterNumber: {
          userId: user.id,
          semesterNumber,
        },
      },
    });

    if (existing) {
      return {
        success: false,
        error: `Semester ${semesterNumber} already exists in your academic record.`,
      };
    }

    const newSemester = await prisma.semester.create({
      data: {
        userId: user.id,
        name,
        semesterNumber,
        status,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      },
    });

    safeRevalidate("/grades");
    safeRevalidate("/dashboard");

    return { success: true, data: newSemester };
  } catch (error) {
    console.error("Error creating semester:", error);
    return { success: false, error: "Failed to create semester." };
  }
}

/**
 * Updates an existing semester.
 */
export async function updateSemester(
  semesterId: string,
  input: SemesterInput
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const validation = semesterSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: "Validation failed.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  try {
    const semester = await prisma.semester.findUnique({
      where: { id: semesterId },
    });

    if (!semester) {
      return { success: false, error: "Semester not found." };
    }

    assertUserOwnsRecord(semester.userId, user.id);

    // If changing semesterNumber, verify no duplicate conflict
    if (validation.data.semesterNumber !== semester.semesterNumber) {
      const conflict = await prisma.semester.findUnique({
        where: {
          userId_semesterNumber: {
            userId: user.id,
            semesterNumber: validation.data.semesterNumber,
          },
        },
      });
      if (conflict) {
        return {
          success: false,
          error: `Semester ${validation.data.semesterNumber} already exists.`,
        };
      }
    }

    const updated = await prisma.semester.update({
      where: { id: semesterId },
      data: {
        name: validation.data.name,
        semesterNumber: validation.data.semesterNumber,
        status: validation.data.status,
        startDate: validation.data.startDate ? new Date(validation.data.startDate) : null,
        endDate: validation.data.endDate ? new Date(validation.data.endDate) : null,
      },
    });

    safeRevalidate("/grades");
    safeRevalidate("/dashboard");

    return { success: true, data: updated };
  } catch (error) {
    console.error("Error updating semester:", error);
    return { success: false, error: "Failed to update semester." };
  }
}

/**
 * Deletes a semester and all associated subjects and grades.
 */
export async function deleteSemester(semesterId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  try {
    const semester = await prisma.semester.findUnique({
      where: { id: semesterId },
    });

    if (!semester) {
      return { success: false, error: "Semester not found." };
    }

    assertUserOwnsRecord(semester.userId, user.id);

    await prisma.semester.delete({
      where: { id: semesterId },
    });

    safeRevalidate("/grades");
    safeRevalidate("/dashboard");
    safeRevalidate("/attendance");

    return { success: true };
  } catch (error) {
    console.error("Error deleting semester:", error);
    return { success: false, error: "Failed to delete semester." };
  }
}

/**
 * Adds a new subject to a semester and automatically initializes its AttendanceRecord.
 */
export async function createSubject(input: SubjectInput): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const validation = subjectSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: "Validation failed. Please verify subject details.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { semesterId, name, code, creditHours, category, isAudit, customAttendanceTarget } =
    validation.data;

  try {
    const semester = await prisma.semester.findUnique({
      where: { id: semesterId },
    });

    if (!semester) {
      return { success: false, error: "Semester not found." };
    }

    assertUserOwnsRecord(semester.userId, user.id);

    // Atomically create Subject and initial AttendanceRecord (classesConducted = 0, classesAttended = 0)
    const newSubject = await prisma.$transaction(async (tx) => {
      const subject = await tx.subject.create({
        data: {
          semesterId,
          name,
          code: code || null,
          creditHours,
          category,
          isAudit,
          customAttendanceTarget: customAttendanceTarget || null,
        },
      });

      await tx.attendanceRecord.create({
        data: {
          subjectId: subject.id,
          classesConducted: 0,
          classesAttended: 0,
        },
      });

      return subject;
    });

    safeRevalidate("/grades");
    safeRevalidate("/dashboard");
    safeRevalidate("/attendance");

    return { success: true, data: newSubject };
  } catch (error) {
    console.error("Error creating subject:", error);
    return { success: false, error: "Failed to create subject." };
  }
}

/**
 * Updates subject details.
 */
export async function updateSubject(
  subjectId: string,
  input: Omit<SubjectInput, "semesterId">
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const updateSchema = subjectSchema.omit({ semesterId: true });
  const validation = updateSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: "Validation failed. Please verify subject details.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { name, code, creditHours, category, isAudit, customAttendanceTarget } = validation.data;

  try {
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      include: { semester: true },
    });

    if (!subject) {
      return { success: false, error: "Subject not found." };
    }

    assertUserOwnsRecord(subject.semester.userId, user.id);

    const updated = await prisma.subject.update({
      where: { id: subjectId },
      data: {
        name,
        code: code || null,
        creditHours,
        category,
        isAudit,
        customAttendanceTarget: customAttendanceTarget || null,
      },
    });

    safeRevalidate("/grades");
    safeRevalidate("/dashboard");
    safeRevalidate("/attendance");

    return { success: true, data: updated };
  } catch (error) {
    console.error("Error updating subject:", error);
    return { success: false, error: "Failed to update subject." };
  }
}

/**
 * Deletes a subject and its associated grade and attendance records.
 */
export async function deleteSubject(subjectId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  try {
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      include: { semester: true },
    });

    if (!subject) {
      return { success: false, error: "Subject not found." };
    }

    assertUserOwnsRecord(subject.semester.userId, user.id);

    await prisma.subject.delete({
      where: { id: subjectId },
    });

    safeRevalidate("/grades");
    safeRevalidate("/dashboard");
    safeRevalidate("/attendance");

    return { success: true };
  } catch (error) {
    console.error("Error deleting subject:", error);
    return { success: false, error: "Failed to delete subject." };
  }
}

/**
 * Saves or updates academic result for a subject.
 * Supports DIRECT GRADE, MARKS, or BOTH with cross-validation against contradictions.
 */
export async function saveSubjectGrade(input: SubjectGradeInput): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const validation = subjectGradeSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: "Validation failed. Please correct the highlighted errors.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { subjectId, mode, gradeLetter, marksObtained, maxMarks } = validation.data;

  try {
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      include: { semester: true },
    });

    if (!subject) {
      return { success: false, error: "Subject not found." };
    }

    assertUserOwnsRecord(subject.semester.userId, user.id);

    const scale = await getActiveGradingScale(user.id);

    let resolvedGradeLetter: string | null = null;
    let resolvedGradePoint: number | null = null;
    let passing = true;

    if (mode === "GRADE") {
      if (!gradeLetter) {
        return { success: false, error: "Please choose a grade letter." };
      }
      const pt = resolveGradePoint(gradeLetter, scale);
      if (pt === null) {
        return { success: false, error: `Unrecognized grade letter '${gradeLetter}'.` };
      }
      resolvedGradeLetter = gradeLetter.trim().toUpperCase();
      resolvedGradePoint = pt;
      passing = isGradePassing(gradeLetter, scale);
    } else if (mode === "MARKS") {
      if (marksObtained === null || marksObtained === undefined) {
        return { success: false, error: "Marks obtained is required." };
      }
      const mapping = resolveGradeFromMarks(marksObtained, maxMarks || 100, scale);
      if (!mapping) {
        return { success: false, error: "Could not map marks to a valid grade." };
      }
      resolvedGradeLetter = mapping.letter;
      resolvedGradePoint = mapping.points;
      passing = mapping.isPassing;
    } else if (mode === "BOTH") {
      // Validate consistency between marks and grade
      const check = validateMarksAndGrade(marksObtained, maxMarks || 100, gradeLetter, scale);
      if (!check.isValid || check.isContradictory) {
        return {
          success: false,
          error: check.conflictReason || "Contradiction detected between entered marks and grade letter.",
        };
      }
      resolvedGradeLetter = gradeLetter ? gradeLetter.trim().toUpperCase() : check.expectedGradeLetter;
      resolvedGradePoint = check.expectedGradePoint;
      passing = isGradePassing(resolvedGradeLetter, scale);
    }

    const savedGrade = await prisma.subjectGrade.upsert({
      where: { subjectId },
      update: {
        gradeLetter: resolvedGradeLetter,
        gradePoint: resolvedGradePoint,
        marksObtained: typeof marksObtained === "number" ? marksObtained : null,
        maxMarks: maxMarks || 100.0,
        isPassing: passing,
      },
      create: {
        subjectId,
        gradeLetter: resolvedGradeLetter,
        gradePoint: resolvedGradePoint,
        marksObtained: typeof marksObtained === "number" ? marksObtained : null,
        maxMarks: maxMarks || 100.0,
        isPassing: passing,
      },
    });

    safeRevalidate("/grades");
    safeRevalidate("/dashboard");

    return { success: true, data: savedGrade };
  } catch (error) {
    console.error("Error saving subject grade:", error);
    return { success: false, error: "Failed to save subject result." };
  }
}

/**
 * Removes a recorded grade from a subject.
 */
export async function deleteSubjectGrade(subjectId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  try {
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      include: { semester: true },
    });

    if (!subject) {
      return { success: false, error: "Subject not found." };
    }

    assertUserOwnsRecord(subject.semester.userId, user.id);

    await prisma.subjectGrade.deleteMany({
      where: { subjectId },
    });

    safeRevalidate("/grades");
    safeRevalidate("/dashboard");

    return { success: true };
  } catch (error) {
    console.error("Error removing subject grade:", error);
    return { success: false, error: "Failed to remove subject grade." };
  }
}

/**
 * Bulk creates multiple subjects for a semester in a single transaction.
 * Also initializes an initial AttendanceRecord (0/0) for each subject.
 */
export async function bulkCreateSubjects(input: BulkSubjectsInput): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const validation = bulkSubjectsSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: "Validation failed. Please verify subject details.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { semesterId, subjects } = validation.data;

  try {
    const semester = await prisma.semester.findUnique({
      where: { id: semesterId },
    });

    if (!semester) {
      return { success: false, error: "Semester not found." };
    }

    assertUserOwnsRecord(semester.userId, user.id);

    // Check for duplicate course codes or duplicate names in this batch
    const codesInBatch = new Set<string>();
    for (const sub of subjects) {
      if (sub.code && sub.code.trim().length > 0) {
        const codeUpper = sub.code.trim().toUpperCase();
        if (codesInBatch.has(codeUpper)) {
          return {
            success: false,
            error: `Duplicate course code '${sub.code}' found within the submitted batch.`,
          };
        }
        codesInBatch.add(codeUpper);
      }
    }

    // Atomically create all subjects and their initial AttendanceRecords
    const createdSubjects = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const item of subjects) {
        const subject = await tx.subject.create({
          data: {
            semesterId,
            name: item.name,
            code: item.code || null,
            creditHours: item.creditHours,
            category: item.category,
            isAudit: item.isAudit,
            customAttendanceTarget: item.customAttendanceTarget || null,
          },
        });

        await tx.attendanceRecord.create({
          data: {
            subjectId: subject.id,
            classesConducted: 0,
            classesAttended: 0,
          },
        });

        results.push(subject);
      }
      return results;
    });

    safeRevalidate("/grades");
    safeRevalidate("/dashboard");
    safeRevalidate("/attendance");

    return {
      success: true,
      data: { count: createdSubjects.length, subjects: createdSubjects },
    };
  } catch (error) {
    console.error("Error bulk creating subjects:", error);
    return { success: false, error: "Failed to bulk create subjects." };
  }
}

/**
 * Bulk saves or updates academic results for multiple subjects in a single atomic transaction.
 */
export async function bulkSaveSubjectGrades(input: BulkGradesInput): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const validation = bulkGradesSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: "Validation failed. Please verify grade entries.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { grades } = validation.data;

  try {
    const subjectIds = grades.map((g) => g.subjectId);
    const subjects = await prisma.subject.findMany({
      where: { id: { in: subjectIds } },
      include: { semester: true },
    });

    if (subjects.length !== subjectIds.length) {
      return { success: false, error: "One or more subjects could not be found." };
    }

    for (const sub of subjects) {
      assertUserOwnsRecord(sub.semester.userId, user.id);
    }

    const scale = await getActiveGradingScale(user.id);

    const resolvedGrades: Array<{
      subjectId: string;
      gradeLetter: string | null;
      gradePoint: number | null;
      marksObtained: number | null;
      maxMarks: number;
      isPassing: boolean;
    }> = [];
    for (const item of grades) {
      const { subjectId, mode, gradeLetter, marksObtained, maxMarks } = item;
      let resolvedGradeLetter: string | null = null;
      let resolvedGradePoint: number | null = null;
      let passing = true;

      if (mode === "GRADE") {
        if (!gradeLetter) {
          return { success: false, error: "Grade letter is required for direct grade entry." };
        }
        const pt = resolveGradePoint(gradeLetter, scale);
        if (pt === null) {
          return { success: false, error: `Unrecognized grade letter '${gradeLetter}'.` };
        }
        resolvedGradeLetter = gradeLetter.trim().toUpperCase();
        resolvedGradePoint = pt;
        passing = isGradePassing(gradeLetter, scale);
      } else if (mode === "MARKS") {
        if (marksObtained === null || marksObtained === undefined) {
          return { success: false, error: "Marks obtained is required for marks entry." };
        }
        const mapping = resolveGradeFromMarks(marksObtained, maxMarks || 100, scale);
        if (!mapping) {
          return { success: false, error: `Could not map ${marksObtained}/${maxMarks || 100} to a valid grade.` };
        }
        resolvedGradeLetter = mapping.letter;
        resolvedGradePoint = mapping.points;
        passing = mapping.isPassing;
      } else if (mode === "BOTH") {
        const check = validateMarksAndGrade(marksObtained, maxMarks || 100, gradeLetter, scale);
        if (!check.isValid || check.isContradictory) {
          return {
            success: false,
            error: check.conflictReason || "Contradiction detected between entered marks and grade letter.",
          };
        }
        resolvedGradeLetter = gradeLetter ? gradeLetter.trim().toUpperCase() : check.expectedGradeLetter;
        resolvedGradePoint = check.expectedGradePoint;
        passing = isGradePassing(resolvedGradeLetter, scale);
      }

      resolvedGrades.push({
        subjectId,
        gradeLetter: resolvedGradeLetter,
        gradePoint: resolvedGradePoint,
        marksObtained: typeof marksObtained === "number" ? marksObtained : null,
        maxMarks: maxMarks || 100.0,
        isPassing: passing,
      });
    }

    await prisma.$transaction(async (tx) => {
      for (const g of resolvedGrades) {
        await tx.subjectGrade.upsert({
          where: { subjectId: g.subjectId },
          update: {
            gradeLetter: g.gradeLetter,
            gradePoint: g.gradePoint,
            marksObtained: g.marksObtained,
            maxMarks: g.maxMarks,
            isPassing: g.isPassing,
          },
          create: {
            subjectId: g.subjectId,
            gradeLetter: g.gradeLetter,
            gradePoint: g.gradePoint,
            marksObtained: g.marksObtained,
            maxMarks: g.maxMarks,
            isPassing: g.isPassing,
          },
        });
      }
    });

    safeRevalidate("/grades");
    safeRevalidate("/dashboard");

    return { success: true, data: { count: resolvedGrades.length } };
  } catch (error) {
    console.error("Error bulk saving subject grades:", error);
    return { success: false, error: "Failed to bulk save subject grades." };
  }
}

/**
 * Bulk updates attendance records for multiple subjects in a single transaction.
 */
export async function bulkUpdateAttendance(input: BulkAttendanceInput): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const validation = bulkAttendanceSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: "Validation failed. Please verify attendance entries.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { records } = validation.data;

  try {
    const subjectIds = records.map((r) => r.subjectId);
    const subjects = await prisma.subject.findMany({
      where: { id: { in: subjectIds } },
      include: { semester: true },
    });

    if (subjects.length !== subjectIds.length) {
      return { success: false, error: "One or more subjects could not be found." };
    }

    for (const sub of subjects) {
      assertUserOwnsRecord(sub.semester.userId, user.id);
    }

    await prisma.$transaction(async (tx) => {
      for (const r of records) {
        await tx.attendanceRecord.upsert({
          where: { subjectId: r.subjectId },
          update: {
            classesAttended: r.classesAttended,
            classesConducted: r.classesConducted,
          },
          create: {
            subjectId: r.subjectId,
            classesAttended: r.classesAttended,
            classesConducted: r.classesConducted,
          },
        });
      }
    });

    safeRevalidate("/attendance");
    safeRevalidate("/grades");
    safeRevalidate("/dashboard");

    return { success: true, data: { count: records.length } };
  } catch (error) {
    console.error("Error bulk updating attendance:", error);
    return { success: false, error: "Failed to bulk update attendance records." };
  }
}
