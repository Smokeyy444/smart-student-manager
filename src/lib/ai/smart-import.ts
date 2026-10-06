"use server";

import { prisma } from "../prisma";
import { getCurrentUser, assertUserOwnsRecord } from "../auth/guards";
import { revalidatePath } from "next/cache";
import {
  extractAcademicDataWithGemini,
  isGeminiConfigured,
  getGeminiModelName,
  type ImagePart,
} from "./gemini";
import {
  ImportDocumentTypeSchema,
  ConfirmedSmartImportSchema,
  type ImportDocumentType,
  type SmartImportReviewPayload,
  type MatchedSubjectInfo,
  type ReviewAttendanceItem,
  type ReviewGradeItem,
  type ReviewDetailedMarksItem,
  type ConfirmedSmartImportInput,
  type ExtractedAttendanceRow,
  type ExtractedGradeRow,
  type ExtractedDetailedMarksSubject,
} from "./extraction-schemas";
import { calculateAttendancePercentage } from "../calculations/attendance";
import { getActiveGradingScale } from "../actions/academic";
import {
  validateMarksAndGrade,
  resolveGradeFromMarks,
  resolveGradePoint,
  isGradePassing,
} from "../calculations/grading-scale";
import {
  checkRateLimit,
  matchSubject,
  resolveImageMimeType,
} from "./matching";
import type { ActionResult } from "../actions/auth";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Graceful fallback for non-Next request context (tests)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FILE VALIDATION CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_IMAGE_COUNT = 5;

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXTRACTION SERVER ACTION
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtractImagesResult {
  success: boolean;
  error?: string;
  payload?: SmartImportReviewPayload;
}

