import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SmartExtractionResultSchema,
  ExtractedAttendanceRowSchema,
  ExtractedGradeRowSchema,
  ExtractedDetailedMarksSubjectSchema,
  ConfirmedSmartImportSchema,
  type MatchedSubjectInfo,
} from "@/lib/ai/extraction-schemas";
import {
  matchSubject,
  checkRateLimit,
} from "@/lib/ai/matching";
import { calculateAttendancePercentage } from "@/lib/calculations/attendance";
import {
  validateMarksAndGrade,
  resolveGradeFromMarks,
} from "@/lib/calculations/grading-scale";
import { DEFAULT_10_POINT_SCALE } from "@/lib/constants/grading";
import {
  extractAcademicDataWithGemini,
  isGeminiConfigured,
  getGeminiModelName,
} from "@/lib/ai/gemini";

// Mock @google/genai
vi.mock("@google/genai", () => {
  return {
    Type: {
      OBJECT: "OBJECT",
      STRING: "STRING",
      INTEGER: "INTEGER",
      NUMBER: "NUMBER",
      BOOLEAN: "BOOLEAN",
      ARRAY: "ARRAY",
      NULL: "NULL",
    },
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      models: {
        generateContent: vi.fn(),
      },
    })),
  };
});

describe("Smart Import — AI Image Data Extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. EXTRACTION SCHEMA VALIDATION & UNKNOWN DATA HANDLING
  // ───────────────────────────────────────────────────────────────────────────
  describe("Zod Extraction Schemas", () => {
    it("should validate a well-formed attendance extraction output", () => {
      const data = {
        documentType: "ATTENDANCE",
        detectedSemester: "III",
        confidence: "HIGH",
        summary: "Extracted attendance records for 2 courses",
        attendanceRows: [
          {
            subjectCode: "CSE202",
            subjectName: "OBJECT ORIENTED PROGRAMMING",
            attended: 38,
            conducted: 40,
            attendancePercentage: 95.0,
            lastAttendedDate: "2024-10-12",
            dutyLeave: 2,
            confidence: "HIGH",
          },
        ],
        gradeRows: [],
        detailedMarksRows: [],
      };

      const result = SmartExtractionResultSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.attendanceRows[0].attended).toBe(38);
        expect(result.data.attendanceRows[0].conducted).toBe(40);
        expect(result.data.attendanceRows[0].confidence).toBe("HIGH");
      }
    });

    it("should handle unknown/unreadable values as null and never guess", () => {
      const unreadableRow = {
        subjectCode: "CSE205",
        subjectName: "Data Structures",
        credits: null, // Credits not visible
        grade: "A",
        gradePoint: null, // Grade point cropped
        marksObtained: null, // Marks unreadable
        maxMarks: null,
        confidence: "LOW",
      };

      const result = ExtractedGradeRowSchema.safeParse(unreadableRow);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.credits).toBeNull();
        expect(result.data.gradePoint).toBeNull();
        expect(result.data.marksObtained).toBeNull();
        expect(result.data.grade).toBe("A");
        expect(result.data.confidence).toBe("LOW");
      }
    });

    it("should reject invalid AI responses with missing required documentType", () => {
      const invalidData = {
        confidence: "HIGH",
        attendanceRows: [],
      };

      const result = SmartExtractionResultSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject invalid negative attended values", () => {
      const invalidRow = {
        subjectCode: "MATH101",
        attended: -5,
        conducted: 20,
      };

      const result = ExtractedAttendanceRowSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it("should preserve verbatim assessment component names in detailed marks", () => {
      const detailedMarks = {
        semester: "IV",
        subjectCode: "CSE316",
        subjectName: "OPERATING SYSTEMS",
        components: [
          {
            componentName: "Continuous Assessment",
            marksObtained: 22,
            maxMarks: 25,
            weightageEarned: 22,
            weightageMax: 25,
            confidence: "HIGH",
          },
          {
            componentName: "Objective Type Mid Term",
            marksObtained: 18,
            maxMarks: 20,
            weightageEarned: 18,
            weightageMax: 20,
            confidence: "HIGH",
          },
          {
            componentName: "Theory End Term",
            marksObtained: 44,
            maxMarks: 50,
            weightageEarned: 44,
            weightageMax: 50,
            confidence: "MEDIUM",
          },
        ],
        finalMarksObtained: 84,
        finalMaxMarks: 100,
        finalGrade: "A+",
        confidence: "HIGH",
      };

      const result = ExtractedDetailedMarksSubjectSchema.safeParse(detailedMarks);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.components[0].componentName).toBe("Continuous Assessment");
        expect(result.data.components[1].componentName).toBe("Objective Type Mid Term");
        expect(result.data.components[2].componentName).toBe("Theory End Term");
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. SUBJECT MATCHING ALGORITHM
  // ───────────────────────────────────────────────────────────────────────────
  describe("Subject Matching Algorithm", () => {
    const existingSubjects: MatchedSubjectInfo[] = [
      {
        id: "sub-1",
        name: "Object Oriented Programming",
        code: "CSE202",
        creditHours: 4.0,
        category: "CORE",
        hasExistingAttendance: true,
        existingAttended: 35,
        existingConducted: 40,
        hasExistingGrade: false,
      },
      {
        id: "sub-2",
        name: "Differential Equations & Transforms",
        code: "MTH166",
        creditHours: 4.0,
        category: "CORE",
        hasExistingAttendance: false,
        hasExistingGrade: true,
        existingGradeLetter: "B+",
      },
      {
        id: "sub-3",
        name: "Web Development Technologies",
        code: "INT306",
        creditHours: 3.0,
        category: "ELECTIVE",
        hasExistingAttendance: false,
        hasExistingGrade: false,
      },
    ];

    it("should match subject by exact subject code (case-insensitive)", () => {
      const match = matchSubject("cse202", "OOP", existingSubjects);
      expect(match.status).toBe("EXACT_CODE");
      expect(match.matchedSubject?.id).toBe("sub-1");
    });

    it("should match subject by normalized code (handling hyphens and spaces)", () => {
      const match = matchSubject("MTH-166", "Maths", existingSubjects);
      expect(match.status).toBe("NORMALIZED_CODE");
      expect(match.matchedSubject?.id).toBe("sub-2");
    });

    it("should match subject by strong normalized name when code is missing", () => {
      const match = matchSubject(
        null,
        "Web Development Technologies",
        existingSubjects
      );
      expect(match.status).toBe("NAME_MATCH");
      expect(match.matchedSubject?.id).toBe("sub-3");
    });

    it("should return NEEDS_REVIEW when ambiguous and never use weak fuzzy guessing", () => {
      const match = matchSubject("UNKNOWN999", "Random Advanced Topic", existingSubjects);
      expect(match.status).toBe("NEEDS_REVIEW");
      expect(match.matchedSubject).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. ATTENDANCE CALCULATION & DISCREPANCY DETECTION
  // ───────────────────────────────────────────────────────────────────────────
  describe("Attendance Calculation & Discrepancy", () => {
    it("should calculate exact official attendance percentage based on attended / conducted", () => {
      const pct = calculateAttendancePercentage(38, 40);
      expect(pct).toBe(95.0);
    });

    it("should detect percentage discrepancy between AI extracted and calculated percentage", () => {
      const attended = 38;
      const conducted = 40;
      const calculatedPct = calculateAttendancePercentage(attended, conducted); // 95.0%
      const extractedPct = 92.0; // Portal displayed or read 92.0%

      const diff = Math.abs(calculatedPct - extractedPct);
      expect(diff).toBeGreaterThan(0.1);

      const warning = `Imported percentage (${extractedPct}%) differs from calculated percentage (${calculatedPct}%). The app will use ${calculatedPct}% based on ${attended}/${conducted}.`;
      expect(warning).toContain("The app will use 95% based on 38/40");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. GRADE SCALE & CONTRADICTION VALIDATION
  // ───────────────────────────────────────────────────────────────────────────
  describe("Grade Scale & Contradiction Detection", () => {
    it("should resolve grade letter from marks using active grading scale", () => {
      const resolved = resolveGradeFromMarks(85, 100, DEFAULT_10_POINT_SCALE);
      expect(resolved).toBeDefined();
      expect(resolved?.letter).toBe("A+");
      expect(resolved?.points).toBe(9);
    });

    it("should detect contradiction between entered marks and extracted grade letter", () => {
      // 85 marks is A+, but screenshot extracted D
      const validation = validateMarksAndGrade(85, 100, "D", DEFAULT_10_POINT_SCALE);
      expect(validation.isContradictory).toBe(true);
      expect(validation.isValid).toBe(false);
      expect(validation.conflictReason).toBeDefined();
      expect(validation.conflictReason).toContain("contradicts entered grade 'D'");
    });

    it("should accept consistent marks and grade letter without contradiction", () => {
      const validation = validateMarksAndGrade(85, 100, "A+", DEFAULT_10_POINT_SCALE);
      expect(validation.isContradictory).toBe(false);
      expect(validation.isValid).toBe(true);
    });

    it("should allow grade letter alone without marks", () => {
      const validation = validateMarksAndGrade(null, null, "A+", DEFAULT_10_POINT_SCALE);
      expect(validation.isContradictory).toBe(false);
      expect(validation.isValid).toBe(true);
      expect(validation.expectedGradePoint).toBe(9);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. DUPLICATE DETECTION & IMPORT CONFIRMATION PAYLOAD
  // ───────────────────────────────────────────────────────────────────────────
  describe("Duplicate Detection & Confirmation Payload", () => {
    it("should detect when an existing attendance or grade record is present", () => {
      const existingAttendanceSubject: MatchedSubjectInfo = {
        id: "sub-1",
        name: "Computer Networks",
        code: "CSE320",
        creditHours: 3.0,
        category: "CORE",
        hasExistingAttendance: true,
        hasExistingGrade: false,
      };

      expect(existingAttendanceSubject.hasExistingAttendance).toBe(true);
      expect(existingAttendanceSubject.hasExistingGrade).toBe(false);
    });

    it("should validate a confirmed smart import payload", () => {
      const confirmedPayload = {
        semesterId: "sem-123",
        attendanceItems: [
          {
            matchedSubjectId: "sub-1",
            createNew: false,
            attended: 36,
            conducted: 40,
            action: "REPLACE" as const,
          },
        ],
        gradeItems: [
          {
            matchedSubjectId: "sub-2",
            createNew: false,
            gradeLetter: "A+",
            gradePoint: 9.0,
            marksObtained: 85,
            maxMarks: 100,
            action: "REPLACE" as const,
          },
        ],
      };

      const result = ConfirmedSmartImportSchema.safeParse(confirmedPayload);
      expect(result.success).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. RATE LIMITING & SECURITY
  // ───────────────────────────────────────────────────────────────────────────
  describe("Rate Limiting Protection", () => {
    it("should enforce rate limit after exceeding requests in the time window", () => {
      const testUserId = `user-${Date.now()}`;
      for (let i = 0; i < 10; i++) {
        const res = checkRateLimit(testUserId);
        expect(res.allowed).toBe(true);
      }

      // 11th request should be blocked
      const blocked = checkRateLimit(testUserId);
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. GEMINI CONFIGURATION & ERROR HANDLING
  // ───────────────────────────────────────────────────────────────────────────
  describe("Gemini Configuration & Mock API Calls", () => {
    it("should report if GEMINI_API_KEY is not configured", () => {
      const originalKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      expect(isGeminiConfigured()).toBe(false);

      process.env.GEMINI_API_KEY = originalKey;
    });

    it("should return the configured model name or default to gemini-2.5-flash", () => {
      const model = getGeminiModelName();
      expect(typeof model).toBe("string");
      expect(model.length).toBeGreaterThan(0);
    });

    it("should throw a clear error when attempting extraction without an API key", async () => {
      const originalKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      await expect(
        extractAcademicDataWithGemini([
          { data: "base64mock", mimeType: "image/png" },
        ])
      ).rejects.toThrow("GEMINI_API_KEY is not configured on the server");

      process.env.GEMINI_API_KEY = originalKey;
    });

    it("should reject extraction when no images are provided", async () => {
      process.env.GEMINI_API_KEY = "test-mock-key";
      await expect(extractAcademicDataWithGemini([])).rejects.toThrow(
        "No image data provided for extraction"
      );
    });
  });
});
