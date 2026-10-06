import { z } from "zod";

/**
 * Confidence rating assigned to an extracted field or row.
 */
export const ConfidenceLevelSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

/**
 * Supported document extraction types.
 */
export const ImportDocumentTypeSchema = z.enum([
  "AUTO_DETECT",
  "ATTENDANCE",
  "GRADES",
  "DETAILED_MARKS",
  "UNKNOWN",
]);
export type ImportDocumentType = z.infer<typeof ImportDocumentTypeSchema>;

/**
 * Extracted attendance row schema.
 * Represents a single course's attendance record extracted from an image.
 * Fields not clearly visible must be null.
 */
export const ExtractedAttendanceRowSchema = z.object({
  sourceImageIndex: z.number().int().min(1).nullable().optional(),
  subjectCode: z.string().trim().nullable().optional(),
  subjectName: z.string().trim().nullable().optional(),
  attended: z.number().int().min(0).nullable().optional(),
  conducted: z.number().int().min(0).nullable().optional(),
  attendancePercentage: z.number().min(0).max(100).nullable().optional(),
  lastAttendedDate: z.string().trim().nullable().optional(),
  dutyLeave: z.number().int().min(0).nullable().optional(),
  notes: z.string().trim().nullable().optional(),
  confidence: ConfidenceLevelSchema.default("MEDIUM"),
});
export type ExtractedAttendanceRow = z.infer<typeof ExtractedAttendanceRowSchema>;

/**
 * Extracted grade row schema.
 * Represents a subject's term/semester grade or final marks.
 * Fields not clearly visible must be null.
 */
export const ExtractedGradeRowSchema = z.object({
  sourceImageIndex: z.number().int().min(1).nullable().optional(),
  semester: z.string().trim().nullable().optional(),
  subjectCode: z.string().trim().nullable().optional(),
  subjectName: z.string().trim().nullable().optional(),
  credits: z.number().min(0).max(30).nullable().optional(),
  grade: z.string().trim().nullable().optional(),
  gradePoint: z.number().min(0).max(10).nullable().optional(),
  marksObtained: z.number().min(0).nullable().optional(),
  maxMarks: z.number().min(0).nullable().optional(),
  confidence: ConfidenceLevelSchema.default("MEDIUM"),
});
export type ExtractedGradeRow = z.infer<typeof ExtractedGradeRowSchema>;

/**
 * Detailed marks assessment component (e.g., Continuous Assessment, Mid Term, Theory End Term).
 * Preserves the exact source terminology without arbitrary renaming.
 */
export const ExtractedMarksComponentSchema = z.object({
  componentName: z.string().trim().min(1),
  marksObtained: z.number().min(0).nullable().optional(),
  maxMarks: z.number().min(0).nullable().optional(),
  weightageEarned: z.number().min(0).nullable().optional(),
  weightageMax: z.number().min(0).nullable().optional(),
  confidence: ConfidenceLevelSchema.default("MEDIUM"),
});
export type ExtractedMarksComponent = z.infer<typeof ExtractedMarksComponentSchema>;

/**
 * Extracted subject with detailed marks components breakdown.
 */
export const ExtractedDetailedMarksSubjectSchema = z.object({
  sourceImageIndex: z.number().int().min(1).nullable().optional(),
  semester: z.string().trim().nullable().optional(),
  subjectCode: z.string().trim().nullable().optional(),
  subjectName: z.string().trim().nullable().optional(),
  components: z.array(ExtractedMarksComponentSchema).default([]),
  finalMarksObtained: z.number().min(0).nullable().optional(),
  finalMaxMarks: z.number().min(0).nullable().optional(),
  finalGrade: z.string().trim().nullable().optional(),
  confidence: ConfidenceLevelSchema.default("MEDIUM"),
});
export type ExtractedDetailedMarksSubject = z.infer<typeof ExtractedDetailedMarksSubjectSchema>;

/**
 * Top-level structured extraction response from Gemini.
 */
export const SmartExtractionResultSchema = z.object({
  documentType: z.enum(["ATTENDANCE", "GRADES", "DETAILED_MARKS", "UNKNOWN"]),
  detectedSemester: z.string().trim().nullable().optional(),
  totalSubjectsDetected: z.number().int().min(0).nullable().optional(),
  confidence: ConfidenceLevelSchema.default("MEDIUM"),
  summary: z.string().trim().nullable().optional(),
  attendanceRows: z.array(ExtractedAttendanceRowSchema).default([]),
  gradeRows: z.array(ExtractedGradeRowSchema).default([]),
  detailedMarksRows: z.array(ExtractedDetailedMarksSubjectSchema).default([]),
  unreadableNotes: z.string().trim().nullable().optional(),
});
export type SmartExtractionResult = z.infer<typeof SmartExtractionResultSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Client Review & DTO Types
// ─────────────────────────────────────────────────────────────────────────────

export type SubjectMatchStatus =
  | "EXACT_CODE"
  | "NORMALIZED_CODE"
  | "NAME_MATCH"
  | "NEEDS_REVIEW"
  | "CREATE_NEW";

