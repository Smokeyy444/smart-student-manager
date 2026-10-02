import { describe, it, expect } from "vitest";
import {
  resolveGradePoint,
  isGradePassing,
  resolveGradeFromPercentage,
  resolveGradeFromMarks,
  validateMarksAndGrade,
  validateGradingScale,
  GradingScaleError,
} from "@/lib/calculations/grading-scale";
import {
  DEFAULT_10_POINT_SCALE,
  STANDARD_4_POINT_SCALE,
  type GradingScaleDefinition,
} from "@/lib/constants/grading";

describe("Grading Scale Engine", () => {
  describe("Default 10-Point Scale Resolution", () => {
    it("should resolve exact grade points for all 10-point letters", () => {
      expect(resolveGradePoint("O", DEFAULT_10_POINT_SCALE)).toBe(10.0);
      expect(resolveGradePoint("A+", DEFAULT_10_POINT_SCALE)).toBe(9.0);
      expect(resolveGradePoint("A", DEFAULT_10_POINT_SCALE)).toBe(8.0);
      expect(resolveGradePoint("B+", DEFAULT_10_POINT_SCALE)).toBe(7.0);
      expect(resolveGradePoint("B", DEFAULT_10_POINT_SCALE)).toBe(6.0);
      expect(resolveGradePoint("C", DEFAULT_10_POINT_SCALE)).toBe(5.0);
      expect(resolveGradePoint("D", DEFAULT_10_POINT_SCALE)).toBe(4.0);
      expect(resolveGradePoint("F", DEFAULT_10_POINT_SCALE)).toBe(0.0);
    });

    it("should correctly identify passing and failing grades", () => {
      expect(isGradePassing("O", DEFAULT_10_POINT_SCALE)).toBe(true);
      expect(isGradePassing("D", DEFAULT_10_POINT_SCALE)).toBe(true);
      expect(isGradePassing("F", DEFAULT_10_POINT_SCALE)).toBe(false);
      expect(isGradePassing("UNKNOWN", DEFAULT_10_POINT_SCALE)).toBe(false);
    });

    it("should handle null, undefined, or whitespace gracefully", () => {
      expect(resolveGradePoint(null, DEFAULT_10_POINT_SCALE)).toBeNull();
      expect(resolveGradePoint(undefined, DEFAULT_10_POINT_SCALE)).toBeNull();
      expect(resolveGradePoint("   ", DEFAULT_10_POINT_SCALE)).toBeNull();
      expect(resolveGradePoint(" a+ ", DEFAULT_10_POINT_SCALE)).toBe(9.0);
    });
  });

  describe("US 4.0 Scale Resolution", () => {
    it("should resolve 4.0 scale points accurately", () => {
      expect(resolveGradePoint("A", STANDARD_4_POINT_SCALE)).toBe(4.0);
      expect(resolveGradePoint("A-", STANDARD_4_POINT_SCALE)).toBe(3.7);
      expect(resolveGradePoint("B+", STANDARD_4_POINT_SCALE)).toBe(3.3);
      expect(resolveGradePoint("B", STANDARD_4_POINT_SCALE)).toBe(3.0);
      expect(resolveGradePoint("B-", STANDARD_4_POINT_SCALE)).toBe(2.7);
      expect(resolveGradePoint("C+", STANDARD_4_POINT_SCALE)).toBe(2.3);
      expect(resolveGradePoint("C", STANDARD_4_POINT_SCALE)).toBe(2.0);
      expect(resolveGradePoint("D", STANDARD_4_POINT_SCALE)).toBe(1.0);
      expect(resolveGradePoint("F", STANDARD_4_POINT_SCALE)).toBe(0.0);
    });
  });

  describe("Custom Grading Scale Resolution", () => {
    const customScale: GradingScaleDefinition = {
      id: "custom-7-point",
      name: "Custom 7-Point Scale",
      scaleType: "CUSTOM",
      isDefault: false,
      mappings: [
        { letter: "HD", points: 7.0, minPercentage: 85, isPassing: true, description: "High Distinction" },
        { letter: "D", points: 6.0, minPercentage: 75, isPassing: true, description: "Distinction" },
        { letter: "C", points: 5.0, minPercentage: 65, isPassing: true, description: "Credit" },
        { letter: "P", points: 4.0, minPercentage: 50, isPassing: true, description: "Pass" },
        { letter: "N", points: 0.0, minPercentage: 0, isPassing: false, description: "Fail" },
      ],
    };

    it("should resolve points and passing state on custom scale", () => {
      expect(resolveGradePoint("HD", customScale)).toBe(7.0);
      expect(resolveGradePoint("P", customScale)).toBe(4.0);
      expect(resolveGradePoint("N", customScale)).toBe(0.0);
      expect(isGradePassing("HD", customScale)).toBe(true);
      expect(isGradePassing("N", customScale)).toBe(false);
    });
  });

  describe("Marks to Grade Resolution", () => {
    it("should resolve grade from percentage score", () => {
      expect(resolveGradeFromPercentage(95, DEFAULT_10_POINT_SCALE)?.letter).toBe("O");
      expect(resolveGradeFromPercentage(85, DEFAULT_10_POINT_SCALE)?.letter).toBe("A+");
      expect(resolveGradeFromPercentage(75, DEFAULT_10_POINT_SCALE)?.letter).toBe("A");
      expect(resolveGradeFromPercentage(62, DEFAULT_10_POINT_SCALE)?.letter).toBe("B+");
      expect(resolveGradeFromPercentage(57, DEFAULT_10_POINT_SCALE)?.letter).toBe("B");
      expect(resolveGradeFromPercentage(52, DEFAULT_10_POINT_SCALE)?.letter).toBe("C");
      expect(resolveGradeFromPercentage(44, DEFAULT_10_POINT_SCALE)?.letter).toBe("D");
      expect(resolveGradeFromPercentage(30, DEFAULT_10_POINT_SCALE)?.letter).toBe("F");
    });

    it("should resolve grade from raw marks and maximum marks", () => {
      // 45 out of 50 = 90% -> O
      const res = resolveGradeFromMarks(45, 50, DEFAULT_10_POINT_SCALE);
      expect(res?.letter).toBe("O");
      expect(res?.points).toBe(10.0);

      // 35 out of 50 = 70% -> A
      const res2 = resolveGradeFromMarks(35, 50, DEFAULT_10_POINT_SCALE);
      expect(res2?.letter).toBe("A");
      expect(res2?.points).toBe(8.0);
    });

    it("should return null for invalid marks or max marks", () => {
      expect(resolveGradeFromMarks(-5, 100)).toBeNull();
      expect(resolveGradeFromMarks(105, 100)).toBeNull();
      expect(resolveGradeFromMarks(50, 0)).toBeNull();
      expect(resolveGradeFromMarks(50, -100)).toBeNull();
    });
  });

  describe("Marks and Grade Letter Conflict Validation", () => {
    it("should validate harmonized marks and grade letter", () => {
      // 85/100 matches A+ (80% - 89%)
      const res = validateMarksAndGrade(85, 100, "A+", DEFAULT_10_POINT_SCALE);
      expect(res.isValid).toBe(true);
      expect(res.isContradictory).toBe(false);
      expect(res.expectedGradeLetter).toBe("A+");
      expect(res.expectedGradePoint).toBe(9.0);
    });

    it("should detect contradiction when marks contradict the grade letter", () => {
      // Student enters 35 marks out of 100 (which is F), but claims grade "O"
      const res = validateMarksAndGrade(35, 100, "O", DEFAULT_10_POINT_SCALE);
      expect(res.isValid).toBe(false);
      expect(res.isContradictory).toBe(true);
      expect(res.expectedGradeLetter).toBe("F");
      expect(res.conflictReason).toContain("contradicts entered grade 'O'");
    });

    it("should allow entering marks without grade letter and infer it automatically", () => {
      const res = validateMarksAndGrade(75, 100, null, DEFAULT_10_POINT_SCALE);
      expect(res.isValid).toBe(true);
      expect(res.isContradictory).toBe(false);
      expect(res.expectedGradeLetter).toBe("A");
      expect(res.expectedGradePoint).toBe(8.0);
    });

    it("should reject marks exceeding maximum marks", () => {
      const res = validateMarksAndGrade(120, 100, "O", DEFAULT_10_POINT_SCALE);
      expect(res.isValid).toBe(false);
      expect(res.conflictReason).toContain("less than or equal to maximum marks");
    });
  });

  describe("Grading Scale Structural Validation", () => {
    it("should accept valid scale configurations", () => {
      expect(() => validateGradingScale(DEFAULT_10_POINT_SCALE)).not.toThrow();
      expect(() => validateGradingScale(STANDARD_4_POINT_SCALE)).not.toThrow();
    });

    it("should reject scales with empty names", () => {
      expect(() =>
        validateGradingScale({
          id: "empty",
          name: "",
          scaleType: "CUSTOM",
          isDefault: false,
          mappings: [
            { letter: "A", points: 4.0, isPassing: true },
            { letter: "F", points: 0.0, isPassing: false },
          ],
        })
      ).toThrow(GradingScaleError);
    });

    it("should reject scales with fewer than 2 mappings", () => {
      expect(() =>
        validateGradingScale({
          id: "single",
          name: "Single Grade",
          scaleType: "CUSTOM",
          isDefault: false,
          mappings: [{ letter: "A", points: 4.0, isPassing: true }],
        })
      ).toThrow(GradingScaleError);
    });

    it("should reject scales with duplicate grade letters", () => {
      expect(() =>
        validateGradingScale({
          id: "dup",
          name: "Duplicate Scale",
          scaleType: "CUSTOM",
          isDefault: false,
          mappings: [
            { letter: "A", points: 4.0, isPassing: true },
            { letter: "a", points: 3.5, isPassing: true },
          ],
        })
      ).toThrow(GradingScaleError);
    });

    it("should reject scales with negative grade points", () => {
      expect(() =>
        validateGradingScale({
          id: "neg",
          name: "Negative Points",
          scaleType: "CUSTOM",
          isDefault: false,
          mappings: [
            { letter: "A", points: 4.0, isPassing: true },
            { letter: "F", points: -1.0, isPassing: false },
          ],
        })
      ).toThrow(GradingScaleError);
    });
  });
});
