import { attendanceCsvRowSchema } from "../validations/attendance";
import {
  calculateAttendancePercentage,
  calculateBunkBuffer,
  calculateRecoveryClasses,
  calculateAttendanceStatus,
} from "../calculations/attendance";

// ─── Parse result types ───────────────────────────────────────────────────────

export interface AttendanceCsvRowError {
  field: string;
  problem: string;
  correctionNeeded: string;
}

export interface ParsedAttendanceRow {
  rowNumber: number;
  rawText: string;
  subjectCode: string;
  subjectName: string;
  classesAttended: number;
  classesConducted: number;
  isValid: boolean;
  errors: AttendanceCsvRowError[];
}

export interface AttendanceCsvParseResult {
  totalRows: number;
  validRows: ParsedAttendanceRow[];
  invalidRows: ParsedAttendanceRow[];
  allRows: ParsedAttendanceRow[];
  delimiterUsed: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectDelimiter(text: string): string {
  const firstLines = text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .slice(0, 5);
  let tabCount = 0;
  let commaCount = 0;
  let semicolonCount = 0;
  for (const line of firstLines) {
    tabCount += (line.match(/\t/g) || []).length;
    commaCount += (line.match(/,/g) || []).length;
    semicolonCount += (line.match(/;/g) || []).length;
  }
  if (tabCount > commaCount && tabCount > semicolonCount) return "\t";
  if (semicolonCount > commaCount) return ";";
  return ",";
}

function parseLineTokens(line: string, delimiter: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      tokens.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  tokens.push(current.trim());
  return tokens;
}

function normalizeAttendanceHeader(header: string): string {
  const clean = header.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["subjectcode", "code", "coursecode", "subcode"].includes(clean)) return "subjectCode";
  if (["subjectname", "name", "coursename", "subject", "course"].includes(clean)) return "subjectName";
  if (["attended", "classesattended", "present", "classattended"].includes(clean)) return "classesAttended";
  if (["conducted", "classesconducted", "total", "totalclasses", "classconducted"].includes(clean))
    return "classesConducted";
  return clean;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parses an attendance CSV / TSV (Excel or Google Sheets paste) into row data.
 *
 * Supported format (header row optional):
 *   subjectCode, subjectName, attended, conducted
 *   CSE202, Data Structures, 35, 42
 *
 * Rules:
 * - Tab-separated format is auto-detected for Excel/Sheets paste.
 * - Invalid rows (attended > conducted, negative counts, missing name) are flagged separately.
 * - CANCELLED sessions are not tracked in the CSV format (aggregate only).
 */
export function parseAttendanceCsv(content: string): AttendanceCsvParseResult {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { totalRows: 0, validRows: [], invalidRows: [], allRows: [], delimiterUsed: "," };
  }

  const delimiter = detectDelimiter(content);
  const firstLineTokens = parseLineTokens(lines[0], delimiter);

  // Detect header row
  const hasHeader = firstLineTokens.some((t) => {
    const norm = normalizeAttendanceHeader(t);
    return ["subjectCode", "subjectName", "classesAttended", "classesConducted"].includes(norm);
  });

  const headerMap: Record<string, number> = {};
  let startIndex = 0;

  if (hasHeader) {
    startIndex = 1;
    firstLineTokens.forEach((t, idx) => {
      headerMap[normalizeAttendanceHeader(t)] = idx;
    });
  }