export interface MatchedSubjectInfo {
  id: string;
  name: string;
  code: string | null;
  creditHours: number;
  category: string;
  hasExistingAttendance: boolean;
  existingAttended?: number;
  existingConducted?: number;
  hasExistingGrade: boolean;
  existingGradeLetter?: string | null;
  existingMarksObtained?: number | null;
  existingMaxMarks?: number | null;
}

export interface ReviewAttendanceItem {
  id: string; // client row uuid
  sourceImageIndex?: number | null;
  selected: boolean;
  subjectCode: string | null;
  subjectName: string | null;
  attended: number | null;
  conducted: number | null;
  extractedPercentage: number | null;
  calculatedPercentage: number | null;
  percentageWarning: string | null;
  lastAttendedDate: string | null;
  dutyLeave: number | null;
  confidence: ConfidenceLevel;
  matchStatus: SubjectMatchStatus;
  matchedSubjectId: string | null;
  createNewSubjectName?: string;
  duplicateAction: "REPLACE" | "KEEP_EXISTING";
  hasDuplicate: boolean;
  isValid: boolean;
  validationError: string | null;
}

export interface ReviewGradeItem {
  id: string; // client row uuid
  sourceImageIndex?: number | null;
  selected: boolean;
  subjectCode: string | null;
  subjectName: string | null;
  credits: number | null;
  grade: string | null;
  gradePoint: number | null;
  marksObtained: number | null;
  maxMarks: number | null;
  computedGradeFromMarks: string | null;
  isContradictory: boolean;
  contradictionReason: string | null;
  confidence: ConfidenceLevel;
  matchStatus: SubjectMatchStatus;
  matchedSubjectId: string | null;
  createNewSubjectName?: string;
  duplicateAction: "REPLACE" | "KEEP_EXISTING";
  hasDuplicate: boolean;
  isValid: boolean;
  validationError: string | null;
}

export interface ReviewDetailedMarksItem {
  id: string; // client row uuid
  sourceImageIndex?: number | null;
  selected: boolean;
  subjectCode: string | null;
  subjectName: string | null;
  components: ExtractedMarksComponent[];
  finalMarksObtained: number | null;
  finalMaxMarks: number | null;
  finalGrade: string | null;
  computedTotalMarks: number | null;
  computedMaxMarks: number | null;
  confidence: ConfidenceLevel;
  matchStatus: SubjectMatchStatus;
  matchedSubjectId: string | null;
  createNewSubjectName?: string;
  duplicateAction: "REPLACE" | "KEEP_EXISTING";
  hasDuplicate: boolean;
  isValid: boolean;
  validationError: string | null;
}

export interface SmartImportReviewPayload {
  documentType: "ATTENDANCE" | "GRADES" | "DETAILED_MARKS" | "UNKNOWN";
  detectedSemester: string | null;
  summary: string | null;
  attendanceItems: ReviewAttendanceItem[];
  gradeItems: ReviewGradeItem[];
  detailedMarksItems: ReviewDetailedMarksItem[];
  existingSubjects: MatchedSubjectInfo[];
  targetSemesterId: string;
  totalImagesProcessed?: number;
  totalDetectedRows?: number;
  isPotentiallyIncomplete?: boolean;
  completenessWarning?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Confirmed Import Input Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const ConfirmedAttendanceItemSchema = z.object({
  matchedSubjectId: z.string().nullable().optional(),
  createNew: z.boolean().default(false),
  newSubjectCode: z.string().trim().max(50).nullable().optional(),
  newSubjectName: z.string().trim().max(150).nullable().optional(),
  newSubjectCredits: z.number().min(0).max(30).default(3.0),
  attended: z.number().int().min(0),
  conducted: z.number().int().min(0),
  action: z.enum(["REPLACE", "KEEP_EXISTING"]).default("REPLACE"),
});

export const ConfirmedGradeItemSchema = z.object({
  matchedSubjectId: z.string().nullable().optional(),
  createNew: z.boolean().default(false),
  newSubjectCode: z.string().trim().max(50).nullable().optional(),
  newSubjectName: z.string().trim().max(150).nullable().optional(),
  newSubjectCredits: z.number().min(0).max(30).default(3.0),
  gradeLetter: z.string().trim().nullable().optional(),
  gradePoint: z.number().min(0).max(10).nullable().optional(),
  marksObtained: z.number().min(0).nullable().optional(),
  maxMarks: z.number().min(1).default(100.0),
  action: z.enum(["REPLACE", "KEEP_EXISTING"]).default("REPLACE"),
});

export const ConfirmedSmartImportSchema = z.object({
  semesterId: z.string().min(1, "Target semester ID is required."),
  attendanceItems: z.array(ConfirmedAttendanceItemSchema).default([]),
  gradeItems: z.array(ConfirmedGradeItemSchema).default([]),
});
export type ConfirmedSmartImportInput = z.infer<typeof ConfirmedSmartImportSchema>;
