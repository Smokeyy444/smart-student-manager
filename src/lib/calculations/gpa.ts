import {
  DEFAULT_10_POINT_SCALE,
  type GradingScaleDefinition,
} from "../constants/grading";
import { resolveGradePoint, resolveGradeFromMarks, isGradePassing } from "./grading-scale";
import { roundToDecimals } from "./rounding";
import type {
  SubjectCreditGrade,
  SemesterCalculationInput,
  SGPACalculationResult,
  CGPACalculationResult,
  WhatIfGradeModification,
  WhatIfSGPAPrediction,
} from "./types";

export class GPAValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GPAValidationError";
  }
}

/**
 * Resolves the effective grade point and passing status for a subject,
 * inspecting direct gradePoint, gradeLetter, or marksObtained in priority order.
 */
export function resolveSubjectGradePoint(
  subject: SubjectCreditGrade,
  scale: GradingScaleDefinition = DEFAULT_10_POINT_SCALE
): { gradePoint: number | null; isPassing: boolean } {
  // 1. Direct gradePoint provided
  if (typeof subject.gradePoint === "number" && Number.isFinite(subject.gradePoint)) {
    if (subject.gradePoint < 0) {
      throw new GPAValidationError(`Grade point cannot be negative (received: ${subject.gradePoint}).`);
    }
    const passing = subject.gradeLetter ? isGradePassing(subject.gradeLetter, scale) : subject.gradePoint > 0;
    return { gradePoint: subject.gradePoint, isPassing: passing };
  }

  // 2. Resolve from grade letter
  if (subject.gradeLetter && subject.gradeLetter.trim().length > 0) {
    const points = resolveGradePoint(subject.gradeLetter, scale);
    if (points === null) {
      throw new GPAValidationError(`Unknown grade letter '${subject.gradeLetter}' in active grading scale '${scale.name}'.`);
    }
    return { gradePoint: points, isPassing: isGradePassing(subject.gradeLetter, scale) };
  }

  // 3. Resolve from marks obtained
  if (typeof subject.marksObtained === "number" && Number.isFinite(subject.marksObtained)) {
    const max = subject.maxMarks ?? 100;
    const resolved = resolveGradeFromMarks(subject.marksObtained, max, scale);
    if (!resolved) {
      throw new GPAValidationError(
        `Invalid marks obtained (${subject.marksObtained}/${max}) for subject '${subject.name || subject.code || "unknown"}'.`
      );
    }
    return { gradePoint: resolved.points, isPassing: resolved.isPassing };
  }

  // No grade recorded yet (e.g. course currently in progress)
  return { gradePoint: null, isPassing: false };
}

/**
 * Calculates Semester Grade Point Average (SGPA) for a set of subjects.
 *
 * Formula:
 * SGPA = sum(credit_i * gradePoint_i) / sum(credit_i)
 *
 * Non-credit and audit courses (isAudit: true or credits === 0) are excluded from the denominator.
 */
export function calculateSGPA(
  subjects: SubjectCreditGrade[],
  scale: GradingScaleDefinition = DEFAULT_10_POINT_SCALE
): SGPACalculationResult {
  if (!Array.isArray(subjects)) {
    throw new GPAValidationError("Subjects list must be an array.");
  }

  let totalEnrolledCredits = 0;
  let totalCreditBearingCredits = 0;
  let totalQualityPoints = 0;
  let earnedCredits = 0;
  let auditSubjectCount = 0;

  for (const subject of subjects) {
    if (typeof subject.creditHours !== "number" || !Number.isFinite(subject.creditHours)) {
      throw new GPAValidationError(`Credit hours must be a finite number.`);
    }
    if (subject.creditHours < 0) {
      throw new GPAValidationError(`Credit hours cannot be negative (received: ${subject.creditHours}).`);
    }

    totalEnrolledCredits += subject.creditHours;

    // Audit and 0-credit subjects are excluded from SGPA calculations
    if (subject.isAudit || subject.creditHours === 0) {
      auditSubjectCount += 1;
      continue;
    }

    const { gradePoint, isPassing } = resolveSubjectGradePoint(subject, scale);

    if (gradePoint !== null) {
      totalCreditBearingCredits += subject.creditHours;
      totalQualityPoints += subject.creditHours * gradePoint;

      if (isPassing) {
        earnedCredits += subject.creditHours;
      }
    }
  }

  const rawSGPA = totalCreditBearingCredits > 0
    ? totalQualityPoints / totalCreditBearingCredits
    : null;

  return {
    sgpa: rawSGPA !== null ? roundToDecimals(rawSGPA, 2) : null,
    totalEnrolledCredits: roundToDecimals(totalEnrolledCredits, 2),
    totalCreditBearingCredits: roundToDecimals(totalCreditBearingCredits, 2),
    totalQualityPoints: roundToDecimals(totalQualityPoints, 2),
    earnedCredits: roundToDecimals(earnedCredits, 2),
    subjectCount: subjects.length,
    auditSubjectCount,
  };
}