export async function processSmartImportImages(
  formData: FormData
): Promise<ExtractImagesResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  if (!isGeminiConfigured()) {
    return {
      success: false,
      error:
        "GEMINI_API_KEY is not configured on the server. Smart Import requires an API key in your server environment. You can still use CSV import.",
    };
  }

  // Rate limiting check
  const rateLimit = checkRateLimit(user.id);
  if (!rateLimit.allowed) {
    return {
      success: false,
      error: `Rate limit reached. Please wait ${rateLimit.retryAfterSeconds || 60} seconds before uploading more screenshots. You can still use CSV import.`,
    };
  }

  // Extract form fields
  const semesterId = formData.get("semesterId") as string;
  if (!semesterId) {
    return { success: false, error: "Target semester ID is required." };
  }

  // Verify semester ownership
  const semester = await prisma.semester.findUnique({
    where: { id: semesterId },
    include: {
      subjects: {
        include: {
          attendance: true,
          grade: true,
        },
      },
    },
  });

  if (!semester) {
    return { success: false, error: "Target semester not found." };
  }
  assertUserOwnsRecord(semester.userId, user.id);

  const rawDocumentType = (formData.get("documentType") as string) || "AUTO_DETECT";
  const parsedDocType = ImportDocumentTypeSchema.safeParse(rawDocumentType);
  const documentType: ImportDocumentType = parsedDocType.success ? parsedDocType.data : "AUTO_DETECT";

  // Extract image files
  const fileEntries = formData.getAll("images") as File[];
  if (!fileEntries || fileEntries.length === 0) {
    return { success: false, error: "Please select at least one screenshot to upload." };
  }

  if (fileEntries.length > MAX_IMAGE_COUNT) {
    return {
      success: false,
      error: `You can upload at most ${MAX_IMAGE_COUNT} screenshots per session.`,
    };
  }

  // Validate files and convert to base64
  const imageParts: ImagePart[] = [];
  for (const file of fileEntries) {
    if (!file || file.size === 0) {
      return { success: false, error: "One or more uploaded files are empty." };
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        success: false,
        error: `File '${file.name}' exceeds the 10 MB size limit. Please upload a smaller image.`,
      };
    }

    const mime = resolveImageMimeType(file);
    if (!mime) {
      return {
        success: false,
        error: `File '${file.name}' has an unsupported format (${file.type || "unknown"}). Only PNG, JPEG, and WEBP images are supported.`,
      };
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");
    imageParts.push({
      data: base64Data,
      mimeType: mime,
    });
  }

  // Build existing subjects lookup
  const existingSubjectInfos: MatchedSubjectInfo[] = semester.subjects.map((sub) => ({
    id: sub.id,
    name: sub.name,
    code: sub.code,
    creditHours: sub.creditHours,
    category: sub.category,
    hasExistingAttendance: !!sub.attendance,
    existingAttended: sub.attendance?.classesAttended,
    existingConducted: sub.attendance?.classesConducted,
    hasExistingGrade: !!sub.grade,
    existingGradeLetter: sub.grade?.gradeLetter,
    existingMarksObtained: sub.grade?.marksObtained,
    existingMaxMarks: sub.grade?.maxMarks,
  }));

  const gradingScale = await getActiveGradingScale(user.id);

  try {
    // Call Gemini API (handles table-level extraction, multi-image merging, and deduplication)
    const aiResult = await extractAcademicDataWithGemini(imageParts, documentType);

    // Build Review Items
    const attendanceItems: ReviewAttendanceItem[] = [];
    const gradeItems: ReviewGradeItem[] = [];
    const detailedMarksItems: ReviewDetailedMarksItem[] = [];

    // 1. Process Attendance Rows
    for (let i = 0; i < aiResult.attendanceRows.length; i++) {
      const row: ExtractedAttendanceRow = aiResult.attendanceRows[i];
      const { matchedSubject, status } = matchSubject(
        row.subjectCode,
        row.subjectName,
        existingSubjectInfos
      );

      const attended = typeof row.attended === "number" ? row.attended : null;
      const conducted = typeof row.conducted === "number" ? row.conducted : null;

      let calculatedPercentage: number | null = null;
      let percentageWarning: string | null = null;
      let isValid = true;
      let validationError: string | null = null;

      if (attended !== null && conducted !== null) {
        if (conducted < 0 || attended < 0) {
          isValid = false;
          validationError = "Classes attended and conducted must be non-negative.";
        } else if (attended > conducted) {
          isValid = false;
          validationError = `Attended classes (${attended}) cannot exceed conducted classes (${conducted}).`;
        } else {
          calculatedPercentage = calculateAttendancePercentage(attended, conducted);

          if (row.attendancePercentage !== null && row.attendancePercentage !== undefined) {
            const diff = Math.abs(calculatedPercentage - row.attendancePercentage);
            if (diff > 0.1) {
              percentageWarning = `Imported percentage (${row.attendancePercentage}%) differs from calculated percentage (${calculatedPercentage}%). The app will use ${calculatedPercentage}% based on ${attended}/${conducted}.`;
            }
          }
        }
      } else {
        isValid = false;
        validationError = "Both attended and conducted counts are required.";
      }

      const hasDuplicate = !!matchedSubject?.hasExistingAttendance;

      attendanceItems.push({
        id: `att-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
        sourceImageIndex: row.sourceImageIndex ?? null,
        selected: isValid,
        subjectCode: row.subjectCode ?? null,
        subjectName: row.subjectName ?? null,
        attended,
        conducted,
        extractedPercentage: row.attendancePercentage ?? null,
        calculatedPercentage,
        percentageWarning,
        lastAttendedDate: row.lastAttendedDate ?? null,
        dutyLeave: row.dutyLeave ?? null,
        confidence: row.confidence ?? "MEDIUM",
        matchStatus: status,
        matchedSubjectId: matchedSubject?.id ?? null,
        createNewSubjectName: !matchedSubject ? row.subjectName || row.subjectCode || "New Subject" : undefined,
        duplicateAction: hasDuplicate ? "REPLACE" : "KEEP_EXISTING",
        hasDuplicate,
        isValid,
        validationError,
      });
    }

    // 2. Process Grade Rows
    for (let i = 0; i < aiResult.gradeRows.length; i++) {
      const row: ExtractedGradeRow = aiResult.gradeRows[i];
      const { matchedSubject, status } = matchSubject(
        row.subjectCode,
        row.subjectName,
        existingSubjectInfos
      );

      const marksObtained = typeof row.marksObtained === "number" ? row.marksObtained : null;
      const maxMarks = typeof row.maxMarks === "number" ? row.maxMarks : 100.0;
      const gradeLetter = row.grade ? row.grade.trim().toUpperCase() : null;

      let isContradictory = false;
      let contradictionReason: string | null = null;
      let computedGradeFromMarks: string | null = null;
      let isValid = true;
      let validationError: string | null = null;

      if (!gradeLetter && marksObtained === null) {
        isValid = false;
        validationError = "Neither grade letter nor marks obtained were readable.";
      }

      if (marksObtained !== null) {
        const resolved = resolveGradeFromMarks(marksObtained, maxMarks, gradingScale);
        if (resolved) {
          computedGradeFromMarks = resolved.letter;
        }
      }

      // Check contradiction if both marks and grade are present
      if (marksObtained !== null && gradeLetter) {
        const check = validateMarksAndGrade(marksObtained, maxMarks, gradeLetter, gradingScale);
        if (check.isContradictory) {
          isContradictory = true;
          contradictionReason = check.conflictReason || "Contradiction detected between entered marks and grade letter.";
          isValid = false; // Block import until resolved
        }
      }

      const hasDuplicate = !!matchedSubject?.hasExistingGrade;

      gradeItems.push({
        id: `grd-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
        sourceImageIndex: row.sourceImageIndex ?? null,
        selected: isValid && !isContradictory,
        subjectCode: row.subjectCode ?? null,
        subjectName: row.subjectName ?? null,
        credits: row.credits ?? null,
        grade: gradeLetter,
        gradePoint: row.gradePoint ?? null,
        marksObtained,
        maxMarks,
        computedGradeFromMarks,
        isContradictory,
        contradictionReason,
        confidence: row.confidence ?? "MEDIUM",
        matchStatus: status,
        matchedSubjectId: matchedSubject?.id ?? null,
        createNewSubjectName: !matchedSubject ? row.subjectName || row.subjectCode || "New Subject" : undefined,
        duplicateAction: hasDuplicate ? "REPLACE" : "KEEP_EXISTING",
        hasDuplicate,
        isValid: isValid && !isContradictory,
        validationError,
      });
    }

    // 3. Process Detailed Marks Rows
    for (let i = 0; i < aiResult.detailedMarksRows.length; i++) {
      const row: ExtractedDetailedMarksSubject = aiResult.detailedMarksRows[i];
      const { matchedSubject, status } = matchSubject(
        row.subjectCode,
        row.subjectName,
        existingSubjectInfos
      );

      // Compute total marks from components if not explicitly provided
      let computedTotalMarks = 0;
      let computedMaxMarks = 0;
      for (const comp of row.components) {
        if (typeof comp.marksObtained === "number") {
          computedTotalMarks += comp.marksObtained;
        }
        if (typeof comp.maxMarks === "number") {
          computedMaxMarks += comp.maxMarks;
        }
      }

      const finalMarks =
        typeof row.finalMarksObtained === "number"
          ? row.finalMarksObtained
          : computedTotalMarks > 0
          ? computedTotalMarks
          : null;

      const finalMax =
        typeof row.finalMaxMarks === "number"
          ? row.finalMaxMarks
          : computedMaxMarks > 0
          ? computedMaxMarks
          : 100.0;

      const hasDuplicate = !!matchedSubject?.hasExistingGrade;

      detailedMarksItems.push({
        id: `dm-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
        sourceImageIndex: row.sourceImageIndex ?? null,
        selected: true,
        subjectCode: row.subjectCode ?? null,
        subjectName: row.subjectName ?? null,
        components: row.components,
        finalMarksObtained: finalMarks,
        finalMaxMarks: finalMax,
        finalGrade: row.finalGrade ?? null,
        computedTotalMarks: computedTotalMarks > 0 ? computedTotalMarks : null,
        computedMaxMarks: computedMaxMarks > 0 ? computedMaxMarks : null,
        confidence: row.confidence ?? "MEDIUM",
        matchStatus: status,
        matchedSubjectId: matchedSubject?.id ?? null,
        createNewSubjectName: !matchedSubject ? row.subjectName || row.subjectCode || "New Subject" : undefined,
        duplicateAction: hasDuplicate ? "REPLACE" : "KEEP_EXISTING",
        hasDuplicate,
        isValid: true,
        validationError: null,
      });
    }

    // 4. Completeness check & suspicious extraction detection
    const totalDetectedRows =
      attendanceItems.length + gradeItems.length + detailedMarksItems.length;

    // Meaningful completeness detection: if Gemini returns 0 extracted rows
    if (totalDetectedRows === 0) {
      return {
        success: false,
        error:
          "Could not reliably extract the course rows from this result screenshot. Please try again or use CSV/manual import.",
      };
    }

    if (
      (documentType === "GRADES" || aiResult.documentType === "GRADES") &&
      gradeItems.length === 0
    ) {
      return {
        success: false,
        error:
          "Could not reliably extract the course rows from this result screenshot. Please try again or use CSV/manual import.",
      };
    }

    let isPotentiallyIncomplete = false;
    let completenessWarning: string | null = null;

    if (documentType === "GRADES" || aiResult.documentType === "GRADES") {
      if (gradeItems.length > 0 && gradeItems.length <= 2) {
        isPotentiallyIncomplete = true;
        completenessWarning = `Only ${gradeItems.length} course${
          gradeItems.length === 1 ? "" : "s"
        } detected — please review your screenshot(s) because some rows may have been missed.`;
      } else if (
        typeof aiResult.totalSubjectsDetected === "number" &&
        aiResult.totalSubjectsDetected > gradeItems.length
      ) {
        isPotentiallyIncomplete = true;
        completenessWarning = `The AI detected approximately ${aiResult.totalSubjectsDetected} course rows in the document, but only ${gradeItems.length} were fully extracted. Please verify all courses below.`;
      }
    } else if (documentType === "ATTENDANCE" || aiResult.documentType === "ATTENDANCE") {
      if (attendanceItems.length > 0 && attendanceItems.length <= 2) {
        isPotentiallyIncomplete = true;
        completenessWarning = `Only ${attendanceItems.length} subject${
          attendanceItems.length === 1 ? "" : "s"
        } detected — please review your screenshot(s) because some rows may have been missed.`;
      } else if (
        typeof aiResult.totalSubjectsDetected === "number" &&
        aiResult.totalSubjectsDetected > attendanceItems.length
      ) {
        isPotentiallyIncomplete = true;
        completenessWarning = `The AI detected approximately ${aiResult.totalSubjectsDetected} subject rows in the document, but only ${attendanceItems.length} were fully extracted. Please verify all courses below.`;
      }
    }

    // 5. Development-only safe diagnostics (Requirement 2: no images, base64, API keys or PII)
    if (process.env.NODE_ENV !== "production") {
      const matchedGrades = gradeItems.filter((g) => g.matchedSubjectId !== null).length;
      const unmatchedGrades = gradeItems.filter((g) => g.matchedSubjectId === null).length;
      console.log("[Smart Import Diagnostics: Final Payload]", {
        extractionType: documentType,
        numberImages: fileEntries.length,
        geminiModel: getGeminiModelName(),
        responseReceived: true,
        parsedGradeRowsLength: aiResult.gradeRows.length,
        parsedAttendanceRowsLength: aiResult.attendanceRows.length,
        parsedDetailedMarksRowsLength: aiResult.detailedMarksRows.length,
        totalSubjectsDetected: aiResult.totalSubjectsDetected,
        validationSuccess: true,
        rowsAfterDeduplication:
          aiResult.gradeRows.length +
          aiResult.attendanceRows.length +
          aiResult.detailedMarksRows.length,
        rowsAfterMatching: {
          grades: { matched: matchedGrades, unmatchedNeedsMapping: unmatchedGrades },
        },
        rowsInFinalReviewPayload: {
          attendanceItems: attendanceItems.length,
          gradeItems: gradeItems.length,
          detailedMarksItems: detailedMarksItems.length,
        },
      });
    }

    const payload: SmartImportReviewPayload = {
      documentType: aiResult.documentType,
      detectedSemester: aiResult.detectedSemester ?? null,
      summary: aiResult.summary ?? null,
      attendanceItems,
      gradeItems,
      detailedMarksItems,
      existingSubjects: existingSubjectInfos,
      targetSemesterId: semesterId,
      totalImagesProcessed: fileEntries.length,
      totalDetectedRows,
      isPotentiallyIncomplete,
      completenessWarning,
    };

    return {
      success: true,
      payload,
    };
  } catch (error: unknown) {
    let message = error instanceof Error ? error.message : "Failed to process image with AI.";

    // Never leak raw Gemini JSON error blobs to the UI
    if (message.includes('{"error"') || (message.startsWith("{") && message.includes('"message"'))) {
      try {
        const parsed = JSON.parse(message);
        const innerCode = parsed?.error?.code;
        const innerStatus = parsed?.error?.status;
        if (innerCode === 503 || innerStatus === "UNAVAILABLE" || [500, 502, 504].includes(innerCode)) {
          message = "AI service is temporarily unavailable. Please try again later or use CSV / Manual Import.";
        } else if (parsed?.error?.message) {
          message = parsed.error.message;
        }
      } catch {
        // Not valid JSON
      }
    }

    if (
      message.includes("503") ||
      message.includes("UNAVAILABLE") ||
      message.includes("high demand") ||
      message.includes("overloaded")
    ) {
      message = "AI service is temporarily unavailable. Please try again later or use CSV / Manual Import.";
    }

    console.error("Smart Import processing error:", message);
    return {
      success: false,
      error: message || "AI service is temporarily unavailable. Please try again later or use CSV / Manual Import.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRMED SMART IMPORT COMMIT SERVER ACTION
// ─────────────────────────────────────────────────────────────────────────────

export interface SaveSmartImportResult extends ActionResult {
  importedCount?: number;
  skippedCount?: number;
  createdSubjectsCount?: number;
}

export async function saveSmartImport(
  input: ConfirmedSmartImportInput
): Promise<SaveSmartImportResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Authentication required." };
  }

  const validation = ConfirmedSmartImportSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: "Validation failed on confirmed import payload.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { semesterId, attendanceItems, gradeItems } = validation.data;

  // Verify semester ownership
  const semester = await prisma.semester.findUnique({
    where: { id: semesterId },
    include: { subjects: true },
  });

  if (!semester) {
    return { success: false, error: "Target semester not found." };
  }
  assertUserOwnsRecord(semester.userId, user.id);

  const scale = await getActiveGradingScale(user.id);

  let importedCount = 0;
  let skippedCount = 0;
  let createdSubjectsCount = 0;

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Process Attendance Items
      for (const item of attendanceItems) {
        if (item.action === "KEEP_EXISTING") {
          skippedCount++;
          continue;
        }

        let targetSubjectId = item.matchedSubjectId;

        // If createNew is specified or no matchedSubjectId
        if (item.createNew || !targetSubjectId) {
          const newSub = await tx.subject.create({
            data: {
              semesterId,
              name: item.newSubjectName?.trim() || "Untitled Course",
              code: item.newSubjectCode?.trim() || null,
              creditHours: item.newSubjectCredits || 3.0,
              category: "CORE",
              isAudit: false,
            },
          });
          targetSubjectId = newSub.id;
          createdSubjectsCount++;
        }

        // Upsert AttendanceRecord
        await tx.attendanceRecord.upsert({
          where: { subjectId: targetSubjectId },
          update: {
            classesAttended: item.attended,
            classesConducted: item.conducted,
          },
          create: {
            subjectId: targetSubjectId,
            classesAttended: item.attended,
            classesConducted: item.conducted,
          },
        });
        importedCount++;
      }

      // 2. Process Grade Items
      for (const item of gradeItems) {
        if (item.action === "KEEP_EXISTING") {
          skippedCount++;
          continue;
        }

        let targetSubjectId = item.matchedSubjectId;

        // If createNew is specified or no matchedSubjectId
        if (item.createNew || !targetSubjectId) {
          const newSub = await tx.subject.create({
            data: {
              semesterId,
              name: item.newSubjectName?.trim() || "Untitled Course",
              code: item.newSubjectCode?.trim() || null,
              creditHours: item.newSubjectCredits || 3.0,
              category: "CORE",
              isAudit: false,
            },
          });
          targetSubjectId = newSub.id;
          createdSubjectsCount++;
        }

        // Resolve grade letter and points
        let resolvedGradeLetter = item.gradeLetter ? item.gradeLetter.trim().toUpperCase() : null;
        let resolvedGradePoint = item.gradePoint ?? null;
        let passing = true;

        if (resolvedGradeLetter) {
          const pt = resolveGradePoint(resolvedGradeLetter, scale);
          if (pt !== null) {
            resolvedGradePoint = pt;
          }
          passing = isGradePassing(resolvedGradeLetter, scale);
        } else if (item.marksObtained !== null && item.marksObtained !== undefined) {
          const mapping = resolveGradeFromMarks(item.marksObtained, item.maxMarks || 100.0, scale);
          if (mapping) {
            resolvedGradeLetter = mapping.letter;
            resolvedGradePoint = mapping.points;
            passing = mapping.isPassing;
          }
        }

        await tx.subjectGrade.upsert({
          where: { subjectId: targetSubjectId },
          update: {
            gradeLetter: resolvedGradeLetter,
            gradePoint: resolvedGradePoint,
            marksObtained: item.marksObtained ?? null,
            maxMarks: item.maxMarks || 100.0,
            isPassing: passing,
          },
          create: {
            subjectId: targetSubjectId,
            gradeLetter: resolvedGradeLetter,
            gradePoint: resolvedGradePoint,
            marksObtained: item.marksObtained ?? null,
            maxMarks: item.maxMarks || 100.0,
            isPassing: passing,
          },
        });
        importedCount++;
      }
    });

    safeRevalidate("/grades");
    safeRevalidate("/attendance");
    safeRevalidate("/dashboard");

    return {
      success: true,
      importedCount,
      skippedCount,
      createdSubjectsCount,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to commit imported academic records.";
    console.error("Error committing Smart Import:", error);
    return {
      success: false,
      error: message,
    };
  }
}
