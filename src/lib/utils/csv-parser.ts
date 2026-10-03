import { bulkSubjectRowSchema, type BulkSubjectRowInput } from "../validations/academic";

export interface ParsedCsvRowError {
  field: string;
  problem: string;
  correctionNeeded: string;
}

export interface ParsedSubjectRow {
  rowNumber: number;
  rawText: string;
  data: BulkSubjectRowInput;
  isValid: boolean;
  errors: ParsedCsvRowError[];
}

export interface CsvParseResult {
  totalRows: number;
  validRows: ParsedSubjectRow[];
  invalidRows: ParsedSubjectRow[];
  allRows: ParsedSubjectRow[];
  delimiterUsed: string;
}

/**
 * Normalizes header keys to standard names.
 */
function normalizeHeader(header: string): string {
  const clean = header.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (clean === "subjectcode" || clean === "code" || clean === "coursecode") return "code";
  if (clean === "subjectname" || clean === "name" || clean === "coursename" || clean === "title" || clean === "subject") return "name";
  if (clean === "credits" || clean === "credithours" || clean === "credit" || clean === "cr") return "creditHours";
  if (clean === "category" || clean === "type") return "category";
  if (clean === "audit" || clean === "isaudit" || clean === "noncredit") return "isAudit";
  return clean;
}

/**
 * Parses a single line considering comma or tab delimiters and quoted values.
 */
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

/**
 * Detects whether content is primarily Tab-separated (Excel / Google Sheets paste) or Comma / Semicolon separated.
 */
export function detectDelimiter(text: string): string {
  const firstLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 5);
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

/**
 * Parses CSV or pasted spreadsheet content into structured subjects with validation.
 */
