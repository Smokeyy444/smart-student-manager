import { describe, it, expect } from "vitest";
import {
  calculateAttendancePercentage,
  calculateAttendanceStatus,
  calculateBunkBuffer,
  calculateRecoveryClasses,
  getAttendanceMetrics,
  simulateAttending,
  simulateMissing,
  aggregateAttendanceLogs,
  validateAttendanceInput,
  parseBulkAttendanceRecord,
  AttendanceValidationError,
} from "@/lib/calculations/attendance";

describe("Attendance Calculation Engine", () => {
  describe("Input Validation", () => {
    it("should accept valid non-negative integer class counts within bounds", () => {
      expect(() => validateAttendanceInput(0, 0, 75.0)).not.toThrow();
      expect(() => validateAttendanceInput(15, 20, 75.0)).not.toThrow();
      expect(() => validateAttendanceInput(100, 100, 80.0)).not.toThrow();
    });

    it("should reject negative attended classes", () => {
      expect(() => validateAttendanceInput(-1, 10, 75)).toThrow(AttendanceValidationError);
    });

    it("should reject negative conducted classes", () => {
      expect(() => validateAttendanceInput(5, -10, 75)).toThrow(AttendanceValidationError);
    });

    it("should reject attended classes exceeding conducted classes", () => {
      expect(() => validateAttendanceInput(11, 10, 75)).toThrow(AttendanceValidationError);
    });

    it("should reject non-integer class counts", () => {
      expect(() => validateAttendanceInput(5.5, 10, 75)).toThrow(AttendanceValidationError);
      expect(() => validateAttendanceInput(5, 10.5, 75)).toThrow(AttendanceValidationError);
    });

    it("should reject non-finite inputs", () => {
      expect(() => validateAttendanceInput(NaN, 10, 75)).toThrow(AttendanceValidationError);
      expect(() => validateAttendanceInput(5, Infinity, 75)).toThrow(AttendanceValidationError);
    });

    it("should reject target percentages outside [0, 100]", () => {
      expect(() => validateAttendanceInput(5, 10, -5)).toThrow(AttendanceValidationError);
      expect(() => validateAttendanceInput(5, 10, 105)).toThrow(AttendanceValidationError);
    });
  });

  describe("Current Attendance Percentage", () => {
    it("should return neutral 100.0% when 0 classes have been conducted", () => {
      expect(calculateAttendancePercentage(0, 0)).toBe(100.0);
    });

    it("should compute exact percentage when classes have been conducted", () => {
      expect(calculateAttendancePercentage(1, 1)).toBe(100.0);
      expect(calculateAttendancePercentage(0, 10)).toBe(0.0);
      expect(calculateAttendancePercentage(5, 10)).toBe(50.0);
      expect(calculateAttendancePercentage(7, 10)).toBe(70.0);
      expect(calculateAttendancePercentage(15, 20)).toBe(75.0);
      expect(calculateAttendancePercentage(22, 28)).toBeCloseTo(78.5714, 4);
    });
  });

  describe("Attendance Status Classification", () => {
    it("should classify C = 0 as NEUTRAL", () => {
      expect(calculateAttendanceStatus(100, 75, 0)).toBe("NEUTRAL");
    });

    it("should classify P >= T as ON_TRACK", () => {
      expect(calculateAttendanceStatus(75.0, 75, 20)).toBe("ON_TRACK");
      expect(calculateAttendanceStatus(85.0, 75, 20)).toBe("ON_TRACK");
    });

    it("should classify T - 5 <= P < T as WARNING", () => {
      expect(calculateAttendanceStatus(74.9, 75, 20)).toBe("WARNING");
      expect(calculateAttendanceStatus(70.0, 75, 20)).toBe("WARNING");
      expect(calculateAttendanceStatus(72.5, 75, 20)).toBe("WARNING");
    });

    it("should classify P < T - 5 as CRITICAL", () => {
      expect(calculateAttendanceStatus(69.9, 75, 20)).toBe("CRITICAL");
      expect(calculateAttendanceStatus(50.0, 75, 20)).toBe("CRITICAL");
      expect(calculateAttendanceStatus(0.0, 75, 20)).toBe("CRITICAL");
    });
  });

  describe("Bunk Buffer (Classes that can be missed)", () => {
    it("should handle 0 conducted / 0 attended", () => {
      expect(calculateBunkBuffer(0, 0, 75)).toBe(0);
    });

    it("should calculate exact bunk buffer for 1/1 at 75%", () => {
      // 100(1) - 75(1) = 25 / 75 = 0.33 -> floor = 0
      expect(calculateBunkBuffer(1, 1, 75)).toBe(0);
    });

    it("should return 0 bunk buffer when attendance is below target", () => {
      expect(calculateBunkBuffer(0, 10, 75)).toBe(0);
      expect(calculateBunkBuffer(5, 10, 75)).toBe(0);
      expect(calculateBunkBuffer(7, 10, 75)).toBe(0);
    });

    it("should return 0 bunk buffer when attendance is exactly at target", () => {
      // 15 attended, 20 conducted = 75.0% -> missing 1 makes it 15/21 = 71.4% < 75%
      expect(calculateBunkBuffer(15, 20, 75)).toBe(0);
    });

    it("should calculate correct buffer when attendance is above target", () => {
      // 22 attended, 25 conducted = 88.0% at 75% target
      // M = floor((2200 - 1875) / 75) = floor(325 / 75) = 4
      expect(calculateBunkBuffer(22, 25, 75)).toBe(4);

      // Verify: with 4 missed -> 22 / 29 = 75.86% >= 75%
      // with 5 missed -> 22 / 30 = 73.33% < 75%
    });

    it("should handle target = 0 (infinite buffer)", () => {
      expect(calculateBunkBuffer(5, 10, 0)).toBe(Infinity);
    });

    it("should handle target = 100", () => {
      // Perfect 10/10 -> missing even 1 makes it 10/11 < 100% -> buffer = 0
      expect(calculateBunkBuffer(10, 10, 100)).toBe(0);
    });

    it("should handle very large class counts accurately", () => {
      // 900 attended, 1000 conducted (90%) at 75% target
      // M = floor((90000 - 75000) / 75) = floor(15000 / 75) = 200
      expect(calculateBunkBuffer(900, 1000, 75)).toBe(200);
      // 900 / 1200 = 75.0%
    });
  });

  describe("Catch-Up Recovery Classes", () => {
    it("should return 0 classes required when C = 0", () => {
      const res = calculateRecoveryClasses(0, 0, 75);
      expect(res.classesRequired).toBe(0);
      expect(res.isPossible).toBe(true);
    });

    it("should return 0 classes required when attendance already meets or exceeds target", () => {
      expect(calculateRecoveryClasses(1, 1, 75)).toEqual({ classesRequired: 0, isPossible: true });
      expect(calculateRecoveryClasses(15, 20, 75)).toEqual({ classesRequired: 0, isPossible: true });
      expect(calculateRecoveryClasses(18, 20, 75)).toEqual({ classesRequired: 0, isPossible: true });
    });

    it("should calculate exact recovery classes when below target", () => {
      // 0 / 10 at 75% target -> R = ceil((750 - 0) / 25) = 30 classes
      // After 30: 30 / 40 = 75.0%
      expect(calculateRecoveryClasses(0, 10, 75)).toEqual({ classesRequired: 30, isPossible: true });

      // 5 / 10 (50%) at 75% target -> R = ceil((750 - 500) / 25) = 10 classes
      // After 10: 15 / 20 = 75.0%
      expect(calculateRecoveryClasses(5, 10, 75)).toEqual({ classesRequired: 10, isPossible: true });

      // 7 / 10 (70%) at 75% target -> R = ceil((750 - 700) / 25) = 2 classes
      // After 2: 9 / 12 = 75.0%
      expect(calculateRecoveryClasses(7, 10, 75)).toEqual({ classesRequired: 2, isPossible: true });
    });

    it("should correctly handle borderline attendance just below target", () => {
      // 74 attended, 100 conducted (74.0%) at 75% target
      // R = ceil((7500 - 7400) / 25) = ceil(100 / 25) = 4 classes
      // After 4: 78 / 104 = 75.0%
      expect(calculateRecoveryClasses(74, 100, 75)).toEqual({ classesRequired: 4, isPossible: true });
    });

    it("should handle target = 100% when classes were missed", () => {
      // If student attended 9 out of 10, it is mathematically impossible to ever reach 100%
      const res = calculateRecoveryClasses(9, 10, 100);
      expect(res.isPossible).toBe(false);
      expect(res.classesRequired).toBe(Infinity);
    });

    it("should handle target = 100% when 0 classes were missed", () => {
      const res = calculateRecoveryClasses(10, 10, 100);
      expect(res.isPossible).toBe(true);
      expect(res.classesRequired).toBe(0);
    });

    it("should handle very large numbers correctly", () => {
      // 600 attended, 1000 conducted (60%) at 75% target
      // R = ceil((75000 - 60000) / 25) = ceil(15000 / 25) = 600
      // After 600: 1200 / 1600 = 75.0%
      expect(calculateRecoveryClasses(600, 1000, 75)).toEqual({ classesRequired: 600, isPossible: true });
    });
  });

  describe("Comprehensive getAttendanceMetrics", () => {
    it("should compile complete metrics object accurately", () => {
      const metrics = getAttendanceMetrics({
        classesAttended: 18,
        classesConducted: 24,
        targetPercentage: 75.0,
      });

      expect(metrics.classesAttended).toBe(18);
      expect(metrics.classesConducted).toBe(24);
      expect(metrics.percentage).toBe(75.0);
      expect(metrics.status).toBe("ON_TRACK");
      expect(metrics.isTargetMet).toBe(true);
      expect(metrics.bunkBuffer).toBe(0);
      expect(metrics.recoveryClasses).toBe(0);
      expect(metrics.isRecoveryPossible).toBe(true);
    });
  });

  describe("Attendance Future Simulations", () => {
    it("should simulate attending additional classes", () => {
      const sim = simulateAttending(18, 24, 6, 75.0);
      expect(sim.previousAttended).toBe(18);
      expect(sim.previousConducted).toBe(24);
      expect(sim.previousPercentage).toBe(75.0);
      expect(sim.simulatedAttended).toBe(24);
      expect(sim.simulatedConducted).toBe(30);
      expect(sim.simulatedPercentage).toBe(80.0);
      expect(sim.percentageChange).toBe(5.0);
      expect(sim.newStatus).toBe("ON_TRACK");
    });

    it("should simulate missing additional classes", () => {
      const sim = simulateMissing(18, 24, 6, 75.0);
      expect(sim.previousAttended).toBe(18);
      expect(sim.previousConducted).toBe(24);
      expect(sim.simulatedAttended).toBe(18);
      expect(sim.simulatedConducted).toBe(30);
      expect(sim.simulatedPercentage).toBe(60.0);
      expect(sim.percentageChange).toBe(-15.0);
      expect(sim.newStatus).toBe("CRITICAL");
    });
  });

  describe("Detailed Logs Aggregation", () => {
    it("should accurately aggregate PRESENT, ABSENT, and exclude CANCELLED from conducted", () => {
      const logs = [
        { sessionDate: "2026-10-01", status: "PRESENT" as const },
        { sessionDate: "2026-10-02", status: "PRESENT" as const },
        { sessionDate: "2026-10-03", status: "ABSENT" as const },
        { sessionDate: "2026-10-04", status: "CANCELLED" as const },
        { sessionDate: "2026-10-05", status: "PRESENT" as const },
      ];

      const agg = aggregateAttendanceLogs(logs);
      expect(agg.classesAttended).toBe(3);
      expect(agg.classesConducted).toBe(4); // 3 present + 1 absent
      expect(agg.classesCancelled).toBe(1);
    });
  });

  describe("Bulk / CSV Input Parser", () => {
    it("should parse string or numeric inputs from CSV rows", () => {
      const parsed = parseBulkAttendanceRecord({
        attended: "20",
        conducted: "25",
        target: "80",
      });
      expect(parsed.classesAttended).toBe(20);
      expect(parsed.classesConducted).toBe(25);
      expect(parsed.targetPercentage).toBe(80);
    });

    it("should use default target of 75.0 when omitted", () => {
      const parsed = parseBulkAttendanceRecord({
        attended: 15,
        conducted: 20,
      });
      expect(parsed.targetPercentage).toBe(75.0);
    });
  });
});
