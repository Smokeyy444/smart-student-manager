import { GoogleGenAI, Type, type Part } from "@google/genai";
import {
  SmartExtractionResultSchema,
  type SmartExtractionResult,
  type ImportDocumentType,
} from "./extraction-schemas";
import {
  deduplicateAttendanceRows,
  deduplicateGradeRows,
  deduplicateDetailedMarksRows,
} from "./matching";

/**
 * Returns the Gemini model hierarchy: primary configured model followed by fallbacks.
 * Default fallback sequence per requirements:
 * 1. GEMINI_MODEL (e.g. gemini-3.8-flash)
 * 2. gemini-3.7-flash
 * 3. gemini-3.6-flash
 * 4. gemini-3.5-flash-lite
 */
export function getGeminiModelHierarchy(): string[] {
  const primaryModel = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const configuredFallbacks = process.env.GEMINI_FALLBACK_MODELS
    ? process.env.GEMINI_FALLBACK_MODELS.split(",")
        .map((m) => m.trim())
        .filter(Boolean)
    : ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"];

  const models = [primaryModel];
  for (const fallback of configuredFallbacks) {
    if (!models.includes(fallback)) {
      models.push(fallback);
    }
  }
  return models;
}

/**
 * Returns the configured primary Gemini multimodal model.
 */
export function getGeminiModelName(): string {
  return getGeminiModelHierarchy()[0];
}

/**
 * Detects whether a Gemini API error is a transient server failure (503, 500, 502, 504, UNAVAILABLE, etc.)
 * rather than a permanent client or validation error (400, 401, 403, 404, schema invalid).
 */
export function isTransientGeminiError(error: unknown): boolean {
  if (!error) return false;

  const errObj = error as {
    status?: number;
    code?: number;
    message?: string;
    error?: { code?: number; status?: string; message?: string };
  };

  const status = errObj.status ?? errObj.code ?? errObj.error?.code;

  if (typeof status === "number") {
    // 4xx client errors (400, 401, 403, 404, etc.) are permanent, do NOT retry
    if (status >= 400 && status < 500 && status !== 408) {
      return false;
    }
    if ([500, 502, 503, 504, 408].includes(status)) {
      return true;
    }
    if (status >= 500 && status < 600) {
      return true;
    }
  }

  const rawMessage = (errObj.message || "").trim();

  // If rawMessage is a JSON blob from @google/genai
  if (rawMessage.startsWith("{") && rawMessage.includes('"error"')) {
    try {
      const parsed = JSON.parse(rawMessage);
      const innerCode = parsed?.error?.code;
      const innerStatus = String(parsed?.error?.status || "");
      if (typeof innerCode === "number" && innerCode >= 400 && innerCode < 500 && innerCode !== 408) {
        return false;
      }
      if (
        innerCode === 503 ||
        innerStatus === "UNAVAILABLE" ||
        [500, 502, 504, 408].includes(innerCode)
      ) {
        return true;
      }
    } catch {
      // Fall through to string search
    }
  }

  const message = rawMessage.toLowerCase();

  // Permanent errors - do NOT retry
  if (
    message.includes("api key") ||
    message.includes("api_key_invalid") ||
    message.includes("unauthenticated") ||
    message.includes("permission_denied") ||
    message.includes("invalid_argument") ||
    message.includes("bad request") ||
    message.includes("validation") ||
    message.includes("schema") ||
    message.includes("could not parse ai response as valid json") ||
    message.includes("did not conform")
  ) {
    return false;
  }

  // Transient server errors - retry
  if (
    message.includes("503") ||
    message.includes("unavailable") ||
    message.includes("high demand") ||
    message.includes("overloaded") ||
    message.includes("500") ||
    message.includes("502") ||
    message.includes("504") ||
    message.includes("service unavailable") ||
    message.includes("bad gateway") ||
    message.includes("gateway timeout") ||
    message.includes("internal server error") ||
    message.includes("spikes in demand") ||
    message.includes("temporary") ||
    message.includes("deadline exceeded")
  ) {
    return true;
  }

  return false;
}

export interface GeminiExecutionOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  models?: string[];
}

/**
 * Checks if the Gemini API key is configured on the server.
 */
export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return typeof key === "string" && key.trim().length > 0;
}

/**
 * JSON Schema specification for Gemini structured output.
 */
