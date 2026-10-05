import { GoogleGenAI, Type, type Part } from "@google/genai";
import {
  SmartExtractionResultSchema,
  type SmartExtractionResult,
  type ImportDocumentType,
} from "./extraction-schemas";

/**
 * Returns the configured Gemini multimodal model.
 * Per project specifications: prefers Gemini 3.8 Flash or Gemini 2.5 Flash multimodal models.
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
 * Builds the extraction prompt instructions.
 */
function buildExtractionPrompt(documentType: ImportDocumentType): string {
  return `You are a high-precision academic document data extraction assistant for university student portals.
Your task is to examine the provided university screenshot(s) / photos and extract structured academic data.

Target extraction mode requested by user: ${documentType}

CRITICAL EXTRACTION RULES:
1. DISTINGUISH VISIBLE DATA VS UNKNOWN DATA:
   - If a value cannot be clearly read, is cut off, blurry, or absent: return null.
   - Do NOT guess, extrapolate, estimate, or fabricate missing academic values.
   - If credits are not visible: credits = null.
   - If grade point is not visible: gradePoint = null.
   - If marks obtained are not visible: marksObtained = null.

2. DOCUMENT TYPE DETECTION:
   - If documentType is AUTO_DETECT, examine the image:
     * If the image primarily shows classes attended/delivered/percentage, set documentType to "ATTENDANCE".
     * If the image shows grades, letter grades (e.g. A+, B), credits, or SGPA, set documentType to "GRADES".
     * If the image shows detailed assessment components (e.g. Mid Term, CA, Attendance Marks, End Term), set documentType to "DETAILED_MARKS".
   - If a specific type was requested ("ATTENDANCE", "GRADES", "DETAILED_MARKS"), respect that focus.

3. ATTENDANCE EXTRACTION:
   - Extract subject code, subject name, attended classes count, conducted classes count, percentage, last attended date, and duty leave if visible.
   - Conducted classes must represent the total classes delivered/held.
   - Attended classes must represent the count the student attended.

4. GRADES / RESULTS EXTRACTION:
   - Extract semester (e.g. "I", "3", "Fall 2024"), subject code, subject name, grade letter (e.g. "A+", "O", "B"), grade point, marks obtained, max marks, and credits.

5. DETAILED MARKS EXTRACTION:
   - PRESERVE SOURCE TERMINOLOGY: Keep exact original component names (e.g. "Continuous Assessment", "Attendance Marks", "Objective Type Mid Term", "Theory End Term", "Lab Internal").
   - Do NOT normalize or alter these component names.
   - Extract marksObtained, maxMarks, weightageEarned, and weightageMax where visible.

6. CONFIDENCE RATING:
   - Assign "HIGH" if text and numbers are crystal clear and unambiguous.
   - Assign "MEDIUM" if text is slightly blurry, angled, or had minor visual artifacts.
   - Assign "LOW" if digits or characters are ambiguous or difficult to read clearly.

7. Return ONLY clean JSON matching the structured schema.`;
}

/**
 * Calls Gemini multimodal API to extract academic data from one or more images.
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

  const promptText = buildExtractionPrompt(requestedType);

  // Build multimodal parts: images + instruction text
  const parts: Part[] = [];

  for (const img of images) {
    parts.push({
      inlineData: {
        data: img.data,
        mimeType: img.mimeType,
      },
    });
  }

  parts.push({
    text: promptText,
  });

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        {
          role: "user",
          parts,
        },
      ],
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

    // Validate with Zod schema
    const validation = SmartExtractionResultSchema.safeParse(parsedJson);
    if (!validation.success) {
      console.error("Zod extraction schema validation error:", validation.error.flatten());
      throw new Error("Extracted data did not conform to the expected academic data format.");
    }

    return validation.data;
  } catch (error: unknown) {
    const errorObj = error as { message?: string };
    console.error("Gemini Extraction Error:", errorObj?.message || error);
    // Sanitize error messages for client-facing security
    const message = errorObj?.message || "Unknown AI error";
    if (message.includes("API key not valid") || message.includes("API_KEY_INVALID")) {
      throw new Error("Invalid GEMINI_API_KEY. Please verify your Gemini API key configuration.");
    }
    if (message.includes("quota") || message.includes("RESOURCE_EXHAUSTED") || message.includes("429")) {
      throw new Error("Gemini API rate limit exceeded or quota exhausted. You can still use CSV import.");
    }
    if (message.includes("deadline") || message.includes("timeout")) {
      throw new Error("Gemini API request timed out. Please try uploading a clearer or smaller image.");
    }
    throw error;
  }
}