/**
 * Calculates Cumulative Grade Point Average (CGPA) across multiple completed semesters.
 *
 * Formula:
 * CGPA = sum(totalQualityPoints across all semesters) / sum(totalCredits across all semesters)
 *
 * Correctly computes credit-weighted cumulative average rather than simple arithmetic average of SGPAs.
 */
export function calculateCGPA(
  semesters: SemesterCalculationInput[],
  scale: GradingScaleDefinition = DEFAULT_10_POINT_SCALE
): CGPACalculationResult {
  if (!Array.isArray(semesters)) {
    throw new GPAValidationError("Semesters must be an array.");
  }

  let totalCumulativeCredits = 0;
  let totalCumulativeQualityPoints = 0;
  const breakdown: CGPACalculationResult["semesterBreakdown"] = [];

  for (const semester of semesters) {
    const semResult = calculateSGPA(semester.subjects, scale);

    if (semResult.totalCreditBearingCredits > 0) {
      totalCumulativeCredits += semResult.totalCreditBearingCredits;
      totalCumulativeQualityPoints += semResult.totalQualityPoints;
    }

    breakdown.push({
      semesterNumber: semester.semesterNumber,
      sgpa: semResult.sgpa,
      creditHours: semResult.totalCreditBearingCredits,
      qualityPoints: semResult.totalQualityPoints,
    });
  }

  const rawCGPA = totalCumulativeCredits > 0
    ? totalCumulativeQualityPoints / totalCumulativeCredits
    : null;

  return {
    cgpa: rawCGPA !== null ? roundToDecimals(rawCGPA, 2) : null,
    totalCredits: roundToDecimals(totalCumulativeCredits, 2),
    totalQualityPoints: roundToDecimals(totalCumulativeQualityPoints, 2),
    semesterBreakdown: breakdown,
  };
}

/**
 * What-If SGPA Scenario Simulator:
 * Predicts the impact on SGPA when hypothetical grades are scored or updated.
 */
export function simulateWhatIfSGPA(
  currentSubjects: SubjectCreditGrade[],
  modifications: WhatIfGradeModification[],
  scale: GradingScaleDefinition = DEFAULT_10_POINT_SCALE
): WhatIfSGPAPrediction {
  const baseline = calculateSGPA(currentSubjects, scale);

  // Clone subjects to ensure pure, side-effect free simulation
  const simulatedSubjects: SubjectCreditGrade[] = currentSubjects.map((s) => ({ ...s }));

  for (const mod of modifications) {
    let targetIndex = -1;

    if (typeof mod.subjectIndex === "number" && mod.subjectIndex >= 0 && mod.subjectIndex < simulatedSubjects.length) {
      targetIndex = mod.subjectIndex;
    } else if (mod.subjectId) {
      targetIndex = simulatedSubjects.findIndex((s) => s.id === mod.subjectId);
    } else if (mod.code) {
      targetIndex = simulatedSubjects.findIndex(
        (s) => s.code?.trim().toUpperCase() === mod.code?.trim().toUpperCase()
      );
    }

    if (targetIndex !== -1) {
      if (mod.newGradePoint !== undefined) {
        simulatedSubjects[targetIndex].gradePoint = mod.newGradePoint;
        simulatedSubjects[targetIndex].gradeLetter = null;
        simulatedSubjects[targetIndex].marksObtained = null;
      } else if (mod.newGradeLetter !== undefined) {
        simulatedSubjects[targetIndex].gradeLetter = mod.newGradeLetter;
        simulatedSubjects[targetIndex].gradePoint = null;
        simulatedSubjects[targetIndex].marksObtained = null;
      } else if (mod.newMarksObtained !== undefined) {
        simulatedSubjects[targetIndex].marksObtained = mod.newMarksObtained;
        simulatedSubjects[targetIndex].gradePoint = null;
        simulatedSubjects[targetIndex].gradeLetter = null;
      }
    }
  }

  const predicted = calculateSGPA(simulatedSubjects, scale);

  let delta: number | null = null;
  if (baseline.sgpa !== null && predicted.sgpa !== null) {
    delta = roundToDecimals(predicted.sgpa - baseline.sgpa, 2);
  }

  return {
    baselineSGPA: baseline.sgpa,
    predictedSGPA: predicted.sgpa,
    delta,
    totalCredits: predicted.totalCreditBearingCredits,
  };
}
