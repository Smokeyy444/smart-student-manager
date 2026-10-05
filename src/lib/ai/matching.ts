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