export function parseAcademicCsv(content: string): CsvParseResult {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { totalRows: 0, validRows: [], invalidRows: [], allRows: [], delimiterUsed: "," };
  }

  const delimiter = detectDelimiter(content);
  const firstLineTokens = parseLineTokens(lines[0], delimiter);

  // Check if first line is a header row
  const hasHeader = firstLineTokens.some((t) => {
    const norm = normalizeHeader(t);
    return norm === "code" || norm === "name" || norm === "creditHours" || norm === "category";
  });

  const headerMap: Record<string, number> = {};
  let startIndex = 0;

  if (hasHeader) {
    startIndex = 1;
    firstLineTokens.forEach((t, idx) => {
      headerMap[normalizeHeader(t)] = idx;
    });
  }

  const allRows: ParsedSubjectRow[] = [];
  const validRows: ParsedSubjectRow[] = [];
  const invalidRows: ParsedSubjectRow[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const rawLine = lines[i];
    const tokens = parseLineTokens(rawLine, delimiter);
    const rowNumber = i + 1;

    let code = "";
    let name = "";
    let creditHoursRaw = "3";
    let categoryRaw = "CORE";
    let isAudit = false;

    if (hasHeader) {
      if (headerMap["code"] !== undefined && tokens[headerMap["code"]]) {
        code = tokens[headerMap["code"]];
      }
      if (headerMap["name"] !== undefined && tokens[headerMap["name"]]) {
        name = tokens[headerMap["name"]];
      }
      if (headerMap["creditHours"] !== undefined && tokens[headerMap["creditHours"]]) {
        creditHoursRaw = tokens[headerMap["creditHours"]];
      }
      if (headerMap["category"] !== undefined && tokens[headerMap["category"]]) {
        categoryRaw = tokens[headerMap["category"]];
      }
      if (headerMap["isAudit"] !== undefined && tokens[headerMap["isAudit"]]) {
        const auditVal = tokens[headerMap["isAudit"]].toLowerCase();
        isAudit = auditVal === "true" || auditVal === "yes" || auditVal === "1" || auditVal === "audit";
      }
    } else {
      // Heuristic position mapping
      // 4 tokens: [code, name, credits, category]
      // 3 tokens: [code, name, credits] or [name, credits, category]
      // 5 tokens: [code, name, credits, category, audit]
      if (tokens.length >= 4) {
        code = tokens[0] || "";
        name = tokens[1] || "";
        creditHoursRaw = tokens[2] || "3";
        categoryRaw = tokens[3] || "CORE";
        if (tokens.length >= 5) {
          const auditVal = tokens[4].toLowerCase();
          isAudit = auditVal === "true" || auditVal === "yes" || auditVal === "1" || auditVal === "audit";
        }
      } else if (tokens.length === 3) {
        // Test if token[0] looks like a course code (no spaces, <= 10 chars)
        if (!tokens[0].includes(" ") && tokens[0].length <= 10) {
          code = tokens[0];
          name = tokens[1] || "";
          creditHoursRaw = tokens[2] || "3";
        } else {
          name = tokens[0] || "";
          creditHoursRaw = tokens[1] || "3";
          categoryRaw = tokens[2] || "CORE";
        }
      } else if (tokens.length === 2) {
        name = tokens[0] || "";
        creditHoursRaw = tokens[1] || "3";
      } else {
        name = tokens[0] || "";
      }
    }

    // Normalize category
    let category: "CORE" | "ELECTIVE" | "LAB" | "AUDIT" = "CORE";
    const catUpper = categoryRaw.trim().toUpperCase();
    if (catUpper.includes("ELECT")) category = "ELECTIVE";
    else if (catUpper.includes("LAB") || catUpper.includes("PRAC")) category = "LAB";
    else if (catUpper.includes("AUDIT") || catUpper.includes("NON-CREDIT")) {
      category = "AUDIT";
      isAudit = true;
    } else {
      category = "CORE";
    }

    if (isAudit) {
      category = "AUDIT";
    }

    const parsedCredits = parseFloat(creditHoursRaw);
    const candidateData: BulkSubjectRowInput = {
      code: code ? code.trim() : "",
      name: name ? name.trim() : "",
      creditHours: isNaN(parsedCredits) ? 3.0 : parsedCredits,
      category,
      isAudit,
    };

    const rowErrors: ParsedCsvRowError[] = [];

    // Detailed field-level checks
    if (!candidateData.name || candidateData.name.length === 0) {
      rowErrors.push({
        field: "name",
        problem: "Subject name is missing.",
        correctionNeeded: "Provide a descriptive course title (e.g. Data Structures).",
      });
    } else if (candidateData.name.length > 150) {
      rowErrors.push({
        field: "name",
        problem: "Subject name exceeds 150 characters.",
        correctionNeeded: "Shorten course name to under 150 characters.",
      });
    }

    if (isNaN(parsedCredits) || parsedCredits < 0) {
      rowErrors.push({
        field: "creditHours",
        problem: `Invalid credit value '${creditHoursRaw}'.`,
        correctionNeeded: "Credits must be a positive number or 0 for audit courses.",
      });
    } else if (parsedCredits > 30) {
      rowErrors.push({
        field: "creditHours",
        problem: `Credits (${parsedCredits}) exceeds maximum 30.`,
        correctionNeeded: "Enter standard semester credit hours (e.g. 1 to 5).",
      });
    }

    // Validate using Zod schema for full compliance
    const zodCheck = bulkSubjectRowSchema.safeParse(candidateData);
    if (!zodCheck.success) {
      for (const issue of zodCheck.error.issues) {
        const field = issue.path[0]?.toString() || "row";
        if (!rowErrors.some((e) => e.field === field)) {
          rowErrors.push({
            field,
            problem: issue.message,
            correctionNeeded: "Review and enter valid field data.",
          });
        }
      }
    }

    const rowItem: ParsedSubjectRow = {
      rowNumber,
      rawText: rawLine,
      data: candidateData,
      isValid: rowErrors.length === 0,
      errors: rowErrors,
    };

    allRows.push(rowItem);
    if (rowItem.isValid) {
      validRows.push(rowItem);
    } else {
      invalidRows.push(rowItem);
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

/**
 * Generates an RFC 4180 compliant CSV export for semester academic results.
 */
export function generateSemesterCsv(
  semesterName: string,
  semesterNumber: number,
  subjects: Array<{
    code?: string | null;
    name: string;
    creditHours: number;
    category: string;
    isAudit: boolean;
    grade?: {
      gradeLetter?: string | null;
      gradePoint?: number | null;
      marksObtained?: number | null;
      maxMarks?: number | null;
    } | null;
  }>
): string {
  const headers = [
    "Semester",
    "Semester Number",
    "Subject Code",
    "Subject Name",
    "Credit Hours",
    "Category",
    "Is Audit",
    "Marks Obtained",
    "Max Marks",
    "Grade Letter",
    "Grade Point",
    "Quality Points",
  ];

  const escapeCsv = (val: string | number | boolean | null | undefined): string => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = subjects.map((sub) => {
    const gradeLetter = sub.grade?.gradeLetter || "";
    const gradePoint = sub.grade?.gradePoint !== null && sub.grade?.gradePoint !== undefined ? sub.grade.gradePoint : "";
    const marks = sub.grade?.marksObtained !== null && sub.grade?.marksObtained !== undefined ? sub.grade.marksObtained : "";
    const maxMarks = sub.grade?.maxMarks || 100;
    const qp =
      !sub.isAudit && typeof sub.grade?.gradePoint === "number"
        ? (sub.creditHours * sub.grade.gradePoint).toFixed(2)
        : "";

    return [
      escapeCsv(semesterName),
      escapeCsv(semesterNumber),
      escapeCsv(sub.code || ""),
      escapeCsv(sub.name),
      escapeCsv(sub.creditHours),
      escapeCsv(sub.category),
      escapeCsv(sub.isAudit ? "Yes" : "No"),
      escapeCsv(marks),
      escapeCsv(maxMarks),
      escapeCsv(gradeLetter),
      escapeCsv(gradePoint),
      escapeCsv(qp),
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\r\n");
}