  const allRows: ParsedAttendanceRow[] = [];
  const validRows: ParsedAttendanceRow[] = [];
  const invalidRows: ParsedAttendanceRow[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const rawLine = lines[i];
    const tokens = parseLineTokens(rawLine, delimiter);
    const rowNumber = i + 1;

    let subjectCode = "";
    let subjectName = "";
    let attendedRaw = "";
    let conductedRaw = "";

    if (hasHeader) {
      if (headerMap["subjectCode"] !== undefined) subjectCode = tokens[headerMap["subjectCode"]] ?? "";
      if (headerMap["subjectName"] !== undefined) subjectName = tokens[headerMap["subjectName"]] ?? "";
      if (headerMap["classesAttended"] !== undefined) attendedRaw = tokens[headerMap["classesAttended"]] ?? "";
      if (headerMap["classesConducted"] !== undefined) conductedRaw = tokens[headerMap["classesConducted"]] ?? "";
    } else {
      // Positional heuristics:
      // 4 tokens: [code, name, attended, conducted]
      // 3 tokens: [name, attended, conducted] (no code)
      if (tokens.length >= 4) {
        subjectCode = tokens[0] ?? "";
        subjectName = tokens[1] ?? "";
        attendedRaw = tokens[2] ?? "";
        conductedRaw = tokens[3] ?? "";
      } else if (tokens.length === 3) {
        subjectName = tokens[0] ?? "";
        attendedRaw = tokens[1] ?? "";
        conductedRaw = tokens[2] ?? "";
      } else if (tokens.length === 2) {
        subjectName = tokens[0] ?? "";
        attendedRaw = tokens[1] ?? "";
      } else {
        subjectName = tokens[0] ?? "";
      }
    }

    const classesAttended = parseInt(attendedRaw, 10);
    const classesConducted = parseInt(conductedRaw, 10);

    const rowErrors: AttendanceCsvRowError[] = [];

    if (!subjectName || subjectName.trim().length === 0) {
      rowErrors.push({
        field: "subjectName",
        problem: "Subject name is missing.",
        correctionNeeded: "Provide a descriptive course name (e.g. Data Structures and Algorithms).",
      });
    }

    if (attendedRaw === "" || isNaN(classesAttended) || classesAttended < 0) {
      rowErrors.push({
        field: "classesAttended",
        problem: `Invalid attended count '${attendedRaw}'.`,
        correctionNeeded: "Classes attended must be a non-negative integer.",
      });
    }

    if (conductedRaw === "" || isNaN(classesConducted) || classesConducted < 0) {
      rowErrors.push({
        field: "classesConducted",
        problem: `Invalid conducted count '${conductedRaw}'.`,
        correctionNeeded: "Classes conducted must be a non-negative integer.",
      });
    }

    if (
      !isNaN(classesAttended) &&
      !isNaN(classesConducted) &&
      classesAttended > classesConducted
    ) {
      rowErrors.push({
        field: "classesAttended",
        problem: `Attended (${classesAttended}) exceeds conducted (${classesConducted}).`,
        correctionNeeded: "Classes attended cannot exceed classes conducted.",
      });
    }

    // Run through Zod schema for any remaining checks
    if (rowErrors.length === 0) {
      const zodCheck = attendanceCsvRowSchema.safeParse({
        subjectCode: subjectCode.trim() || null,
        subjectName: subjectName.trim(),
        classesAttended,
        classesConducted,
      });
      if (!zodCheck.success) {
        for (const issue of zodCheck.error.issues) {
          const field = issue.path[0]?.toString() || "row";
          if (!rowErrors.some((e) => e.field === field)) {
            rowErrors.push({
              field,
              problem: issue.message,
              correctionNeeded: "Review and correct the field value.",
            });
          }
        }
      }
    }

    const row: ParsedAttendanceRow = {
      rowNumber,
      rawText: rawLine,
      subjectCode: subjectCode.trim(),
      subjectName: subjectName.trim(),
      classesAttended: isNaN(classesAttended) ? 0 : classesAttended,
      classesConducted: isNaN(classesConducted) ? 0 : classesConducted,
      isValid: rowErrors.length === 0,
      errors: rowErrors,
    };

    allRows.push(row);
    if (row.isValid) {
      validRows.push(row);
    } else {
      invalidRows.push(row);
    }
  }

  return {
    totalRows: allRows.length,
    validRows,
    invalidRows,
    allRows,
    delimiterUsed: delimiter,
  };
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

/**
 * Generates an RFC 4180 compliant CSV for attendance export.
 *
 * Overall attendance is computed using the weighted aggregate formula:
 *   (sum of attended across non-audit subjects) / (sum of conducted across non-audit subjects) × 100
 *
 * Bunk buffer and recovery classes are included using the pure domain engine.
 */
export function generateAttendanceCsv(
  semesterName: string,
  semesterNumber: number,
  subjects: Array<{
    code?: string | null;
    name: string;
    isAudit: boolean;
    customAttendanceTarget?: number | null;
    attendance?: { classesAttended: number; classesConducted: number } | null;
  }>,
  defaultTarget: number = 75.0
): string {
  const headers = [
    "Semester",
    "Semester Number",
    "Subject Code",
    "Subject Name",
    "Attended",
    "Conducted",
    "Attendance %",
    "Target %",
    "Bunk Buffer",
    "Recovery Classes",
    "Status",
    "Is Audit",
  ];

  const escape = (val: string | number | boolean | null | undefined): string => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = subjects.map((sub) => {
    const att = sub.attendance ?? { classesAttended: 0, classesConducted: 0 };
    const target = sub.customAttendanceTarget ?? defaultTarget;
    const pct =
      att.classesConducted === 0
        ? "Not started"
        : calculateAttendancePercentage(att.classesAttended, att.classesConducted).toFixed(2) + "%";
    const bunk =
      att.classesConducted === 0
        ? ""
        : String(calculateBunkBuffer(att.classesAttended, att.classesConducted, target));
    const recovery =
      att.classesConducted === 0
        ? ""
        : String(
            calculateRecoveryClasses(att.classesAttended, att.classesConducted, target).classesRequired
          );
    const status =
      att.classesConducted === 0
        ? "NOT_STARTED"
        : calculateAttendanceStatus(
            calculateAttendancePercentage(att.classesAttended, att.classesConducted),
            target,
            att.classesConducted
          );

    return [
      escape(semesterName),
      escape(semesterNumber),
      escape(sub.code || ""),
      escape(sub.name),
      escape(att.classesAttended),
      escape(att.classesConducted),
      escape(pct),
      escape(target + "%"),
      escape(bunk),
      escape(recovery),
      escape(status),
      escape(sub.isAudit ? "Yes" : "No"),
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\r\n");
}
