import { roundToDecimals } from "./rounding";
import type {
  AttendanceInput,
  AttendanceMetrics,
  AttendanceSimulationResult,
  AttendanceStatusType,
  AttendanceLogEntry,
} from "./types";

export class AttendanceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttendanceValidationError";
  }
}

/**
 * Validates attendance parameters according to mathematical and domain feasibility rules.
 */
export function validateAttendanceInput(
  classesAttended: number,
  classesConducted: number,
  targetPercentage: number = 75.0
): void {
  if (typeof classesAttended !== "number" || !Number.isFinite(classesAttended)) {
    throw new AttendanceValidationError("Classes attended must be a finite number.");
  }
  if (typeof classesConducted !== "number" || !Number.isFinite(classesConducted)) {
    throw new AttendanceValidationError("Classes conducted must be a finite number.");
  }
  if (typeof targetPercentage !== "number" || !Number.isFinite(targetPercentage)) {
    throw new AttendanceValidationError("Target percentage must be a finite number.");
  }

  if (!Number.isInteger(classesAttended) || classesAttended < 0) {
    throw new AttendanceValidationError("Classes attended must be a non-negative integer.");
  }
  if (!Number.isInteger(classesConducted) || classesConducted < 0) {
    throw new AttendanceValidationError("Classes conducted must be a non-negative integer.");
  }
  if (classesAttended > classesConducted) {
    throw new AttendanceValidationError(
      `Classes attended (${classesAttended}) cannot exceed classes conducted (${classesConducted}).`
    );
  }
  if (targetPercentage < 0 || targetPercentage > 100) {
    throw new AttendanceValidationError(
      `Target percentage (${targetPercentage}%) must be between 0 and 100.`
    );
  }
}

/**
 * Calculates current attendance percentage.
 * For C = 0 (no classes held yet), returns neutral/safe 100.0%.
 */
export function calculateAttendancePercentage(
  classesAttended: number,
  classesConducted: number
): number {
  if (classesConducted === 0) {
    return 100.0;
  }
  return (classesAttended / classesConducted) * 100;
}

/**
 * Classifies attendance status:
 * - NEUTRAL: C = 0
 * - ON_TRACK: P >= T
 * - WARNING: T - 5 <= P < T
 * - CRITICAL: P < T - 5
 */
export function calculateAttendanceStatus(
  percentage: number,
  targetPercentage: number,
  classesConducted: number
): AttendanceStatusType {
  if (classesConducted === 0) {
    return "NEUTRAL";
  }
  if (percentage >= targetPercentage) {
    return "ON_TRACK";
  }
  if (percentage >= targetPercentage - 5.0) {
    return "WARNING";
  }
  return "CRITICAL";
}

/**
 * Calculates the maximum number of additional classes that can be missed
 * while maintaining attendance >= targetPercentage.
 *
 * Formula:
 * M = floor((100 * A - T * C) / T)
 */
export function calculateBunkBuffer(
  classesAttended: number,
  classesConducted: number,
  targetPercentage: number = 75.0
): number {
  validateAttendanceInput(classesAttended, classesConducted, targetPercentage);

  if (classesConducted === 0) {
    return 0;
  }

  // If target is 0%, student can miss unlimited classes without violating target.
  if (targetPercentage === 0) {
    return Infinity;
  }

  const rawPercentage = (classesAttended / classesConducted) * 100;
  if (rawPercentage < targetPercentage) {
    return 0;
  }

  const numerator = 100 * classesAttended - targetPercentage * classesConducted;
  const buffer = Math.floor(numerator / targetPercentage);
  return Math.max(0, buffer);
}

/**
 * Calculates the minimum number of consecutive future classes that must be attended
 * to reach attendance >= targetPercentage.
 *
 * Formula:
 * R = ceil((T * C - 100 * A) / (100 - T))
 */
export function calculateRecoveryClasses(
  classesAttended: number,
  classesConducted: number,
  targetPercentage: number = 75.0
): { classesRequired: number; isPossible: boolean } {
  validateAttendanceInput(classesAttended, classesConducted, targetPercentage);

  if (classesConducted === 0) {
    return { classesRequired: 0, isPossible: true };
  }

  const rawPercentage = (classesAttended / classesConducted) * 100;
  if (rawPercentage >= targetPercentage) {
    return { classesRequired: 0, isPossible: true };
  }

  // Edge case: Target is exactly 100%
  // If even 1 class was missed (A < C), mathematically (A + R)/(C + R) < 1 for all finite R.
  // 100% can NEVER be recovered once missed.
  if (targetPercentage === 100) {
    return { classesRequired: Infinity, isPossible: false };
  }

  const denominator = 100 - targetPercentage;
  const numerator = targetPercentage * classesConducted - 100 * classesAttended;
  const classesRequired = Math.max(0, Math.ceil(numerator / denominator));

  return { classesRequired, isPossible: true };
}

/**
 * Generates comprehensive attendance metrics for a subject.
 */
