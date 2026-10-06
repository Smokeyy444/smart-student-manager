import type {
  MatchedSubjectInfo,
  SubjectMatchStatus,
} from "./extraction-schemas";

// ─────────────────────────────────────────────────────────────────────────────
// RATE LIMITING / ABUSE PROTECTION (In-memory per user session)
// ─────────────────────────────────────────────────────────────────────────────

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitBucket>();
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_REQUESTS_PER_WINDOW = 10; // 10 extraction requests per 5 minutes

export function checkRateLimit(userId: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const bucket = rateLimitMap.get(userId);

  if (!bucket || now > bucket.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    return { allowed: false, retryAfterSeconds: retryAfter };
  }

  bucket.count++;
  return { allowed: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE MIME & FORMAT UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

export const ALLOWED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
export const ALLOWED_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

export function resolveImageMimeType(file: { name: string; type?: string }): string | null {
  const mime = file.type?.toLowerCase();
  if (mime && ALLOWED_IMAGE_MIME_TYPES.includes(mime)) {
    return mime === "image/jpg" ? "image/jpeg" : mime;
  }
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    return "image/jpeg";
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBJECT MATCHING ALGORITHM
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeCode(code: string | null | undefined): string {
  if (!code) return "";
  return code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Matches an extracted subject to known existing subjects in the target semester.
 * Priority:
 * 1. Exact subject code match (case-insensitive)
 * 2. Normalized subject code match (alphanumerics only)
 * 3. Strong normalized subject-name match (exact clean text equality)
 * Returns null if uncertain ("Needs review"). Never guesses with weak fuzzy matching.
 */
export function matchSubject(
  extractedCode: string | null | undefined,
  extractedName: string | null | undefined,
  existingSubjects: MatchedSubjectInfo[]
): { matchedSubject: MatchedSubjectInfo | null; status: SubjectMatchStatus } {
  const cleanExtCode = extractedCode?.trim().toUpperCase();
  const normExtCode = normalizeCode(extractedCode);
  const normExtName = normalizeName(extractedName);

  // 1. Exact subject code
  if (cleanExtCode) {
    const exact = existingSubjects.find((s) => s.code?.trim().toUpperCase() === cleanExtCode);
    if (exact) {
      return { matchedSubject: exact, status: "EXACT_CODE" };
    }
  }

  // 2. Normalized subject code
  if (normExtCode.length >= 3) {
    const norm = existingSubjects.find((s) => normalizeCode(s.code) === normExtCode);
    if (norm) {
      return { matchedSubject: norm, status: "NORMALIZED_CODE" };
    }
  }

  // 3. Strong normalized name match
  if (normExtName.length >= 4) {
    const strongName = existingSubjects.find((s) => normalizeName(s.name) === normExtName);
    if (strongName) {
      return { matchedSubject: strongName, status: "NAME_MATCH" };
    }
  }

  // No confident match: student must manually review
  return { matchedSubject: null, status: "NEEDS_REVIEW" };
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-IMAGE / MULTI-PAGE DEDUPLICATION
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ExtractedAttendanceRow,
  ExtractedGradeRow,
  ExtractedDetailedMarksSubject,
} from "./extraction-schemas";

function getAttendanceRowScore(row: ExtractedAttendanceRow): number {
  let score = 0;
  if (row.confidence === "HIGH") score += 30;
  else if (row.confidence === "MEDIUM") score += 20;
  else score += 10;

  if (typeof row.attended === "number" && typeof row.conducted === "number") {
    score += 40;
    if (row.conducted >= 0 && row.attended >= 0 && row.attended <= row.conducted) {
      score += 20;
    }
  } else if (typeof row.attended === "number" || typeof row.conducted === "number") {
    score += 10;
  }

  if (row.subjectCode && row.subjectCode.trim().length > 0) score += 15;
  if (row.subjectName && row.subjectName.trim().length > 0) score += 10;
  if (typeof row.attendancePercentage === "number") score += 5;
  if (row.lastAttendedDate) score += 5;
  if (typeof row.dutyLeave === "number") score += 5;

  return score;
}

/**
 * Deduplicates attendance rows extracted across multiple images or extraction passes.
 * When the same subject appears multiple times, preserves the best/highest-confidence row
 * and merges non-null fields.
 */
export function deduplicateAttendanceRows(
  rows: ExtractedAttendanceRow[]
): ExtractedAttendanceRow[] {
  const merged: ExtractedAttendanceRow[] = [];

  for (const candidate of rows) {
    const candNormCode = normalizeCode(candidate.subjectCode);
    const candNormName = normalizeName(candidate.subjectName);

    const existingIdx = merged.findIndex((existing) => {
      const existNormCode = normalizeCode(existing.subjectCode);
      const existNormName = normalizeName(existing.subjectName);

      // Match by subject code if both have valid codes
      if (candNormCode.length >= 2 && existNormCode.length >= 2) {
        return candNormCode === existNormCode;
      }

      // Fallback: match by strong normalized name
      if (candNormName.length >= 4 && existNormName.length >= 4) {
        return candNormName === existNormName;
      }

      return false;
    });

    if (existingIdx === -1) {
      merged.push({ ...candidate });
    } else {
      const existing = merged[existingIdx];
      const existingScore = getAttendanceRowScore(existing);
      const candidateScore = getAttendanceRowScore(candidate);

      if (candidateScore > existingScore) {
        // Candidate is higher quality; backfill missing fields from existing
        merged[existingIdx] = {
          ...candidate,
          subjectCode: candidate.subjectCode || existing.subjectCode,
          subjectName: candidate.subjectName || existing.subjectName,
          lastAttendedDate: candidate.lastAttendedDate || existing.lastAttendedDate,
          dutyLeave: candidate.dutyLeave ?? existing.dutyLeave,
          notes: candidate.notes || existing.notes,
          sourceImageIndex: candidate.sourceImageIndex ?? existing.sourceImageIndex,
        };
      } else {
        // Existing is higher/equal quality; backfill missing fields from candidate
        merged[existingIdx] = {
          ...existing,
          subjectCode: existing.subjectCode || candidate.subjectCode,
          subjectName: existing.subjectName || candidate.subjectName,
          lastAttendedDate: existing.lastAttendedDate || candidate.lastAttendedDate,
          dutyLeave: existing.dutyLeave ?? candidate.dutyLeave,
          notes: existing.notes || candidate.notes,
        };
      }
    }
  }

  return merged;
}

function getGradeRowScore(row: ExtractedGradeRow): number {
  let score = 0;
  if (row.confidence === "HIGH") score += 30;
  else if (row.confidence === "MEDIUM") score += 20;
  else score += 10;

  if (row.grade && row.grade.trim().length > 0) score += 30;
  if (typeof row.marksObtained === "number") score += 30;
  if (typeof row.credits === "number") score += 10;
  if (row.subjectCode && row.subjectCode.trim().length > 0) score += 15;
  if (row.subjectName && row.subjectName.trim().length > 0) score += 10;

  return score;
}

/**
 * Deduplicates grade rows extracted across multiple images.
 */
export function deduplicateGradeRows(rows: ExtractedGradeRow[]): ExtractedGradeRow[] {
  const merged: ExtractedGradeRow[] = [];

  for (const candidate of rows) {
    const candNormCode = normalizeCode(candidate.subjectCode);
    const candNormName = normalizeName(candidate.subjectName);

    const existingIdx = merged.findIndex((existing) => {
      const existNormCode = normalizeCode(existing.subjectCode);
      const existNormName = normalizeName(existing.subjectName);

      if (candNormCode.length >= 2 && existNormCode.length >= 2) {
        return candNormCode === existNormCode;
      }
      if (candNormName.length >= 4 && existNormName.length >= 4) {
        return candNormName === existNormName;
      }
      return false;
    });

    if (existingIdx === -1) {
      merged.push({ ...candidate });
    } else {
      const existing = merged[existingIdx];
      const existingScore = getGradeRowScore(existing);
      const candidateScore = getGradeRowScore(candidate);

      if (candidateScore > existingScore) {
        merged[existingIdx] = {
          ...candidate,
          subjectCode: candidate.subjectCode || existing.subjectCode,
          subjectName: candidate.subjectName || existing.subjectName,
          credits: candidate.credits ?? existing.credits,
          sourceImageIndex: candidate.sourceImageIndex ?? existing.sourceImageIndex,
        };
      } else {
        merged[existingIdx] = {
          ...existing,
          subjectCode: existing.subjectCode || candidate.subjectCode,
          subjectName: existing.subjectName || candidate.subjectName,
          credits: existing.credits ?? candidate.credits,
        };
      }
    }
  }

  return merged;
}

/**
 * Deduplicates detailed marks rows extracted across multiple images.
 */
export function deduplicateDetailedMarksRows(
  rows: ExtractedDetailedMarksSubject[]
): ExtractedDetailedMarksSubject[] {
  const merged: ExtractedDetailedMarksSubject[] = [];

  for (const candidate of rows) {
    const candNormCode = normalizeCode(candidate.subjectCode);
    const candNormName = normalizeName(candidate.subjectName);

    const existingIdx = merged.findIndex((existing) => {
      const existNormCode = normalizeCode(existing.subjectCode);
      const existNormName = normalizeName(existing.subjectName);

      if (candNormCode.length >= 2 && existNormCode.length >= 2) {
        return candNormCode === existNormCode;
      }
      if (candNormName.length >= 4 && existNormName.length >= 4) {
        return candNormName === existNormName;
      }
      return false;
    });

    if (existingIdx === -1) {
      merged.push({ ...candidate });
    } else {
      const existing = merged[existingIdx];
      const existingScore = (existing.components?.length || 0) * 10 + (existing.confidence === "HIGH" ? 20 : 10);
      const candidateScore = (candidate.components?.length || 0) * 10 + (candidate.confidence === "HIGH" ? 20 : 10);

      if (candidateScore > existingScore) {
        merged[existingIdx] = {
          ...candidate,
          sourceImageIndex: candidate.sourceImageIndex ?? existing.sourceImageIndex,
        };
      }
    }
  }

  return merged;
}

