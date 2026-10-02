import { describe, it, expect } from "vitest";
import {
  calculateSGPA,
  calculateCGPA,
  simulateWhatIfSGPA,
  resolveSubjectGradePoint,
  GPAValidationError,
} from "@/lib/calculations/gpa";
import { STANDARD_4_POINT_SCALE } from "@/lib/constants/grading";

describe("GPA Calculation Engine", () => {
  describe("Subject Grade Point Resolution", () => {
    it("should resolve direct numeric gradePoint when provided", () => {
      const res = resolveSubjectGradePoint({ creditHours: 3, gradePoint: 8.5 });
      expect(res.gradePoint).toBe(8.5);
      expect(res.isPassing).toBe(true);
    });

    it("should resolve grade letter using standard scale", () => {
      expect(resolveSubjectGradePoint({ creditHours: 4, gradeLetter: "O" }).gradePoint).toBe(10.0);
      expect(resolveSubjectGradePoint({ creditHours: 4, gradeLetter: "A+" }).gradePoint).toBe(9.0);
      expect(resolveSubjectGradePoint({ creditHours: 4, gradeLetter: "A" }).gradePoint).toBe(8.0);
      expect(resolveSubjectGradePoint({ creditHours: 4, gradeLetter: "F" }).gradePoint).toBe(0.0);
      expect(resolveSubjectGradePoint({ creditHours: 4, gradeLetter: "F" }).isPassing).toBe(false);
    });

    it("should resolve grade from marksObtained when letter is not provided", () => {
      const res = resolveSubjectGradePoint({ creditHours: 4, marksObtained: 85, maxMarks: 100 });
      // 85% matches A+ (9.0) in standard 10-point scale
      expect(res.gradePoint).toBe(9.0);
      expect(res.isPassing).toBe(true);
    });

    it("should return null for subjects currently in progress without grades", () => {
      const res = resolveSubjectGradePoint({ creditHours: 4 });
      expect(res.gradePoint).toBeNull();
      expect(res.isPassing).toBe(false);
    });

    it("should throw error for unknown grade letter", () => {
      expect(() =>
        resolveSubjectGradePoint({ creditHours: 3, gradeLetter: "XYZ" })
      ).toThrow(GPAValidationError);
    });

    it("should throw error for negative grade point", () => {
      expect(() =>
        resolveSubjectGradePoint({ creditHours: 3, gradePoint: -1.0 })
      ).toThrow(GPAValidationError);
    });
  });

  describe("SGPA Calculation", () => {
    it("should return null SGPA for an empty subjects list", () => {
      const res = calculateSGPA([]);
      expect(res.sgpa).toBeNull();
      expect(res.totalCreditBearingCredits).toBe(0);
      expect(res.totalEnrolledCredits).toBe(0);
    });

    it("should compute exact SGPA for a single subject", () => {
      const res = calculateSGPA([
        { name: "Algorithms", creditHours: 4, gradeLetter: "A" }, // Grade point 8.0
      ]);
      expect(res.sgpa).toBe(8.0);
      expect(res.totalCreditBearingCredits).toBe(4);
      expect(res.totalQualityPoints).toBe(32);
      expect(res.earnedCredits).toBe(4);
    });

    it("should compute credit-weighted SGPA for multiple subjects", () => {
      const subjects = [
        { name: "Subject 1", creditHours: 4, gradeLetter: "O" }, // 4 * 10 = 40
        { name: "Subject 2", creditHours: 3, gradeLetter: "A+" }, // 3 * 9 = 27
        { name: "Subject 3", creditHours: 3, gradeLetter: "A" }, // 3 * 8 = 24
      ];
      // Total QP = 91, Total Credits = 10 -> SGPA = 9.10
      const res = calculateSGPA(subjects);
      expect(res.sgpa).toBe(9.1);
      expect(res.totalCreditBearingCredits).toBe(10);
      expect(res.totalQualityPoints).toBe(91);
      expect(res.earnedCredits).toBe(10);
      expect(res.subjectCount).toBe(3);
    });

    it("should support decimal credit values", () => {
      const subjects = [
        { name: "Theory", creditHours: 3.5, gradePoint: 9.0 }, // 31.5 QP
        { name: "Lab", creditHours: 1.5, gradePoint: 8.0 }, // 12.0 QP
      ];
      // Total QP = 43.5, Total Credits = 5.0 -> SGPA = 8.70
      const res = calculateSGPA(subjects);
      expect(res.sgpa).toBe(8.7);
      expect(res.totalCreditBearingCredits).toBe(5.0);
    });

    it("should exclude zero-credit audit courses from denominator and quality points", () => {
      const subjects = [
        { name: "Operating Systems", creditHours: 4, gradeLetter: "A" }, // 4 * 8 = 32
        { name: "Environmental Studies", creditHours: 0, gradeLetter: "O", isAudit: true }, // Audit course
        { name: "Database Systems", creditHours: 4, gradeLetter: "B+" }, // 4 * 7 = 28
      ];
      // Evaluated credits = 8, QP = 60 -> SGPA = 7.50
      const res = calculateSGPA(subjects);
      expect(res.sgpa).toBe(7.5);
      expect(res.totalCreditBearingCredits).toBe(8);
      expect(res.totalEnrolledCredits).toBe(8);
      expect(res.auditSubjectCount).toBe(1);
    });

    it("should return null SGPA if semester contains only audit courses", () => {
      const subjects = [
        { name: "Physical Education", creditHours: 0, isAudit: true, gradeLetter: "O" },
      ];
      const res = calculateSGPA(subjects);
      expect(res.sgpa).toBeNull();
      expect(res.auditSubjectCount).toBe(1);
    });

    it("should include failed courses (grade point 0) in denominator while earning 0 credits", () => {
      const subjects = [
        { name: "Math", creditHours: 4, gradeLetter: "O" }, // 4 * 10 = 40
        { name: "Physics", creditHours: 4, gradeLetter: "F" }, // 4 * 0 = 0
      ];
      // Total Credits = 8, QP = 40 -> SGPA = 5.00
      const res = calculateSGPA(subjects);
      expect(res.sgpa).toBe(5.0);
      expect(res.totalCreditBearingCredits).toBe(8);
      expect(res.totalQualityPoints).toBe(40);
      expect(res.earnedCredits).toBe(4); // Only Math credits earned
    });

    it("should reject negative credit hours", () => {
      expect(() =>
        calculateSGPA([{ name: "Bad Subject", creditHours: -3, gradeLetter: "A" }])
      ).toThrow(GPAValidationError);
    });

    it("should calculate SGPA with a custom 4.0 grading scale", () => {
      const subjects = [
        { creditHours: 3, gradeLetter: "A" }, // 3 * 4.0 = 12.0
        { creditHours: 3, gradeLetter: "B" }, // 3 * 3.0 = 9.0
      ];
      // Total credits = 6, QP = 21.0 -> SGPA = 3.50
      const res = calculateSGPA(subjects, STANDARD_4_POINT_SCALE);
      expect(res.sgpa).toBe(3.5);
    });
  });

  describe("CGPA Calculation Across Multiple Semesters", () => {
    it("should return null CGPA when no semester data exists", () => {
      const res = calculateCGPA([]);
      expect(res.cgpa).toBeNull();
      expect(res.totalCredits).toBe(0);
    });

    it("should calculate credit-weighted CGPA across multiple semesters", () => {
      // Semester 1: 20 credits, SGPA 9.00 -> 180 QP
      // Semester 2: 10 credits, SGPA 6.00 -> 60 QP
      // Total Credits = 30, Total QP = 240 -> CGPA = 8.00
      // (Note: simple average of (9 + 6)/2 = 7.5, which is incorrect!)
      const semesters = [
        {
          semesterNumber: 1,
          subjects: [
            { creditHours: 10, gradePoint: 9.0 },
            { creditHours: 10, gradePoint: 9.0 },
          ],
        },
        {
          semesterNumber: 2,
          subjects: [{ creditHours: 10, gradePoint: 6.0 }],
        },
      ];

      const res = calculateCGPA(semesters);
      expect(res.cgpa).toBe(8.0);
      expect(res.totalCredits).toBe(30);
      expect(res.totalQualityPoints).toBe(240);
      expect(res.semesterBreakdown.length).toBe(2);
      expect(res.semesterBreakdown[0].sgpa).toBe(9.0);
      expect(res.semesterBreakdown[1].sgpa).toBe(6.0);
    });
  });

  describe("What-If SGPA Scenario Simulator", () => {
    it("should simulate grade improvement and return delta", () => {
      const currentSubjects = [
        { code: "CS101", creditHours: 4, gradeLetter: "B" }, // 4 * 6 = 24
        { code: "CS102", creditHours: 4, gradeLetter: "A" }, // 4 * 8 = 32
      ];
      // Baseline SGPA = 56 / 8 = 7.00

      // What if CS101 is upgraded from B to O (10.0)?
      // New QP = 4 * 10 + 32 = 72 -> Predicted SGPA = 72 / 8 = 9.00
      const prediction = simulateWhatIfSGPA(currentSubjects, [
        { code: "CS101", newGradeLetter: "O" },
      ]);

      expect(prediction.baselineSGPA).toBe(7.0);
      expect(prediction.predictedSGPA).toBe(9.0);
      expect(prediction.delta).toBe(2.0);
      expect(prediction.totalCredits).toBe(8);
    });

    it("should simulate what-if marks entry", () => {
      const currentSubjects = [
        { code: "CS101", creditHours: 4, gradeLetter: "B" }, // 24 QP
      ];

      // Simulate scoring 95 marks in CS101 (O grade = 10.0)
      const prediction = simulateWhatIfSGPA(currentSubjects, [
        { code: "CS101", newMarksObtained: 95 },
      ]);

      expect(prediction.predictedSGPA).toBe(10.0);
      expect(prediction.delta).toBe(4.0);
    });
  });
});
