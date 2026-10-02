export interface GradeMapping {
  letter: string;
  points: number;
  minPercentage?: number;
  maxPercentage?: number;
  description?: string;
  isPassing: boolean;
}

export interface GradingScaleDefinition {
  id: string;
  name: string;
  scaleType: "TEN_POINT" | "FOUR_POINT" | "PERCENTAGE" | "CUSTOM";
  isDefault: boolean;
  mappings: GradeMapping[];
}

export const DEFAULT_10_POINT_SCALE: GradingScaleDefinition = {
  id: "standard-10-point",
  name: "Standard 10-Point Scale",
  scaleType: "TEN_POINT",
  isDefault: true,
  mappings: [
    { letter: "O", points: 10.0, minPercentage: 90, description: "Outstanding", isPassing: true },
    { letter: "A+", points: 9.0, minPercentage: 80, description: "Excellent", isPassing: true },
    { letter: "A", points: 8.0, minPercentage: 70, description: "Very Good", isPassing: true },
    { letter: "B+", points: 7.0, minPercentage: 60, description: "Good", isPassing: true },
    { letter: "B", points: 6.0, minPercentage: 55, description: "Above Average", isPassing: true },
    { letter: "C", points: 5.0, minPercentage: 50, description: "Average", isPassing: true },
    { letter: "D", points: 4.0, minPercentage: 40, description: "Pass", isPassing: true },
    { letter: "F", points: 0.0, minPercentage: 0, description: "Fail", isPassing: false },
  ],
};

export const STANDARD_4_POINT_SCALE: GradingScaleDefinition = {
  id: "standard-4-point",
  name: "US Standard 4.0 Scale",
  scaleType: "FOUR_POINT",
  isDefault: false,
  mappings: [
    { letter: "A", points: 4.0, minPercentage: 93, description: "Excellent", isPassing: true },
    { letter: "A-", points: 3.7, minPercentage: 90, description: "Very Good", isPassing: true },
    { letter: "B+", points: 3.3, minPercentage: 87, description: "Good", isPassing: true },
    { letter: "B", points: 3.0, minPercentage: 83, description: "Above Average", isPassing: true },
    { letter: "B-", points: 2.7, minPercentage: 80, description: "Average", isPassing: true },
    { letter: "C+", points: 2.3, minPercentage: 77, description: "Below Average", isPassing: true },
    { letter: "C", points: 2.0, minPercentage: 70, description: "Adequate", isPassing: true },
    { letter: "D", points: 1.0, minPercentage: 60, description: "Barely Passing", isPassing: true },
    { letter: "F", points: 0.0, minPercentage: 0, description: "Fail", isPassing: false },
  ],
};

export const SYSTEM_GRADING_SCALES: GradingScaleDefinition[] = [
  DEFAULT_10_POINT_SCALE,
  STANDARD_4_POINT_SCALE,
];

/**
 * Resolves grade points for a letter grade given a grading scale.
 */
export function getGradePointForLetter(
  letter: string,
  scale: GradingScaleDefinition = DEFAULT_10_POINT_SCALE
): number | null {
  const match = scale.mappings.find(
    (m) => m.letter.trim().toUpperCase() === letter.trim().toUpperCase()
  );
  return match !== undefined ? match.points : null;
}

/**
 * Resolves letter grade for marks percentage given a grading scale.
 */
export function getLetterForPercentage(
  percentage: number,
  scale: GradingScaleDefinition = DEFAULT_10_POINT_SCALE
): string | null {
  const sorted = [...scale.mappings].sort((a, b) => (b.minPercentage ?? 0) - (a.minPercentage ?? 0));
  for (const mapping of sorted) {
    if (mapping.minPercentage !== undefined && percentage >= mapping.minPercentage) {
      return mapping.letter;
    }
  }
  return scale.mappings[scale.mappings.length - 1]?.letter ?? null;
}
