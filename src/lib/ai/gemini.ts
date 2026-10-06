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
 * Returns the configured Gemini multimodal model.
 * Per project specifications: prefers configured GEMINI_MODEL (e.g. gemini-3.8-flash) or gemini-2.5-flash.
 */
export function getGeminiModelName(): string {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
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
export function buildExtractionPrompt(
  documentType: ImportDocumentType,
  imageIndex: number = 1,
  totalImages: number = 1
): string {
  const multiImageContext =
    totalImages > 1
      ? `Image context: You are analyzing Image ${imageIndex} of ${totalImages} from an uploaded academic document set.`
      : `Image context: You are analyzing a single academic document / screenshot.`;

  return `You are a high-precision academic-table OCR and data extraction system for university student portals.
${multiImageContext}

TARGET EXTRACTION MODE: ${documentType}

CRITICAL TABLE-LEVEL EXTRACTION DIRECTIVES:
1. FULL TABLE INSPECTION:
   - Inspect the ENTIRE image from top to bottom before extracting anything.
   - A single screenshot typically contains one large table with 5 to 15+ subjects. Do NOT assume subjects look like separate cards.
   - Identify the complete table boundaries, header row, and every data row from the first row to the bottom row.
   - Extract EVERY subject/course row that is visible and readable.
   - Do NOT stop after finding the first valid subject.
   - Do NOT return only the most obvious or first row.
   - Do NOT summarize or group the table into a sample.
   - Do NOT omit rows simply because some columns are difficult to read or contain small text.
   - Preserve each row independently. Return one distinct object per subject.

2. TABLE STRUCTURE & LAYOUT RECOGNITION:
   - Identify header rows containing: "S.No", "Course Code", "Subject Code", "Course Name / Title", "Lectures Conducted / Delivered / Held", "Lectures Attended / Present", "Percentage / %", "Duty Leave", "Last Attended Date".
   - Recognize wrapped / multiline subject names and codes that span multiple lines inside a cell.
   - Recognize rows separated by horizontal grid lines or alternating shading.
   - Handle combined columns like "38/40" or "Attended/Delivered: 38/40":
     * The first number is attended (38).
     * The second number is conducted (40).
   - Some tables display attended classes as "Present", conducted classes as "Total" or "Delivered".

3. ACCURACY & UNKNOWN DATA HANDLING:
   - Subject code + subject name + attended + conducted are the priority fields.
   - If one field is unreadable, blurry, or cut off, return null for that field rather than dropping the entire subject.
   - Never fabricate, guess, or extrapolate missing academic values.
   - If credits are not visible: credits = null.
   - If grade point is not visible: gradePoint = null.
   - If marks obtained are not visible: marksObtained = null.

4. ATTENDANCE VALUES:
   - conducted: MUST represent the total classes delivered/held (conducted >= 0).
   - attended: MUST represent the classes attended/present (attended >= 0).
   - attendancePercentage: extract the printed percentage if visible (number between 0 and 100), or null if not visible. Application code will independently derive and verify the percentage.

5. GRADES & MARKS BREAKDOWN:
   - Extract every row in the grades/results table (semester, subjectCode, subjectName, grade, gradePoint, marksObtained, maxMarks, credits).
   - For detailed assessment components (e.g. Continuous Assessment, Mid Term, Theory End Term, Lab Internal, Attendance Marks): preserve the source component names verbatim.

6. ROW COUNT VERIFICATION:
   - Before finalizing the response, count the number of subject rows detected in the image and set totalSubjectsDetected to that count.
   - Make sure the returned attendanceRows (or gradeRows) contains every readable subject row visible in the table.

7. CONFIDENCE RATING:
   - HIGH: Text and numbers are clear, high resolution, and unambiguous.
   - MEDIUM: Text is slightly blurry, angled, or had minor compression artifacts.
   - LOW: Digits or codes are ambiguous or difficult to read clearly.

Return ONLY clean JSON adhering to the structured response schema.`;
}

/**
 * Builds a second-pass recovery prompt for suspicious or incomplete extractions.
 */
function buildRecoveryPrompt(firstPassRowCount: number): string {
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
    requestedType === "ATTENDANCE" || result.documentType === "ATTENDANCE";

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

  return false;
}

/**
 * Extracts academic data from a single image using Gemini.
 * Includes automatic second-pass recovery if initial extraction appears incomplete.
 */
async function extractSingleImage(
  ai: GoogleGenAI,
  modelName: string,
  img: ImagePart,
  imageIndex: number,
  totalImages: number,
  requestedType: ImportDocumentType
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

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [{ role: "user", parts }],
    config: {
      responseMimeType: "application/json",
      responseSchema: EXTRACTION_RESPONSE_SCHEMA,
    },
  });

  const responseText = response.text;
  if (!responseText || responseText.trim().length === 0) {
    throw new Error("Gemini returned an empty response.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(responseText);
  } catch {
    throw new Error("Could not parse AI response as valid JSON.");
  }

  const validation = SmartExtractionResultSchema.safeParse(parsedJson);
  if (!validation.success) {
    console.error("Zod extraction schema validation error:", validation.error.flatten());
    throw new Error("Extracted data did not conform to the expected academic data format.");
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

  // Second-pass recovery check for attendance screenshots
  if (isExtractionSuspicious(result, requestedType)) {
    try {
      const recoveryPrompt = buildRecoveryPrompt(result.attendanceRows.length);
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
        model: modelName,
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
          const taggedRecoveryRows = recoveryData.attendanceRows.map((r) => ({
            ...r,
            sourceImageIndex: imageIndex,
          }));

          // Merge pass 1 and recovery pass rows, deduplicating
          const mergedAttendance = deduplicateAttendanceRows([
            ...result.attendanceRows,
            ...taggedRecoveryRows,
          ]);

          result = {
            ...result,
            attendanceRows: mergedAttendance,
            totalSubjectsDetected: Math.max(
              result.totalSubjectsDetected || 0,
              mergedAttendance.length
            ),
          };
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
  requestedType: ImportDocumentType = "AUTO_DETECT"
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

  const modelName = getGeminiModelName();
  const ai = new GoogleGenAI({ apiKey });

  try {
    // Process each image individually to ensure 100% focused table OCR per image
    const results = await Promise.all(
      images.map((img, index) =>
        extractSingleImage(
          ai,
          modelName,
          img,
          index + 1,
          images.length,
          requestedType
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
    console.error("Gemini Extraction Error:", errorObj?.message || error);
    const message = errorObj?.message || "Unknown AI error";
    if (message.includes("API key not valid") || message.includes("API_KEY_INVALID")) {
      throw new Error("Invalid GEMINI_API_KEY. Please verify your Gemini API key configuration.");
    }
    if (
      message.includes("quota") ||
      message.includes("RESOURCE_EXHAUSTED") ||
      message.includes("429")
    ) {
      throw new Error(
        "Gemini API rate limit exceeded or quota exhausted. You can still use CSV import."
      );
    }
    if (message.includes("deadline") || message.includes("timeout")) {
      throw new Error(
        "Gemini API request timed out. Please try uploading a clearer or smaller image."
      );
    }
    throw error;
  }
}
