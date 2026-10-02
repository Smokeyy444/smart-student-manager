import {
  DEFAULT_10_POINT_SCALE,
  type GradingScaleDefinition,
  type GradeMapping,
} from "../constants/grading";
import { roundToDecimals } from "./rounding";

export class GradingScaleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GradingScaleError";
  }
}

export interface MarksValidationResult {
  isValid: boolean;
  computedPercentage: number | null;
  expectedGradeLetter: string | null;
  expectedGradePoint: number | null;
  isContradictory: boolean;
  conflictReason?: string;
}

/**
 * Validates the structural integrity of a grading scale.
 */
export function validateGradingScale(scale: GradingScaleDefinition): void {
  if (!scale || typeof scale !== "object") {
    throw new GradingScaleError("Grading scale must be a valid object.");
  }
  if (!scale.name || scale.name.trim().length === 0) {
    throw new GradingScaleError("Grading scale must have a non-empty name.");
  }
  if (!Array.isArray(scale.mappings) || scale.mappings.length < 2) {
    throw new GradingScaleError("Grading scale must contain at least 2 grade mappings.");
  }

  const seenLetters = new Set<string>();
  for (const m of scale.mappings) {
    if (!m.letter || m.letter.trim().length === 0) {
      throw new GradingScaleError("Grade mapping must have a non-empty letter.");
    }
    const normalized = m.letter.trim().toUpperCase();
    if (seenLetters.has(normalized)) {
      throw new GradingScaleError(`Duplicate grade letter detected: ${m.letter}`);
    }
    seenLetters.add(normalized);

    if (typeof m.points !== "number" || !Number.isFinite(m.points) || m.points < 0) {
      throw new GradingScaleError(`Grade points for '${m.letter}' must be a non-negative finite number.`);
    }

    if (m.minPercentage !== undefined) {
      if (typeof m.minPercentage !== "number" || m.minPercentage < 0 || m.minPercentage > 100) {
        throw new GradingScaleError(`minPercentage for '${m.letter}' must be between 0 and 100.`);
      }
    }
    if (m.maxPercentage !== undefined) {
      if (typeof m.maxPercentage !== "number" || m.maxPercentage < 0 || m.maxPercentage > 100) {
        throw new GradingScaleError(`maxPercentage for '${m.letter}' must be between 0 and 100.`);
      }
    }
  }
}

/**
 * Resolves grade points for a grade letter given an active scale.
 * Case-insensitive and trims whitespace.
 */
export function resolveGradePoint(
  letter: string | null | undefined,
  scale: GradingScaleDefinition = DEFAULT_10_POINT_SCALE
): number | null {
  if (!letter || typeof letter !== "string") {
    return null;
  }
  const cleanLetter = letter.trim().toUpperCase();
  const match = scale.mappings.find(
    (m) => m.letter.trim().toUpperCase() === cleanLetter
  );
  return match !== undefined ? match.points : null;
}

/**
 * Determines whether a grade letter represents a passing grade.
 */
export function isGradePassing(
  letter: string | null | undefined,
  scale: GradingScaleDefinition = DEFAULT_10_POINT_SCALE
): boolean {
  if (!letter || typeof letter !== "string") {
    return false;
  }
  const cleanLetter = letter.trim().toUpperCase();
  const match = scale.mappings.find(
    (m) => m.letter.trim().toUpperCase() === cleanLetter
  );
  return match !== undefined ? match.isPassing : false;
}

/**
 * Resolves the matching GradeMapping for a given percentage score.
 */
export function resolveGradeFromPercentage(
  percentage: number,
  scale: GradingScaleDefinition = DEFAULT_10_POINT_SCALE
): GradeMapping | null {
  if (typeof percentage !== "number" || !Number.isFinite(percentage)) {
    return null;
  }

  // Filter mappings that specify percentage bounds and sort descending by threshold
  const boundedMappings = scale.mappings
    .filter((m) => m.minPercentage !== undefined)
    .sort((a, b) => (b.minPercentage ?? 0) - (a.minPercentage ?? 0));

  if (boundedMappings.length === 0) {
    return null;
  }

  for (const m of boundedMappings) {
    const min = m.minPercentage ?? 0;
    const max = m.maxPercentage !== undefined ? m.maxPercentage : 100;
    if (percentage >= min && percentage <= max) {
      return m;
    }
  }

  // If below the lowest boundary, assign the lowest grade (e.g. Fail)
  return boundedMappings[boundedMappings.length - 1];
}