const EXTRACTION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    documentType: {
      type: Type.STRING,
      enum: ["ATTENDANCE", "GRADES", "DETAILED_MARKS", "UNKNOWN"],
    },
    detectedSemester: {
      type: Type.STRING,
      nullable: true,
    },
    totalSubjectsDetected: {
      type: Type.INTEGER,
      nullable: true,
    },
    confidence: {
      type: Type.STRING,
      enum: ["HIGH", "MEDIUM", "LOW"],
    },
    summary: {
      type: Type.STRING,
      nullable: true,
    },
    attendanceRows: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sourceImageIndex: { type: Type.INTEGER, nullable: true },
          subjectCode: { type: Type.STRING, nullable: true },
          subjectName: { type: Type.STRING, nullable: true },
          attended: { type: Type.INTEGER, nullable: true },
          conducted: { type: Type.INTEGER, nullable: true },
          attendancePercentage: { type: Type.NUMBER, nullable: true },
          lastAttendedDate: { type: Type.STRING, nullable: true },
          dutyLeave: { type: Type.INTEGER, nullable: true },
          notes: { type: Type.STRING, nullable: true },
          confidence: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] },
        },
      },
    },
    gradeRows: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sourceImageIndex: { type: Type.INTEGER, nullable: true },
          semester: { type: Type.STRING, nullable: true },
          subjectCode: { type: Type.STRING, nullable: true },
          subjectName: { type: Type.STRING, nullable: true },
          credits: { type: Type.NUMBER, nullable: true },
          grade: { type: Type.STRING, nullable: true },
          gradePoint: { type: Type.NUMBER, nullable: true },
          marksObtained: { type: Type.NUMBER, nullable: true },
          maxMarks: { type: Type.NUMBER, nullable: true },
          confidence: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] },
        },
      },
    },
    detailedMarksRows: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sourceImageIndex: { type: Type.INTEGER, nullable: true },
          semester: { type: Type.STRING, nullable: true },
          subjectCode: { type: Type.STRING, nullable: true },
          subjectName: { type: Type.STRING, nullable: true },
          components: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                componentName: { type: Type.STRING },
                marksObtained: { type: Type.NUMBER, nullable: true },
                maxMarks: { type: Type.NUMBER, nullable: true },
                weightageEarned: { type: Type.NUMBER, nullable: true },
                weightageMax: { type: Type.NUMBER, nullable: true },
                confidence: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] },
              },
              required: ["componentName"],
            },
          },
          finalMarksObtained: { type: Type.NUMBER, nullable: true },
          finalMaxMarks: { type: Type.NUMBER, nullable: true },
          finalGrade: { type: Type.STRING, nullable: true },
          confidence: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] },
        },
      },
    },
    unreadableNotes: {
      type: Type.STRING,
      nullable: true,
    },
  },
  required: ["documentType", "confidence"],
};

export interface ImagePart {
  data: string; // Base64 string
  mimeType: string;
}

/**
 * Builds the comprehensive table extraction prompt instructions.
 */
/**
 * Builds the dedicated Grade/Result examination table extraction prompt.
 * Focuses strictly on extracting every course row with course code, course title, and final grade.
 */
export function buildGradeExtractionPrompt(
  imageIndex: number = 1,
  totalImages: number = 1
): string {
  const multiImageContext =
    totalImages > 1
      ? `Image context: You are analyzing Image ${imageIndex} of ${totalImages} from an uploaded academic document set.`
      : `Image context: You are analyzing a single academic document / screenshot.`;

  return `You are a high-precision academic examination result and grade table extraction system.
${multiImageContext}

TARGET EXTRACTION MODE: GRADES / RESULT PAGE

You are extracting a university examination/result table.

Scan the ENTIRE image from top to bottom.

Identify the result table boundaries.

Extract EVERY COURSE ROW visible in the table.

DO NOT stop after the first course.

DO NOT return a summary.

DO NOT return only representative examples.

Return exactly one grade row for each visible course row in the "gradeRows" array.
Set documentType to "GRADES". Set attendanceRows: [] and detailedMarksRows: [].

The table may contain:
- serial number (S.No)
- course code (e.g. CHE110, CSE111, CSE326, ECE249, ECE279, INT108, MTH165)
- course name / title (e.g. "ENVIRONMENTAL STUDIES", "PYTHON PROGRAMMING")
- grade (e.g. O, A+, A, B+, B, C, D, E, F, etc.)

Course code is usually the strongest identifier.

Preserve the course name as displayed.

If marks are not present, leave marksObtained and maxMarks as null.

If credits are not present, leave credits as null.

If gradePoint is not present, leave gradePoint as null.

If a course code is readable but the grade is unclear, keep the course row and set the grade to null rather than deleting the row.

Never fabricate missing values.

Before finalizing, count the visible course rows and compare that count against gradeRows.length.
Set totalSubjectsDetected to the total count of visible course rows detected.

Return ONLY clean JSON adhering to the structured response schema.`;
}