export function getAttendanceMetrics(input: AttendanceInput): AttendanceMetrics {
  const target = input.targetPercentage ?? 75.0;
  validateAttendanceInput(input.classesAttended, input.classesConducted, target);

  const rawPercentage = calculateAttendancePercentage(
    input.classesAttended,
    input.classesConducted
  );
  const roundedPercentage = roundToDecimals(rawPercentage, 2);
  const status = calculateAttendanceStatus(
    rawPercentage,
    target,
    input.classesConducted
  );
  const isTargetMet = input.classesConducted === 0 || rawPercentage >= target;
  const bunkBuffer = calculateBunkBuffer(
    input.classesAttended,
    input.classesConducted,
    target
  );
  const recovery = calculateRecoveryClasses(
    input.classesAttended,
    input.classesConducted,
    target
  );

  return {
    classesAttended: input.classesAttended,
    classesConducted: input.classesConducted,
    targetPercentage: target,
    percentage: roundedPercentage,
    rawPercentage,
    status,
    isTargetMet,
    bunkBuffer,
    recoveryClasses: recovery.classesRequired,
    isRecoveryPossible: recovery.isPossible,
  };
}

/**
 * Simulates attending N additional classes.
 */
export function simulateAttending(
  classesAttended: number,
  classesConducted: number,
  additionalClasses: number,
  targetPercentage: number = 75.0
): AttendanceSimulationResult {
  validateAttendanceInput(classesAttended, classesConducted, targetPercentage);
  if (!Number.isInteger(additionalClasses) || additionalClasses < 0) {
    throw new AttendanceValidationError("Additional classes must be a non-negative integer.");
  }

  const prevRaw = calculateAttendancePercentage(classesAttended, classesConducted);
  const newAttended = classesAttended + additionalClasses;
  const newConducted = classesConducted + additionalClasses;
  const newRaw = calculateAttendancePercentage(newAttended, newConducted);

  return {
    previousAttended: classesAttended,
    previousConducted: classesConducted,
    previousPercentage: roundToDecimals(prevRaw, 2),
    simulatedAttended: newAttended,
    simulatedConducted: newConducted,
    simulatedPercentage: roundToDecimals(newRaw, 2),
    percentageChange: roundToDecimals(newRaw - prevRaw, 2),
    newStatus: calculateAttendanceStatus(newRaw, targetPercentage, newConducted),
  };
}

/**
 * Simulates missing N additional classes.
 */
export function simulateMissing(
  classesAttended: number,
  classesConducted: number,
  missedClasses: number,
  targetPercentage: number = 75.0
): AttendanceSimulationResult {
  validateAttendanceInput(classesAttended, classesConducted, targetPercentage);
  if (!Number.isInteger(missedClasses) || missedClasses < 0) {
    throw new AttendanceValidationError("Missed classes must be a non-negative integer.");
  }

  const prevRaw = calculateAttendancePercentage(classesAttended, classesConducted);
  const newAttended = classesAttended;
  const newConducted = classesConducted + missedClasses;
  const newRaw = calculateAttendancePercentage(newAttended, newConducted);

  return {
    previousAttended: classesAttended,
    previousConducted: classesConducted,
    previousPercentage: roundToDecimals(prevRaw, 2),
    simulatedAttended: newAttended,
    simulatedConducted: newConducted,
    simulatedPercentage: roundToDecimals(newRaw, 2),
    percentageChange: roundToDecimals(newRaw - prevRaw, 2),
    newStatus: calculateAttendanceStatus(newRaw, targetPercentage, newConducted),
  };
}

/**
 * Aggregates a sequence of detailed attendance logs (PRESENT, ABSENT, CANCELLED)
 * into total attended and conducted counts.
 * Note: CANCELLED sessions are not counted towards conducted classes.
 */
export function aggregateAttendanceLogs(logs: AttendanceLogEntry[]): {
  classesAttended: number;
  classesConducted: number;
  classesCancelled: number;
} {
  let attended = 0;
  let conducted = 0;
  let cancelled = 0;

  for (const log of logs) {
    if (log.status === "PRESENT") {
      attended += 1;
      conducted += 1;
    } else if (log.status === "ABSENT") {
      conducted += 1;
    } else if (log.status === "CANCELLED") {
      cancelled += 1;
    }
  }

  return {
    classesAttended: attended,
    classesConducted: conducted,
    classesCancelled: cancelled,
  };
}

/**
 * Validates and parses raw bulk/CSV import records for attendance.
 */
export function parseBulkAttendanceRecord(record: {
  attended: unknown;
  conducted: unknown;
  target?: unknown;
}): AttendanceInput {
  const attended = Number(record.attended);
  const conducted = Number(record.conducted);
  const target = record.target !== undefined && record.target !== "" ? Number(record.target) : 75.0;

  validateAttendanceInput(attended, conducted, target);

  return {
    classesAttended: attended,
    classesConducted: conducted,
    targetPercentage: target,
  };
}
