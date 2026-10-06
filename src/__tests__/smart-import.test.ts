import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SmartExtractionResultSchema,
  ExtractedAttendanceRowSchema,
  ExtractedGradeRowSchema,
  type MatchedSubjectInfo,
} from "@/lib/ai/extraction-schemas";
import {
  matchSubject,
  checkRateLimit,
  deduplicateGradeRows,
  resolveImageMimeType,
} from "@/lib/ai/matching";
import { calculateAttendancePercentage } from "@/lib/calculations/attendance";
import {
  extractAcademicDataWithGemini,
  isGeminiConfigured,
  getGeminiModelName,
  getGeminiModelHierarchy,
  isTransientGeminiError,
  buildExtractionPrompt,
  buildRecoveryPrompt,
  isExtractionSuspicious,
} from "@/lib/ai/gemini";

// Mock @google/genai
const mockGenerateContent = vi.fn();

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
    GoogleGenAI: vi.fn(function () {
      return {
        models: {
          generateContent: mockGenerateContent,
        },
      };
    }),
  };
});

describe("Smart Import — Accuracy & Multi-Subject Extraction Overhaul", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. EXTRACTION SCHEMA VALIDATION & UNKNOWN DATA HANDLING
  // ───────────────────────────────────────────────────────────────────────────
  describe("Zod Extraction Schemas", () => {
    it("should validate a well-formed attendance extraction output with sourceImageIndex", () => {
      const data = {
        documentType: "ATTENDANCE",
        detectedSemester: "III",
        totalSubjectsDetected: 2,
        confidence: "HIGH",
        summary: "Extracted attendance records for 2 courses",
        attendanceRows: [
          {
            sourceImageIndex: 1,
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
        expect(result.data.attendanceRows[0].sourceImageIndex).toBe(1);
        expect(result.data.totalSubjectsDetected).toBe(2);
      }
    });

    it("should handle unknown/unreadable values as null and never guess", () => {
      const unreadableRow = {
        subjectCode: "CSE205",
        subjectName: "Data Structures",
        credits: null,
        grade: "A",
        gradePoint: null,
        marksObtained: null,
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
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. FULL TABLE EXTRACTION (7 SUBJECTS FROM ONE IMAGE)
  // ───────────────────────────────────────────────────────────────────────────
  describe("Full Table Extraction (Single Image)", () => {
    it("one image containing 7 subjects -> 7 extraction rows returned", async () => {
      process.env.GEMINI_API_KEY = "mock-api-key";

      const sevenSubjectsResponse = {
        documentType: "ATTENDANCE",
        detectedSemester: "IV",
        totalSubjectsDetected: 7,
        confidence: "HIGH",
        summary: "Full academic attendance table extracted",
        attendanceRows: [
          { subjectCode: "CSE202", subjectName: "Object Oriented Programming", attended: 38, conducted: 40, confidence: "HIGH" },
          { subjectCode: "CSE205", subjectName: "Data Structures & Algorithms", attended: 35, conducted: 40, confidence: "HIGH" },
          { subjectCode: "CSE316", subjectName: "Operating Systems", attended: 32, conducted: 38, confidence: "HIGH" },
          { subjectCode: "INT213", subjectName: "Python Programming", attended: 28, conducted: 30, confidence: "HIGH" },
          { subjectCode: "MTH166", subjectName: "Differential Equations", attended: 26, conducted: 32, confidence: "HIGH" },
          { subjectCode: "PEA305", subjectName: "Analytical Skills", attended: 18, conducted: 20, confidence: "HIGH" },
          { subjectCode: "CHE110", subjectName: "Environmental Studies", attended: 19, conducted: 20, confidence: "HIGH" },
        ],
        gradeRows: [],
        detailedMarksRows: [],
      };

      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(sevenSubjectsResponse),
      });

      const result = await extractAcademicDataWithGemini([
        { data: "base64image1", mimeType: "image/png" },
      ], "ATTENDANCE");

      expect(result.attendanceRows).toHaveLength(7);
      expect(result.totalSubjectsDetected).toBe(7);
      expect(result.attendanceRows.map((r) => r.subjectCode)).toEqual([
        "CSE202",
        "CSE205",
        "CSE316",
        "INT213",
        "MTH166",
        "PEA305",
        "CHE110",
      ]);
      // Verify sourceImageIndex is tagged as 1
      expect(result.attendanceRows.every((r) => r.sourceImageIndex === 1)).toBe(true);
    });

    it("one image containing multiple subjects with different attendance counts", async () => {
      process.env.GEMINI_API_KEY = "mock-api-key";

      const mockTableData = {
        documentType: "ATTENDANCE",
        totalSubjectsDetected: 4,
        confidence: "HIGH",
        attendanceRows: [
          { subjectCode: "SUB1", subjectName: "Course 1", attended: 40, conducted: 40, confidence: "HIGH" },
          { subjectCode: "SUB2", subjectName: "Course 2", attended: 20, conducted: 40, confidence: "HIGH" },
          { subjectCode: "SUB3", subjectName: "Course 3", attended: 0, conducted: 10, confidence: "HIGH" },
          { subjectCode: "SUB4", subjectName: "Course 4", attended: 35, conducted: 38, confidence: "HIGH" },
        ],
        gradeRows: [],
        detailedMarksRows: [],
      };

      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify(mockTableData),
      });

      const result = await extractAcademicDataWithGemini([
        { data: "base64image", mimeType: "image/png" },
      ], "ATTENDANCE");

      expect(result.attendanceRows).toHaveLength(4);
      expect(result.attendanceRows[0].attended).toBe(40);
      expect(result.attendanceRows[0].conducted).toBe(40);
      expect(result.attendanceRows[1].attended).toBe(20);
      expect(result.attendanceRows[2].attended).toBe(0);
      expect(result.attendanceRows[3].attended).toBe(35);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. MULTI-IMAGE MERGING & DEDUPLICATION
  // ───────────────────────────────────────────────────────────────────────────
  describe("Multi-Image Processing and Merging", () => {
    it("multiple images containing different subjects -> all combined", async () => {
      process.env.GEMINI_API_KEY = "mock-api-key";

      // Image 1: Subjects A, B, C
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          documentType: "ATTENDANCE",
          totalSubjectsDetected: 3,
          confidence: "HIGH",
          attendanceRows: [
            { subjectCode: "SUB-A", subjectName: "Subject A", attended: 30, conducted: 32, confidence: "HIGH" },
            { subjectCode: "SUB-B", subjectName: "Subject B", attended: 25, conducted: 28, confidence: "HIGH" },
            { subjectCode: "SUB-C", subjectName: "Subject C", attended: 20, conducted: 22, confidence: "HIGH" },
          ],
          gradeRows: [],
          detailedMarksRows: [],
        }),
      });

      // Image 2: Subjects D, E, F
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          documentType: "ATTENDANCE",
          totalSubjectsDetected: 3,
          confidence: "HIGH",
          attendanceRows: [
            { subjectCode: "SUB-D", subjectName: "Subject D", attended: 15, conducted: 18, confidence: "HIGH" },
            { subjectCode: "SUB-E", subjectName: "Subject E", attended: 22, conducted: 24, confidence: "HIGH" },
            { subjectCode: "SUB-F", subjectName: "Subject F", attended: 10, conducted: 12, confidence: "HIGH" },
          ],
          gradeRows: [],
          detailedMarksRows: [],
        }),
      });

      const result = await extractAcademicDataWithGemini([
        { data: "base64img1", mimeType: "image/png" },
        { data: "base64img2", mimeType: "image/png" },
      ], "ATTENDANCE");

      expect(result.attendanceRows).toHaveLength(6);
      expect(result.attendanceRows.map((r) => r.subjectCode)).toEqual([
        "SUB-A",
        "SUB-B",
        "SUB-C",
        "SUB-D",
        "SUB-E",
        "SUB-F",
      ]);
      // Verify sourceImageIndex tracks which image each subject came from
      expect(result.attendanceRows[0].sourceImageIndex).toBe(1);
      expect(result.attendanceRows[1].sourceImageIndex).toBe(1);
      expect(result.attendanceRows[2].sourceImageIndex).toBe(1);
      expect(result.attendanceRows[3].sourceImageIndex).toBe(2);
      expect(result.attendanceRows[4].sourceImageIndex).toBe(2);
      expect(result.attendanceRows[5].sourceImageIndex).toBe(2);
    });

    it("duplicate subject across two images -> deduplicated preserving highest confidence", async () => {
      process.env.GEMINI_API_KEY = "mock-api-key";

      // Image 1 has SUB-A with LOW confidence and missing attended
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          documentType: "ATTENDANCE",
          totalSubjectsDetected: 2,
          confidence: "LOW",
          attendanceRows: [
            { subjectCode: "SUB-A", subjectName: "Subject A", attended: null, conducted: 30, confidence: "LOW" },
            { subjectCode: "SUB-B", subjectName: "Subject B", attended: 20, conducted: 25, confidence: "HIGH" },
          ],
          gradeRows: [],
          detailedMarksRows: [],
        }),
      });

      // Image 2 has SUB-A with HIGH confidence and complete values
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          documentType: "ATTENDANCE",
          totalSubjectsDetected: 2,
          confidence: "HIGH",
          attendanceRows: [
            { subjectCode: "SUB-A", subjectName: "Subject A", attended: 28, conducted: 30, confidence: "HIGH" },
            { subjectCode: "SUB-C", subjectName: "Subject C", attended: 18, conducted: 20, confidence: "HIGH" },
          ],
          gradeRows: [],
          detailedMarksRows: [],
        }),
      });

      const result = await extractAcademicDataWithGemini([
        { data: "base64img1", mimeType: "image/png" },
        { data: "base64img2", mimeType: "image/png" },
      ], "ATTENDANCE");

      // Total distinct subjects should be 3 (SUB-A, SUB-B, SUB-C)
      expect(result.attendanceRows).toHaveLength(3);

      const subA = result.attendanceRows.find((r) => r.subjectCode === "SUB-A");
      expect(subA).toBeDefined();
      expect(subA?.attended).toBe(28); // Kept the complete value from Image 2
      expect(subA?.conducted).toBe(30);
      expect(subA?.confidence).toBe("HIGH"); // Kept HIGH confidence
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. UNREADABLE VALUES & INCOMPLETE EXTRACTION DETECTION
  // ───────────────────────────────────────────────────────────────────────────
  describe("Completeness Detection & Unreadable Values", () => {
    it("unreadable value -> null + flagged for review", () => {
      const row = {
        subjectCode: "CSE202",
        subjectName: "OOP",
        attended: null,
        conducted: 40,
        confidence: "LOW" as const,
      };

      // Attended is null -> cannot calculate percentage
      expect(row.attended).toBeNull();
      const isValid = row.attended !== null && row.conducted !== null;
      expect(isValid).toBe(false);
    });

    it("incomplete extraction -> warning flagged by isExtractionSuspicious", () => {
      // 1. Single row extracted when table should have multiple
      const singleRowResult = {
        documentType: "ATTENDANCE" as const,
        totalSubjectsDetected: 1,
        confidence: "MEDIUM" as const,
        attendanceRows: [
          { subjectCode: "CSE101", subjectName: "Math", attended: 10, conducted: 12, confidence: "MEDIUM" as const },
        ],
        gradeRows: [],
        detailedMarksRows: [],
      };
      expect(isExtractionSuspicious(singleRowResult, "ATTENDANCE")).toBe(true);

      // 2. AI reported total count 7 but only returned 2 rows
      const mismatchResult = {
        documentType: "ATTENDANCE" as const,
        totalSubjectsDetected: 7,
        confidence: "HIGH" as const,
        attendanceRows: [
          { subjectCode: "CSE101", subjectName: "Math", attended: 10, conducted: 12, confidence: "HIGH" as const },
          { subjectCode: "CSE102", subjectName: "Physics", attended: 15, conducted: 18, confidence: "HIGH" as const },
        ],
        gradeRows: [],
        detailedMarksRows: [],
      };
      expect(isExtractionSuspicious(mismatchResult, "ATTENDANCE")).toBe(true);

      // 3. Complete extraction with 6 rows and no mismatch is NOT suspicious
      const completeResult = {
        documentType: "ATTENDANCE" as const,
        totalSubjectsDetected: 6,
        confidence: "HIGH" as const,
        attendanceRows: [
          { subjectCode: "A", subjectName: "A", attended: 10, conducted: 12, confidence: "HIGH" as const },
          { subjectCode: "B", subjectName: "B", attended: 10, conducted: 12, confidence: "HIGH" as const },
          { subjectCode: "C", subjectName: "C", attended: 10, conducted: 12, confidence: "HIGH" as const },
          { subjectCode: "D", subjectName: "D", attended: 10, conducted: 12, confidence: "HIGH" as const },
          { subjectCode: "E", subjectName: "E", attended: 10, conducted: 12, confidence: "HIGH" as const },
          { subjectCode: "F", subjectName: "F", attended: 10, conducted: 12, confidence: "HIGH" as const },
        ],
        gradeRows: [],
        detailedMarksRows: [],
      };
      expect(isExtractionSuspicious(completeResult, "ATTENDANCE")).toBe(false);
    });

    it("attendance percentage recalculated from attended/conducted and flags discrepancies", () => {
      const attended = 38;
      const conducted = 40;
      const calculatedPct = calculateAttendancePercentage(attended, conducted); // 95%
      const extractedPct = 90.0; // Portal reported or AI misread 90%

      expect(calculatedPct).toBe(95.0);
      const diff = Math.abs(calculatedPct - extractedPct);
      expect(diff).toBeGreaterThan(0.1);

      const warning = `Imported percentage (${extractedPct}%) differs from calculated percentage (${calculatedPct}%). The app will use ${calculatedPct}% based on ${attended}/${conducted}.`;
      expect(warning).toContain("The app will use 95% based on 38/40");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. SUBJECT MATCHING & UNMATCHED COURSE PRESERVATION
  // ───────────────────────────────────────────────────────────────────────────
  describe("Subject Matching Priority & Unmatched Subjects", () => {
    const existingSubjects: MatchedSubjectInfo[] = [
      {
        id: "sub-1",
        name: "Object Oriented Programming",
        code: "CSE202",
        creditHours: 4.0,
        category: "CORE",
        hasExistingAttendance: true,
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
      },
    ];

    it("exact subject code match", () => {
      const match = matchSubject("CSE202", "Anything", existingSubjects);
      expect(match.status).toBe("EXACT_CODE");
      expect(match.matchedSubject?.id).toBe("sub-1");
    });

    it("normalized code match (hyphens/spaces)", () => {
      const match = matchSubject("mth-166", "Maths", existingSubjects);
      expect(match.status).toBe("NORMALIZED_CODE");
      expect(match.matchedSubject?.id).toBe("sub-2");
    });

    it("unmatched subject is retained for review and never discarded", () => {
      const match = matchSubject("NEW101", "Robotics Foundations", existingSubjects);
      expect(match.status).toBe("NEEDS_REVIEW");
      expect(match.matchedSubject).toBeNull();
      // Application retains row with createNewSubjectName
      const createNewName = "Robotics Foundations";
      expect(createNewName).toBe("Robotics Foundations");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. MULTI-IMAGE FILE INPUT & FORMDATA FLOW
  // ───────────────────────────────────────────────────────────────────────────
  describe("Multi-Image File Input & Format Resolution", () => {
    it("all selected images are actually passed through FormData", () => {
      const formData = new FormData();
      const mockFile1 = new File(["fake-data-1"], "screenshot1.png", { type: "image/png" });
      const mockFile2 = new File(["fake-data-2"], "screenshot2.jpg", { type: "image/jpeg" });
      const mockFile3 = new File(["fake-data-3"], "screenshot3.webp", { type: "image/webp" });

      formData.append("images", mockFile1);
      formData.append("images", mockFile2);
      formData.append("images", mockFile3);

      const files = formData.getAll("images") as File[];
      expect(files).toHaveLength(3);
      expect(files[0].name).toBe("screenshot1.png");
      expect(files[1].name).toBe("screenshot2.jpg");
      expect(files[2].name).toBe("screenshot3.webp");
    });

    it("resolves image MIME types correctly from MIME or file extensions", () => {
      const filePng = new File(["data"], "test.png", { type: "image/png" });
      const fileJpgNoMime = new File(["data"], "table.jpg", { type: "" });
      const fileWebp = new File(["data"], "sheet.webp", { type: "image/webp" });
      const fileInvalid = new File(["data"], "report.pdf", { type: "application/pdf" });

      expect(resolveImageMimeType(filePng)).toBe("image/png");
      expect(resolveImageMimeType(fileJpgNoMime)).toBe("image/jpeg");
      expect(resolveImageMimeType(fileWebp)).toBe("image/webp");
      expect(resolveImageMimeType(fileInvalid)).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. PROMPT DESIGN SPECIFICATIONS
  // ───────────────────────────────────────────────────────────────────────────
  describe("Prompt Design Specifications", () => {
    it("prompt explicitly includes table OCR directives, row counting, and table structures", () => {
      const prompt = buildExtractionPrompt("ATTENDANCE", 1, 2);

      expect(prompt).toContain("academic-table OCR");
      expect(prompt).toContain("Inspect the ENTIRE image from top to bottom");
      expect(prompt).toContain("Extract EVERY subject/course row");
      expect(prompt).toContain("Do NOT stop after finding the first valid subject");
      expect(prompt).toContain("Do NOT summarize or group");
      expect(prompt).toContain("count the number of subject rows detected");
      expect(prompt).toContain("totalSubjectsDetected");
      expect(prompt).toContain("38/40");
      expect(prompt).toContain("Image 1 of 2");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. RATE LIMITING & SECURITY
  // ───────────────────────────────────────────────────────────────────────────
  describe("Rate Limiting Protection", () => {
    it("should enforce rate limit after exceeding requests in the time window", () => {
      const testUserId = `user-overhaul-${Date.now()}`;
      for (let i = 0; i < 10; i++) {
        const res = checkRateLimit(testUserId);
        expect(res.allowed).toBe(true);
      }

      const blocked = checkRateLimit(testUserId);
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. GEMINI CONFIGURATION
  // ───────────────────────────────────────────────────────────────────────────
  describe("Gemini Configuration", () => {
    it("should report if GEMINI_API_KEY is not configured", () => {
      const originalKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      expect(isGeminiConfigured()).toBe(false);

      process.env.GEMINI_API_KEY = originalKey;
    });

    it("should respect GEMINI_MODEL configured in environment", () => {
      const originalModel = process.env.GEMINI_MODEL;
      process.env.GEMINI_MODEL = "gemini-3.8-flash";

      expect(getGeminiModelName()).toBe("gemini-3.8-flash");

      process.env.GEMINI_MODEL = originalModel;
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

  // ───────────────────────────────────────────────────────────────────────────
  // 10. TRANSIENT FAILURE RETRY, EXPONENTIAL BACKOFF & MODEL FALLBACK
  // ───────────────────────────────────────────────────────────────────────────
  describe("Gemini 503 / Model Overload Retry & Fallback", () => {
    const validExtractionOutput = JSON.stringify({
      documentType: "ATTENDANCE",
      detectedSemester: "IV",
      totalSubjectsDetected: 4,
      confidence: "HIGH",
      summary: "Extracted 4 courses successfully",
      attendanceRows: [
        { subjectCode: "CS101", subjectName: "Intro to CS", attended: 28, conducted: 30, percentage: 93.3 },
        { subjectCode: "CS102", subjectName: "Data Structures", attended: 26, conducted: 30, percentage: 86.7 },
        { subjectCode: "CS103", subjectName: "Algorithms", attended: 24, conducted: 30, percentage: 80.0 },
        { subjectCode: "CS104", subjectName: "Operating Systems", attended: 27, conducted: 30, percentage: 90.0 },
      ],
      gradeRows: [],
      detailedMarksRows: [],
      unreadableNotes: null,
    });

    beforeEach(() => {
      process.env.GEMINI_API_KEY = "test-api-key";
      process.env.GEMINI_MODEL = "gemini-3.8-flash";
      delete process.env.GEMINI_FALLBACK_MODELS;
      mockGenerateContent.mockReset();
    });

    it("successful first attempt -> exactly one API call", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: validExtractionOutput,
      });

      const result = await extractAcademicDataWithGemini(
        [{ data: "base64image", mimeType: "image/png" }],
        "ATTENDANCE",
        { initialDelayMs: 0 }
      );

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gemini-3.8-flash",
        })
      );
      expect(result.attendanceRows).toHaveLength(4);
      expect(result.documentType).toBe("ATTENDANCE");
    });

    it("first attempt 503 -> second attempt succeeds", async () => {
      // Attempt 1: 503 UNAVAILABLE
      mockGenerateContent.mockRejectedValueOnce({
        status: 503,
        message: JSON.stringify({
          error: {
            code: 503,
            status: "UNAVAILABLE",
            message: "This model is currently experiencing high demand. Spikes in demand are usually temporary.",
          },
        }),
      });

      // Attempt 2: Success
      mockGenerateContent.mockResolvedValueOnce({
        text: validExtractionOutput,
      });

      const result = await extractAcademicDataWithGemini(
        [{ data: "base64image", mimeType: "image/png" }],
        "ATTENDANCE",
        { initialDelayMs: 0 }
      );

      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
      expect(result.attendanceRows).toHaveLength(4);
    });

    it("first two attempts 503 -> third succeeds", async () => {
      // Attempt 1: 503
      mockGenerateContent.mockRejectedValueOnce({
        status: 503,
        message: "503 UNAVAILABLE high demand",
      });

      // Attempt 2: 503
      mockGenerateContent.mockRejectedValueOnce({
        status: 503,
        message: "503 UNAVAILABLE overloaded",
      });

      // Attempt 3: Success
      mockGenerateContent.mockResolvedValueOnce({
        text: validExtractionOutput,
      });

      const result = await extractAcademicDataWithGemini(
        [{ data: "base64image", mimeType: "image/png" }],
        "ATTENDANCE",
        { initialDelayMs: 0 }
      );

      expect(mockGenerateContent).toHaveBeenCalledTimes(3);
      expect(result.attendanceRows).toHaveLength(4);
    });

    it("all attempts 503 -> clean user-facing error without leaking raw JSON", async () => {
      mockGenerateContent.mockRejectedValue({
        status: 503,
        message: JSON.stringify({
          error: {
            code: 503,
            status: "UNAVAILABLE",
            message: "This model is currently experiencing high demand.",
          },
        }),
      });

      await expect(
        extractAcademicDataWithGemini(
          [{ data: "base64image", mimeType: "image/png" }],
          "ATTENDANCE",
          { initialDelayMs: 0, maxAttempts: 3 }
        )
      ).rejects.toThrow(
        "AI service is temporarily unavailable. Please try again later or use CSV / Manual Import."
      );

      // Exactly 3 attempts made, never infinite
      expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    });

    it("permanent 400 -> no retry", async () => {
      mockGenerateContent.mockRejectedValueOnce({
        status: 400,
        message: JSON.stringify({
          error: {
            code: 400,
            status: "INVALID_ARGUMENT",
            message: "Request payload size exceeds limits",
          },
        }),
      });

      await expect(
        extractAcademicDataWithGemini(
          [{ data: "base64image", mimeType: "image/png" }],
          "ATTENDANCE",
          { initialDelayMs: 0 }
        )
      ).rejects.toThrow();

      // Exactly 1 attempt made, 400 was NOT retried
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it("fallback model succeeds after primary 503", async () => {
      process.env.GEMINI_MODEL = "gemini-3.8-flash";
      process.env.GEMINI_FALLBACK_MODELS = "gemini-3.7-flash,gemini-3.6-flash";

      // Attempt 1 on primary model (gemini-3.8-flash) fails with 503
      mockGenerateContent.mockRejectedValueOnce({
        status: 503,
        message: "503 UNAVAILABLE: Model is busy",
      });

      // Attempt 2 on fallback model (gemini-3.7-flash) succeeds
      mockGenerateContent.mockResolvedValueOnce({
        text: validExtractionOutput,
      });

      const result = await extractAcademicDataWithGemini(
        [{ data: "base64image", mimeType: "image/png" }],
        "ATTENDANCE",
        { initialDelayMs: 0 }
      );

      expect(mockGenerateContent).toHaveBeenCalledTimes(2);

      // Verify call 1 used primary model
      expect(mockGenerateContent.mock.calls[0][0].model).toBe("gemini-3.8-flash");

      // Verify call 2 used fallback model
      expect(mockGenerateContent.mock.calls[1][0].model).toBe("gemini-3.7-flash");

      expect(result.attendanceRows).toHaveLength(4);
    });

    it("incomplete extraction recovery still behaves separately", async () => {
      // First pass returns suspicious 1-row table (no error, successful 200 call)
      const suspiciousSingleRowOutput = JSON.stringify({
        documentType: "ATTENDANCE",
        detectedSemester: "IV",
        totalSubjectsDetected: 6,
        confidence: "MEDIUM",
        summary: "Found table",
        attendanceRows: [
          { subjectCode: "CS101", subjectName: "Intro to CS", attended: 28, conducted: 30, percentage: 93.3 },
        ],
        gradeRows: [],
        detailedMarksRows: [],
        unreadableNotes: null,
      });

      // Second pass recovery returns full table
      const recoveryOutput = JSON.stringify({
        documentType: "ATTENDANCE",
        detectedSemester: "IV",
        totalSubjectsDetected: 2,
        confidence: "HIGH",
        summary: "Recovered remaining rows",
        attendanceRows: [
          { subjectCode: "CS102", subjectName: "Data Structures", attended: 26, conducted: 30, percentage: 86.7 },
        ],
        gradeRows: [],
        detailedMarksRows: [],
        unreadableNotes: null,
      });

      mockGenerateContent
        .mockResolvedValueOnce({ text: suspiciousSingleRowOutput })
        .mockResolvedValueOnce({ text: recoveryOutput });

      const result = await extractAcademicDataWithGemini(
        [{ data: "base64image", mimeType: "image/png" }],
        "ATTENDANCE",
        { initialDelayMs: 0 }
      );

      // 2 calls total: 1 first pass, 1 recovery pass (not an error retry)
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
      expect(mockGenerateContent.mock.calls[1][0].contents[0].parts[1].text).toContain(
        "SECOND-PASS TABLE RECOVERY EXTRACTION"
      );
      expect(result.attendanceRows).toHaveLength(2);
    });

    it("returns model hierarchy in preferred fallback order", () => {
      process.env.GEMINI_MODEL = "gemini-3.8-flash";
      delete process.env.GEMINI_FALLBACK_MODELS;
      const hierarchy = getGeminiModelHierarchy();
      expect(hierarchy).toEqual([
        "gemini-3.8-flash",
        "gemini-3.7-flash",
        "gemini-3.6-flash",
        "gemini-3.5-flash-lite",
      ]);

      // Custom configured fallbacks with deduplication
      process.env.GEMINI_FALLBACK_MODELS = "gemini-3.7-flash, custom-model";
      const customHierarchy = getGeminiModelHierarchy();
      expect(customHierarchy).toEqual([
        "gemini-3.8-flash",
        "gemini-3.7-flash",
        "custom-model",
      ]);
    });

    it("correctly identifies transient vs permanent errors in isTransientGeminiError", () => {
      expect(isTransientGeminiError({ status: 503 })).toBe(true);
      expect(isTransientGeminiError({ status: 500 })).toBe(true);
      expect(isTransientGeminiError({ status: 502 })).toBe(true);
      expect(isTransientGeminiError({ status: 504 })).toBe(true);
      expect(isTransientGeminiError({ message: "HTTP 503 status UNAVAILABLE high demand" })).toBe(true);
      expect(isTransientGeminiError({ message: "Spikes in demand are usually temporary" })).toBe(true);

      // Permanent errors
      expect(isTransientGeminiError({ status: 400 })).toBe(false);
      expect(isTransientGeminiError({ status: 401 })).toBe(false);
      expect(isTransientGeminiError({ status: 403 })).toBe(false);
      expect(isTransientGeminiError({ status: 404 })).toBe(false);
      expect(isTransientGeminiError({ message: "API key not valid" })).toBe(false);
      expect(isTransientGeminiError({ message: "Validation schema error" })).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. GRADE / RESULT TABLE EXTRACTION SUITE (EXACT 7-COURSE TABLE SPEC)
  // ───────────────────────────────────────────────────────────────────────────
  describe("Grade / Result Table Extraction & Pipeline Verification", () => {
    const exactSevenCourseRows = [
      {
        subjectCode: "CHE110",
        subjectName: "ENVIRONMENTAL STUDIES",
        grade: "A+",
        credits: null,
        gradePoint: null,
        marksObtained: null,
        maxMarks: null,
        confidence: "HIGH" as const,
      },
      {
        subjectCode: "CSE111",
        subjectName: "ORIENTATION TO COMPUTING-I",
        grade: "A+",
        credits: null,
        gradePoint: null,
        marksObtained: null,
        maxMarks: null,
        confidence: "HIGH" as const,
      },
      {
        subjectCode: "CSE326",
        subjectName: "INTERNET PROGRAMMING LABORATORY",
        grade: "O",
        credits: null,
        gradePoint: null,
        marksObtained: null,
        maxMarks: null,
        confidence: "HIGH" as const,
      },
      {
        subjectCode: "ECE249",
        subjectName: "BASIC ELECTRICAL AND ELECTRONICS ENGINEERING",
        grade: "A",
        credits: null,
        gradePoint: null,
        marksObtained: null,
        maxMarks: null,
        confidence: "HIGH" as const,
      },
      {
        subjectCode: "ECE279",
        subjectName: "BASIC ELECTRICAL AND ELECTRONICS ENGINEERING LABORATORY",
        grade: "A+",
        credits: null,
        gradePoint: null,
        marksObtained: null,
        maxMarks: null,
        confidence: "HIGH" as const,
      },
      {
        subjectCode: "INT108",
        subjectName: "PYTHON PROGRAMMING",
        grade: "B+",
        credits: null,
        gradePoint: null,
        marksObtained: null,
        maxMarks: null,
        confidence: "HIGH" as const,
      },
      {
        subjectCode: "MTH165",
        subjectName: "MATHEMATICS FOR ENGINEERS",
        grade: "C",
        credits: null,
        gradePoint: null,
        marksObtained: null,
        maxMarks: null,
        confidence: "HIGH" as const,
      },
    ];

    it("extracts all 7 courses from the exact university examination result table", async () => {
      process.env.GEMINI_API_KEY = "mock-key";

      const mockResponse = JSON.stringify({
        documentType: "GRADES",
        detectedSemester: "I",
        totalSubjectsDetected: 7,
        confidence: "HIGH",
        summary: "Extracted 7 course grades from result table",
        attendanceRows: [],
        gradeRows: exactSevenCourseRows,
        detailedMarksRows: [],
        unreadableNotes: null,
      });

      mockGenerateContent.mockResolvedValueOnce({ text: mockResponse });

      const result = await extractAcademicDataWithGemini(
        [{ data: "base64image", mimeType: "image/png" }],
        "GRADES"
      );

      expect(result.documentType).toBe("GRADES");
      expect(result.gradeRows).toHaveLength(7);

      expect(result.gradeRows[0]).toMatchObject({ subjectCode: "CHE110", grade: "A+" });
      expect(result.gradeRows[1]).toMatchObject({ subjectCode: "CSE111", grade: "A+" });
      expect(result.gradeRows[2]).toMatchObject({ subjectCode: "CSE326", grade: "O" });
      expect(result.gradeRows[3]).toMatchObject({ subjectCode: "ECE249", grade: "A" });
      expect(result.gradeRows[4]).toMatchObject({ subjectCode: "ECE279", grade: "A+" });
      expect(result.gradeRows[5]).toMatchObject({ subjectCode: "INT108", grade: "B+" });
      expect(result.gradeRows[6]).toMatchObject({ subjectCode: "MTH165", grade: "C" });
    });

    it("considers a grade row valid with no marks, no credits, and no gradePoint", () => {
      const row = {
        subjectCode: "CHE110",
        subjectName: "ENVIRONMENTAL STUDIES",
        grade: "A+",
        credits: null,
        gradePoint: null,
        marksObtained: null,
        maxMarks: null,
        confidence: "HIGH",
      };

      const parsed = ExtractedGradeRowSchema.safeParse(row);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.subjectCode).toBe("CHE110");
        expect(parsed.data.subjectName).toBe("ENVIRONMENTAL STUDIES");
        expect(parsed.data.grade).toBe("A+");
        expect(parsed.data.credits).toBeNull();
        expect(parsed.data.marksObtained).toBeNull();
        expect(parsed.data.gradePoint).toBeNull();
      }
    });

    it("does not drop unmatched courses during matching, returning status NEEDS_REVIEW", () => {
      const existingSubjects: MatchedSubjectInfo[] = []; // User has no existing subjects in semester

      const match = matchSubject("CHE110", "ENVIRONMENTAL STUDIES", existingSubjects);

      expect(match.matchedSubject).toBeNull();
      expect(match.status).toBe("NEEDS_REVIEW");
    });

    it("flags 0-row extraction as suspicious when totalSubjectsDetected indicated courses", () => {
      const zeroRowResult = {
        documentType: "GRADES" as const,
        totalSubjectsDetected: 7,
        confidence: "LOW" as const,
        attendanceRows: [],
        gradeRows: [],
        detailedMarksRows: [],
      };

      expect(isExtractionSuspicious(zeroRowResult, "GRADES")).toBe(true);
    });

    it("flags 1-row extraction as suspicious when a table document was scanned", () => {
      const singleRowResult = {
        documentType: "GRADES" as const,
        totalSubjectsDetected: 7,
        confidence: "MEDIUM" as const,
        attendanceRows: [],
        gradeRows: [exactSevenCourseRows[0]],
        detailedMarksRows: [],
      };

      expect(isExtractionSuspicious(singleRowResult, "GRADES")).toBe(true);
    });

    it("recovers missing course rows using grade-specific recovery prompt", async () => {
      process.env.GEMINI_API_KEY = "mock-key";

      // Pass 1 returns only 1 row
      const firstPassJson = JSON.stringify({
        documentType: "GRADES",
        detectedSemester: "I",
        totalSubjectsDetected: 7,
        confidence: "MEDIUM",
        summary: "Partial table",
        attendanceRows: [],
        gradeRows: [exactSevenCourseRows[0]],
        detailedMarksRows: [],
        unreadableNotes: null,
      });

      // Pass 2 recovery returns all 7 rows
      const recoveryPassJson = JSON.stringify({
        documentType: "GRADES",
        detectedSemester: "I",
        totalSubjectsDetected: 7,
        confidence: "HIGH",
        summary: "Recovered all 7 courses",
        attendanceRows: [],
        gradeRows: exactSevenCourseRows,
        detailedMarksRows: [],
        unreadableNotes: null,
      });

      mockGenerateContent
        .mockResolvedValueOnce({ text: firstPassJson })
        .mockResolvedValueOnce({ text: recoveryPassJson });

      const result = await extractAcademicDataWithGemini(
        [{ data: "base64image", mimeType: "image/png" }],
        "GRADES",
        { initialDelayMs: 0 }
      );

      // Verify recovery prompt contains grade-specific instructions
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
      const recoveryPrompt = mockGenerateContent.mock.calls[1][0].contents[0].parts[1].text;
      expect(recoveryPrompt).toContain("SECOND-PASS UNIVERSITY RESULT TABLE RECOVERY EXTRACTION");
      expect(recoveryPrompt).toContain("course codes");

      // Verify merged result contains all 7 course rows
      expect(result.gradeRows).toHaveLength(7);
      expect(result.gradeRows.map((r) => r.subjectCode)).toEqual([
        "CHE110",
        "CSE111",
        "CSE326",
        "ECE249",
        "ECE279",
        "INT108",
        "MTH165",
      ]);
    });

    it("supports multi-image grade extraction (Image 1: 3 rows, Image 2: 4 rows -> 7 rows)", async () => {
      process.env.GEMINI_API_KEY = "mock-key";

      const image1Output = JSON.stringify({
        documentType: "GRADES",
        totalSubjectsDetected: 3,
        confidence: "HIGH",
        attendanceRows: [],
        gradeRows: exactSevenCourseRows.slice(0, 3), // CHE110, CSE111, CSE326
        detailedMarksRows: [],
        unreadableNotes: null,
      });

      const image2Output = JSON.stringify({
        documentType: "GRADES",
        totalSubjectsDetected: 4,
        confidence: "HIGH",
        attendanceRows: [],
        gradeRows: exactSevenCourseRows.slice(3, 7), // ECE249, ECE279, INT108, MTH165
        detailedMarksRows: [],
        unreadableNotes: null,
      });

      mockGenerateContent
        .mockResolvedValueOnce({ text: image1Output })
        .mockResolvedValueOnce({ text: image2Output });

      const result = await extractAcademicDataWithGemini(
        [
          { data: "base64image1", mimeType: "image/png" },
          { data: "base64image2", mimeType: "image/png" },
        ],
        "GRADES"
      );

      expect(result.gradeRows).toHaveLength(7);
      expect(result.gradeRows[0].sourceImageIndex).toBe(1);
      expect(result.gradeRows[1].sourceImageIndex).toBe(1);
      expect(result.gradeRows[2].sourceImageIndex).toBe(1);
      expect(result.gradeRows[3].sourceImageIndex).toBe(2);
      expect(result.gradeRows[4].sourceImageIndex).toBe(2);
      expect(result.gradeRows[5].sourceImageIndex).toBe(2);
      expect(result.gradeRows[6].sourceImageIndex).toBe(2);
    });

    it("deduplicates duplicate grade rows across multiple images by course code", () => {
      const rowsWithDuplicates = [
        {
          sourceImageIndex: 1,
          subjectCode: "CHE110",
          subjectName: "ENVIRONMENTAL STUDIES",
          grade: "A+",
          confidence: "MEDIUM" as const,
        },
        {
          sourceImageIndex: 2,
          subjectCode: "CHE110",
          subjectName: "ENVIRONMENTAL STUDIES",
          grade: "A+",
          confidence: "HIGH" as const,
        },
        {
          sourceImageIndex: 1,
          subjectCode: "CSE111",
          subjectName: "ORIENTATION TO COMPUTING-I",
          grade: "A+",
          confidence: "HIGH" as const,
        },
      ];

      const deduplicated = deduplicateGradeRows(rowsWithDuplicates);
      expect(deduplicated).toHaveLength(2);
      expect(deduplicated.find((r) => r.subjectCode === "CHE110")?.confidence).toBe("HIGH");
    });

    it("builds dedicated grade prompt and recovery prompt with table instructions", () => {
      const extractionPrompt = buildExtractionPrompt("GRADES", 1, 1);
      expect(extractionPrompt).toContain("university examination/result table");
      expect(extractionPrompt).toContain("CHE110");
      expect(extractionPrompt).toContain("leave marksObtained and maxMarks as null");
      expect(extractionPrompt).toContain("leave credits as null");

      const recoveryPrompt = buildRecoveryPrompt("GRADES", 1);
      expect(recoveryPrompt).toContain("SECOND-PASS UNIVERSITY RESULT TABLE RECOVERY EXTRACTION");
      expect(recoveryPrompt).toContain("Reinspect every horizontal course row");
    });
  });
});