/**
 * Builds the dedicated Attendance table extraction prompt.
 */
export function buildAttendanceExtractionPrompt(
  imageIndex: number = 1,
  totalImages: number = 1
): string {
  const multiImageContext =
    totalImages > 1
      ? `Image context: You are analyzing Image ${imageIndex} of ${totalImages} from an uploaded academic document set.`
      : `Image context: You are analyzing a single academic document / screenshot.`;

  return `You are a high-precision academic-table OCR and attendance data extraction system for university student portals.
${multiImageContext}

TARGET EXTRACTION MODE: ATTENDANCE

CRITICAL TABLE-LEVEL EXTRACTION DIRECTIVES:
1. FULL TABLE INSPECTION:
   - Inspect the ENTIRE image from top to bottom before extracting anything.
   - Identify the complete table boundaries, header row, and every data row from the first row to the bottom row.
   - Extract EVERY subject/course row that is visible and readable into "attendanceRows".
   - Do NOT stop after finding the first valid subject.
   - Do NOT return only the most obvious or first row.
   - Do NOT summarize or group the table into a sample.
   - Set documentType to "ATTENDANCE". Set gradeRows: [] and detailedMarksRows: [].

2. TABLE STRUCTURE & LAYOUT RECOGNITION:
   - Identify header rows containing: "S.No", "Course Code", "Subject Code", "Course Name / Title", "Lectures Conducted / Delivered / Held", "Lectures Attended / Present", "Percentage / %", "Duty Leave", "Last Attended Date".
   - Handle combined columns like "38/40" or "Attended/Delivered: 38/40":
     * The first number is attended (38).
     * The second number is conducted (40).

3. ACCURACY & UNKNOWN DATA HANDLING:
   - Subject code + subject name + attended + conducted are the priority fields.
   - If one field is unreadable, blurry, or cut off, return null for that field rather than dropping the entire subject.
   - Never fabricate, guess, or extrapolate missing academic values.

4. ATTENDANCE VALUES:
   - conducted: MUST represent the total classes delivered/held (conducted >= 0).
   - attended: MUST represent the classes attended/present (attended >= 0).
   - attendancePercentage: extract the printed percentage if visible (number between 0 and 100), or null if not visible.

5. ROW COUNT VERIFICATION:
   - Before finalizing, count the number of subject rows detected in the image and set totalSubjectsDetected to that count.
   - Make sure attendanceRows.length contains every readable subject row visible in the table.

Return ONLY clean JSON adhering to the structured response schema.`;
}

/**
 * Builds the extraction prompt based on requested document type.
 */
