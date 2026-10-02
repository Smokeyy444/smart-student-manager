import { describe, it, expect } from "vitest";
import {
  DEFAULT_10_POINT_SCALE,
  STANDARD_4_POINT_SCALE,
  getGradePointForLetter,
  getLetterForPercentage,
} from "@/lib/constants/grading";
import { gradingScaleSchema } from "@/lib/validations/grading";

describe("Grading Scale Configuration & Validation", () => {
  describe("Default 10-Point Grading Scale", () => {
    it("should accurately resolve grade points according to the 10-point standard", () => {
      expect(getGradePointForLetter("O", DEFAULT_10_POINT_SCALE)).toBe(10.0);
      expect(getGradePointForLetter("A+", DEFAULT_10_POINT_SCALE)).toBe(9.0);
      expect(getGradePointForLetter("A", DEFAULT_10_POINT_SCALE)).toBe(8.0);
      expect(getGradePointForLetter("B+", DEFAULT_10_POINT_SCALE)).toBe(7.0);
      expect(getGradePointForLetter("B", DEFAULT_10_POINT_SCALE)).toBe(6.0);
      expect(getGradePointForLetter("C", DEFAULT_10_POINT_SCALE)).toBe(5.0);
      expect(getGradePointForLetter("D", DEFAULT_10_POINT_SCALE)).toBe(4.0);
      expect(getGradePointForLetter("F", DEFAULT_10_POINT_SCALE)).toBe(0.0);
    });

    it("should be case-insensitive and handle whitespace", () => {
      expect(getGradePointForLetter(" a+ ", DEFAULT_10_POINT_SCALE)).toBe(9.0);
      expect(getGradePointForLetter("o", DEFAULT_10_POINT_SCALE)).toBe(10.0);
    });

    it("should return null for unrecognized grade letters", () => {
      expect(getGradePointForLetter("XYZ", DEFAULT_10_POINT_SCALE)).toBeNull();
    });

    it("should map percentage marks to grade letters correctly", () => {
      expect(getLetterForPercentage(95, DEFAULT_10_POINT_SCALE)).toBe("O");
      expect(getLetterForPercentage(85, DEFAULT_10_POINT_SCALE)).toBe("A+");
      expect(getLetterForPercentage(75, DEFAULT_10_POINT_SCALE)).toBe("A");
      expect(getLetterForPercentage(65, DEFAULT_10_POINT_SCALE)).toBe("B+");
      expect(getLetterForPercentage(58, DEFAULT_10_POINT_SCALE)).toBe("B");
      expect(getLetterForPercentage(52, DEFAULT_10_POINT_SCALE)).toBe("C");
      expect(getLetterForPercentage(42, DEFAULT_10_POINT_SCALE)).toBe("D");
      expect(getLetterForPercentage(25, DEFAULT_10_POINT_SCALE)).toBe("F");
    });
  });

  describe("Configurable 4.0 Point Grading Scale", () => {
    it("should resolve 4.0 scale points correctly", () => {
      expect(getGradePointForLetter("A", STANDARD_4_POINT_SCALE)).toBe(4.0);
      expect(getGradePointForLetter("A-", STANDARD_4_POINT_SCALE)).toBe(3.7);
      expect(getGradePointForLetter("B+", STANDARD_4_POINT_SCALE)).toBe(3.3);
      expect(getGradePointForLetter("B", STANDARD_4_POINT_SCALE)).toBe(3.0);
      expect(getGradePointForLetter("F", STANDARD_4_POINT_SCALE)).toBe(0.0);
    });
  });

  describe("Grading Scale Zod Schema Validation", () => {
    it("should validate a custom grading scale definition", () => {
      const customScale = {
        name: "Honors College Scale",
        scaleType: "CUSTOM" as const,
        mappings: [
          { letter: "HD", points: 10.0, isPassing: true, description: "High Distinction" },
          { letter: "D", points: 8.0, isPassing: true, description: "Distinction" },
          { letter: "CR", points: 7.0, isPassing: true, description: "Credit" },
          { letter: "P", points: 5.0, isPassing: true, description: "Pass" },
          { letter: "NN", points: 0.0, isPassing: false, description: "Fail" },
        ],
        isDefault: false,
      };

      const result = gradingScaleSchema.safeParse(customScale);
      expect(result.success).toBe(true);
    });

    it("should reject scales with fewer than 2 grade levels", () => {
      const invalidScale = {
        name: "Single Grade Scale",
        scaleType: "CUSTOM" as const,
        mappings: [{ letter: "P", points: 10.0, isPassing: true }],
        isDefault: false,
      };

      const result = gradingScaleSchema.safeParse(invalidScale);
      expect(result.success).toBe(false);
    });
  });
});