/**
 * Resolves grade mapping from raw marks and maximum marks.
 */
export function resolveGradeFromMarks(
  marksObtained: number,
  maxMarks: number = 100,
  scale: GradingScaleDefinition = DEFAULT_10_POINT_SCALE
): GradeMapping | null {
  if (
    typeof marksObtained !== "number" ||
    typeof maxMarks !== "number" ||
    !Number.isFinite(marksObtained) ||
    !Number.isFinite(maxMarks) ||
    maxMarks <= 0 ||
    marksObtained < 0 ||
    marksObtained > maxMarks
  ) {
    return null;
  }

  const percentage = (marksObtained / maxMarks) * 100;
  return resolveGradeFromPercentage(percentage, scale);
}

/**
 * Validates combined input of marks and optional grade letter to detect contradictions.
 * Example contradiction: Student enters 35 marks out of 100 (which is Fail), but selects grade "O".
 */
export function validateMarksAndGrade(
  marksObtained: number | null | undefined,
  maxMarks: number | null | undefined,
  providedGradeLetter: string | null | undefined,
  scale: GradingScaleDefinition = DEFAULT_10_POINT_SCALE
): MarksValidationResult {
  // If no marks provided, validate grade letter alone
  if (marksObtained === null || marksObtained === undefined) {
    const points = resolveGradePoint(providedGradeLetter, scale);
    return {
      isValid: points !== null || !providedGradeLetter,
      computedPercentage: null,
      expectedGradeLetter: providedGradeLetter ? providedGradeLetter.trim().toUpperCase() : null,
      expectedGradePoint: points,
      isContradictory: false,
    };
  }

  const effectiveMaxMarks = maxMarks !== null && maxMarks !== undefined ? maxMarks : 100;

  if (
    typeof marksObtained !== "number" ||
    !Number.isFinite(marksObtained) ||
    marksObtained < 0 ||
    typeof effectiveMaxMarks !== "number" ||
    !Number.isFinite(effectiveMaxMarks) ||
    effectiveMaxMarks <= 0 ||
    marksObtained > effectiveMaxMarks
  ) {
    return {
      isValid: false,
      computedPercentage: null,
      expectedGradeLetter: null,
      expectedGradePoint: null,
      isContradictory: false,
      conflictReason: "Marks obtained must be a positive number less than or equal to maximum marks.",
    };
  }

  const percentage = roundToDecimals((marksObtained / effectiveMaxMarks) * 100, 2);
  const resolved = resolveGradeFromPercentage(percentage, scale);

  if (!providedGradeLetter || providedGradeLetter.trim() === "") {
    return {
      isValid: true,
      computedPercentage: percentage,
      expectedGradeLetter: resolved?.letter ?? null,
      expectedGradePoint: resolved?.points ?? null,
      isContradictory: false,
    };
  }

  const cleanProvided = providedGradeLetter.trim().toUpperCase();
  const expectedLetter = resolved?.letter?.trim().toUpperCase();

  const isContradictory = expectedLetter !== undefined && cleanProvided !== expectedLetter;

  return {
    isValid: !isContradictory,
    computedPercentage: percentage,
    expectedGradeLetter: resolved?.letter ?? null,
    expectedGradePoint: resolved?.points ?? null,
    isContradictory,
    conflictReason: isContradictory
      ? `Marks (${marksObtained}/${effectiveMaxMarks} = ${percentage}%) correspond to grade '${resolved?.letter}', which contradicts entered grade '${providedGradeLetter}'.`
      : undefined,
  };
}