export function buildExtractionPrompt(
  documentType: ImportDocumentType,
  imageIndex: number = 1,
  totalImages: number = 1
): string {
  if (documentType === "GRADES") {
    return buildGradeExtractionPrompt(imageIndex, totalImages);
  }
  if (documentType === "ATTENDANCE") {
    return buildAttendanceExtractionPrompt(imageIndex, totalImages);
  }

  // AUTO_DETECT or other modes
  const multiImageContext =
    totalImages > 1
      ? `Image context: You are analyzing Image ${imageIndex} of ${totalImages} from an uploaded academic document set.`
      : `Image context: You are analyzing a single academic document / screenshot.`;

  return `You are a high-precision academic OCR and data extraction system for university student portals.
${multiImageContext}

TARGET EXTRACTION MODE: AUTO_DETECT (Determine whether document is ATTENDANCE, GRADES, or DETAILED_MARKS).

INSTRUCTIONS BY DOCUMENT TYPE:
A. IF EXAMINATION RESULT / GRADE SHEET:
   - Set documentType to "GRADES".
   - Extract EVERY COURSE ROW visible in the table into "gradeRows".
   - Extract subjectCode (e.g. CHE110, CSE111, CSE326, ECE249, INT108, MTH165), subjectName, and grade letter (e.g. O, A+, A, B+, B, C, D).
   - Do NOT omit rows simply because marks or credits are not present. If not visible: credits=null, marksObtained=null, maxMarks=null, gradePoint=null.
   - Set attendanceRows: [] and detailedMarksRows: [].

B. IF ATTENDANCE TABLE:
   - Set documentType to "ATTENDANCE".
   - Extract EVERY COURSE ROW into "attendanceRows" with subjectCode, subjectName, attended, conducted.
   - Set gradeRows: [] and detailedMarksRows: [].

C. IF DETAILED ASSESSMENT MARKS BREAKDOWN:
   - Set documentType to "DETAILED_MARKS".
   - Extract component breakdowns into "detailedMarksRows".

GENERAL RULES:
- Inspect the ENTIRE image from top to bottom. Extract ALL course rows visible. Do NOT stop after 1 course.
- Count total visible course rows and set totalSubjectsDetected to that count.
- Never fabricate missing values.

Return ONLY clean JSON adhering to the structured response schema.`;
}

/**
 * Builds a second-pass recovery prompt for suspicious or incomplete extractions.
 */
export function buildRecoveryPrompt(
  documentType: ImportDocumentType,
  firstPassRowCount: number
): string {
  if (documentType === "GRADES") {
    return `SECOND-PASS UNIVERSITY RESULT TABLE RECOVERY EXTRACTION:
In the previous scan, only ${firstPassRowCount} course row(s) were captured, which appears incomplete for a university examination result page.
Please re-inspect the image thoroughly from top to bottom.
- Reinspect every horizontal course row in the result table independently.
- Identify all course codes (e.g. CHE110, CSE111, CSE326, ECE249, ECE279, INT108, MTH165), course titles, and final grades (O, A+, A, B+, B, C, D, etc.).
- Extract ALL course rows visible in the result table into gradeRows.
- Return every course row. Do not omit any course row simply because credits or marks are not printed.
- If credits or marks are not present, leave them as null.
- Before finalizing, count visible course rows and verify against gradeRows.length.
- Distinguish visible data vs null. Never fabricate values.`;
  }

  return `SECOND-PASS TABLE RECOVERY EXTRACTION:
In the previous scan, only ${firstPassRowCount} subject row(s) were captured, which appears incomplete for a university table.
Please re-examine the image thoroughly from top to bottom.
- Look for additional rows below, above, or between rows previously detected.
- Look for rows with smaller fonts, faint borders, or rows near the bottom edge.
- Extract ALL subject rows visible in the document table.
- Return every subject row. Do not omit any row.
- Distinguish visible data vs null. Never fabricate values.`;
}

/**
 * Checks if an extraction result looks suspiciously incomplete.
 */
export function isExtractionSuspicious(
  result: SmartExtractionResult,
  requestedType: ImportDocumentType
): boolean {
  const isAttendance =
    requestedType === "ATTENDANCE" ||
    (requestedType === "AUTO_DETECT" && result.documentType === "ATTENDANCE");
  const isGrades =
    requestedType === "GRADES" ||
    (requestedType === "AUTO_DETECT" && result.documentType === "GRADES");

  if (isAttendance) {
    const rowCount = result.attendanceRows.length;
    // Suspicious if only 1 row was returned from a table document
    if (rowCount > 0 && rowCount <= 1) {
      return true;
    }
    // Suspicious if reported total is significantly higher than returned rows
    if (
      typeof result.totalSubjectsDetected === "number" &&
      result.totalSubjectsDetected > rowCount + 1
    ) {
      return true;
    }
    // Suspicious if multiple rows have missing attended/conducted counts
    const missingCounts = result.attendanceRows.filter(
      (r) => r.attended === null || r.conducted === null
    ).length;
    if (rowCount >= 2 && missingCounts >= rowCount) {
      return true;
    }
  }

  if (isGrades) {
    const rowCount = result.gradeRows.length;
    // Suspicious if only 1 row was returned from a table document
    if (rowCount > 0 && rowCount <= 1) {
      return true;
    }
    // Suspicious if 0 rows returned but totalSubjectsDetected indicated rows
    if (rowCount === 0 && (result.totalSubjectsDetected || 0) > 0) {
      return true;
    }
    // Suspicious if reported total is significantly higher than returned rows
    if (
      typeof result.totalSubjectsDetected === "number" &&
      result.totalSubjectsDetected > rowCount + 1
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Extracts academic data from a single image using Gemini.
 * Supports bounded exponential backoff retries and model fallback on transient 5xx/503 errors.
 * Includes automatic second-pass recovery if initial extraction appears incomplete.
 */
async function extractSingleImage(
  ai: GoogleGenAI,
  img: ImagePart,
  imageIndex: number,
  totalImages: number,
  requestedType: ImportDocumentType,
  options?: GeminiExecutionOptions
): Promise<SmartExtractionResult> {
  const promptText = buildExtractionPrompt(requestedType, imageIndex, totalImages);

  const parts: Part[] = [
    {
      inlineData: {
        data: img.data,
        mimeType: img.mimeType,
      },
    },
    {
      text: promptText,
    },
  ];

  const models = options?.models ?? getGeminiModelHierarchy();
  const maxAttempts = options?.maxAttempts ?? (parseInt(process.env.GEMINI_MAX_ATTEMPTS || "3", 10) || 3);
  const initialDelayMs = options?.initialDelayMs ?? (process.env.NODE_ENV === "test" ? 0 : 1000);

  let responseText: string | null = null;
  let successfulModel: string = models[0];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const modelIndex = Math.min(attempt - 1, models.length - 1);
    const currentModel = models[modelIndex];
    const isFallback = modelIndex > 0;

    // Logging per Requirement 5: Non-sensitive development/server-side progress
    if (attempt === 1) {
      console.log(`[Smart Import] Smart Import Gemini attempt ${attempt}/${maxAttempts} (model: ${currentModel})`);
    } else {
      if (isFallback) {
        console.log(`[Smart Import] Primary model unavailable. Trying fallback model ${currentModel} (attempt ${attempt}/${maxAttempts})...`);
      } else {
        console.log(`[Smart Import] Smart Import Gemini attempt ${attempt}/${maxAttempts} (model: ${currentModel})...`);
      }
    }

    try {
      const response = await ai.models.generateContent({
        model: currentModel,
        contents: [{ role: "user", parts }],
        config: {
          responseMimeType: "application/json",
          responseSchema: EXTRACTION_RESPONSE_SCHEMA,
        },
      });

      const text = response.text;
      if (!text || text.trim().length === 0) {
        throw new Error("Gemini returned an empty response.");
      }

      responseText = text;
      successfulModel = currentModel;
      if (attempt > 1) {
        console.log(`[Smart Import] Extraction succeeded on attempt ${attempt}`);
      }
      break;
    } catch (err: unknown) {
      // Permanent error (e.g. 400 Bad Request, API key invalid, schema validation)
      if (!isTransientGeminiError(err)) {
        console.error(
          `[Smart Import] Non-retryable error on attempt ${attempt}:`,
          err instanceof Error ? err.message : err
        );
        throw err;
      }

      // If transient failure and out of attempts, stop
      if (attempt >= maxAttempts) {
        console.warn(`[Smart Import] All ${maxAttempts} Gemini attempts failed with transient errors.`);
        break;
      }

      // Exponential backoff
      const delay = initialDelayMs * Math.pow(2, attempt - 1);
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  if (!responseText) {
    throw new Error(
      "AI service is temporarily unavailable. Please try again later or use CSV / Manual Import."
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(responseText);
  } catch {
    throw new Error("Could not parse AI response as valid JSON.");
  }

  const validation = SmartExtractionResultSchema.safeParse(parsedJson);
  if (!validation.success) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[Smart Import Diagnostics] Zod schema validation failed:", validation.error.flatten());
    }
    throw new Error("Extracted data did not conform to the expected academic data format.");
  }

  if (process.env.NODE_ENV !== "production") {
    const rawParsed = parsedJson as Record<string, unknown> | null;
    console.log(`[Smart Import Diagnostics: Image ${imageIndex}/${totalImages}]`, {
      extractionType: requestedType,
      geminiModel: successfulModel,
      responseReceived: true,
      rawGradeRowsLength: Array.isArray(rawParsed?.gradeRows) ? rawParsed.gradeRows.length : 0,
      rawAttendanceRowsLength: Array.isArray(rawParsed?.attendanceRows) ? rawParsed.attendanceRows.length : 0,
      rawDetailedMarksRowsLength: Array.isArray(rawParsed?.detailedMarksRows) ? rawParsed.detailedMarksRows.length : 0,
      totalSubjectsDetected: rawParsed?.totalSubjectsDetected ?? null,
      zodValidationSuccess: true,
      zodGradeRowsLength: validation.data.gradeRows.length,
      zodAttendanceRowsLength: validation.data.attendanceRows.length,
    });
  }

  let result = validation.data;

  // Tag all rows with sourceImageIndex
  result.attendanceRows = result.attendanceRows.map((r) => ({
    ...r,
    sourceImageIndex: r.sourceImageIndex ?? imageIndex,
  }));
  result.gradeRows = result.gradeRows.map((r) => ({
    ...r,
    sourceImageIndex: r.sourceImageIndex ?? imageIndex,
  }));
  result.detailedMarksRows = result.detailedMarksRows.map((r) => ({
    ...r,
    sourceImageIndex: r.sourceImageIndex ?? imageIndex,
  }));

  // Second-pass recovery check for suspiciously incomplete extractions
  // Note: Only performed if initial extraction succeeded and appears suspiciously incomplete
  if (isExtractionSuspicious(result, requestedType)) {
    try {
      const isGradesDoc =
        requestedType === "GRADES" ||
        result.documentType === "GRADES" ||
        (result.gradeRows.length > 0 && result.attendanceRows.length === 0);

      const firstPassCount = isGradesDoc
        ? result.gradeRows.length
        : result.attendanceRows.length;

      const recoveryPrompt = buildRecoveryPrompt(
        isGradesDoc ? "GRADES" : "ATTENDANCE",
        firstPassCount
      );

      const recoveryParts: Part[] = [
        {
          inlineData: {
            data: img.data,
            mimeType: img.mimeType,
          },
        },
        {
          text: recoveryPrompt,
        },
      ];

      const recoveryResponse = await ai.models.generateContent({
        model: successfulModel,
        contents: [{ role: "user", parts: recoveryParts }],
        config: {
          responseMimeType: "application/json",
          responseSchema: EXTRACTION_RESPONSE_SCHEMA,
        },
      });

      const recoveryText = recoveryResponse.text;
      if (recoveryText && recoveryText.trim().length > 0) {
        const recoveryJson = JSON.parse(recoveryText);
        const recoveryValidation = SmartExtractionResultSchema.safeParse(recoveryJson);
        if (recoveryValidation.success) {
          const recoveryData = recoveryValidation.data;

          if (isGradesDoc) {
            const taggedRecoveryRows = recoveryData.gradeRows.map((r) => ({
              ...r,
              sourceImageIndex: imageIndex,
            }));
            const mergedGrades = deduplicateGradeRows([
              ...result.gradeRows,
              ...taggedRecoveryRows,
            ]);
            result = {
              ...result,
              documentType: "GRADES",
              gradeRows: mergedGrades,
              totalSubjectsDetected: Math.max(
                result.totalSubjectsDetected || 0,
                mergedGrades.length
              ),
            };
          } else {
            const taggedRecoveryRows = recoveryData.attendanceRows.map((r) => ({
              ...r,
              sourceImageIndex: imageIndex,
            }));
            const mergedAttendance = deduplicateAttendanceRows([
              ...result.attendanceRows,
              ...taggedRecoveryRows,
            ]);
            result = {
              ...result,
              documentType: "ATTENDANCE",
              attendanceRows: mergedAttendance,
              totalSubjectsDetected: Math.max(
                result.totalSubjectsDetected || 0,
                mergedAttendance.length
              ),
            };
          }
        }
      }
    } catch (recoveryErr) {
      // Graceful fallback to first-pass result if recovery call fails
      console.warn("Second-pass recovery extraction skipped:", recoveryErr);
    }
  }

  return result;
}

/**
 * Calls Gemini multimodal API to extract academic data from one or more images.
 * Processes each image with full table inspection, merges multi-image rows,
 * and deduplicates repeated subjects across images.
 */
export async function extractAcademicDataWithGemini(
  images: ImagePart[],
  requestedType: ImportDocumentType = "AUTO_DETECT",
  options?: GeminiExecutionOptions
): Promise<SmartExtractionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      "GEMINI_API_KEY is not configured on the server. Smart Import requires an API key in your server environment."
    );
  }

  if (images.length === 0) {
    throw new Error("No image data provided for extraction.");
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 30000,
    },
  });

  try {
    // Process each image individually to ensure 100% focused table OCR per image
    const results = await Promise.all(
      images.map((img, index) =>
        extractSingleImage(
          ai,
          img,
          index + 1,
          images.length,
          requestedType,
          options
        )
      )
    );

    // Merge results across all images
    const allAttendanceRows = results.flatMap((r) => r.attendanceRows);
    const allGradeRows = results.flatMap((r) => r.gradeRows);
    const allDetailedMarksRows = results.flatMap((r) => r.detailedMarksRows);

    // Deduplicate across images while preserving best confidence and completeness
    const deduplicatedAttendance = deduplicateAttendanceRows(allAttendanceRows);
    const deduplicatedGrades = deduplicateGradeRows(allGradeRows);
    const deduplicatedMarks = deduplicateDetailedMarksRows(allDetailedMarksRows);

    if (process.env.NODE_ENV !== "production") {
      console.log("[Smart Import Diagnostics: Deduplication]", {
        imagesCount: images.length,
        rawGradeRowsSum: allGradeRows.length,
        deduplicatedGradesCount: deduplicatedGrades.length,
        rawAttendanceRowsSum: allAttendanceRows.length,
        deduplicatedAttendanceCount: deduplicatedAttendance.length,
      });
    }

    // Determine primary document type
    let primaryDocType: "ATTENDANCE" | "GRADES" | "DETAILED_MARKS" | "UNKNOWN" = "UNKNOWN";
    if (requestedType !== "AUTO_DETECT") {
      primaryDocType = requestedType;
    } else if (deduplicatedAttendance.length > 0) {
      primaryDocType = "ATTENDANCE";
    } else if (deduplicatedGrades.length > 0) {
      primaryDocType = "GRADES";
    } else if (deduplicatedMarks.length > 0) {
      primaryDocType = "DETAILED_MARKS";
    } else {
      primaryDocType = results[0]?.documentType || "UNKNOWN";
    }

    // Resolve detected semester and overall confidence
    const detectedSemester =
      results.find((r) => r.detectedSemester)?.detectedSemester || null;

    const totalDetectedCount =
      results.reduce((sum, r) => sum + (r.totalSubjectsDetected || 0), 0) ||
      (deduplicatedAttendance.length + deduplicatedGrades.length + deduplicatedMarks.length);

    const lowestConfidence = results.some((r) => r.confidence === "LOW")
      ? "LOW"
      : results.some((r) => r.confidence === "MEDIUM")
      ? "MEDIUM"
      : "HIGH";

    return {
      documentType: primaryDocType,
      detectedSemester,
      totalSubjectsDetected: totalDetectedCount,
      confidence: lowestConfidence,
      summary: `Extracted academic data from ${images.length} image(s).`,
      attendanceRows: deduplicatedAttendance,
      gradeRows: deduplicatedGrades,
      detailedMarksRows: deduplicatedMarks,
      unreadableNotes: results.map((r) => r.unreadableNotes).filter(Boolean).join("; ") || null,
    };
  } catch (error: unknown) {
    const errorObj = error as { message?: string };
    const rawMessage = errorObj?.message || "Unknown AI error";

    if (rawMessage.includes("AI service is temporarily unavailable")) {
      throw error;
    }

    if (isTransientGeminiError(error)) {
      throw new Error(
        "AI service is temporarily unavailable. Please try again later or use CSV / Manual Import."
      );
    }

    if (rawMessage.includes("API key not valid") || rawMessage.includes("API_KEY_INVALID")) {
      throw new Error("Invalid GEMINI_API_KEY. Please verify your Gemini API key configuration.");
    }
    if (
      rawMessage.includes("quota") ||
      rawMessage.includes("RESOURCE_EXHAUSTED") ||
      rawMessage.includes("429")
    ) {
      throw new Error(
        "Gemini API rate limit exceeded or quota exhausted. You can still use CSV import."
      );
    }
    if (rawMessage.includes("deadline") || rawMessage.includes("timeout")) {
      throw new Error(
        "Gemini API request timed out. Please try uploading a clearer or smaller image."
      );
    }
    throw error;
  }
}
