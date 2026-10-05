# Smart Import — AI Image Data Extraction Guide
## Smart Student Manager

This document provides complete documentation for the **Smart Import** subsystem in Smart Student Manager. Smart Import empowers students to upload screenshots and photos of their university portals (attendance pages, grade sheets, or detailed assessment breakdown cards) and extract structured academic data into their curriculum automatically using Google's Gemini multimodal AI.

---

## 1. Supported Image Formats & Upload Limits

| Specification | Limit / Requirement | Details |
| :--- | :--- | :--- |
| **Supported File Types** | PNG, JPEG/JPG, WEBP | Standard screenshot and camera capture formats |
| **Max File Size** | 10 MB per image | Enforced client-side and server-side |
| **Max Images per Session** | 5 screenshots | Multi-image support (e.g. Page 1 + Page 2) |
| **Permanent Image Storage** | **None** (Zero retention) | In-memory extraction only; discarded immediately |

---

## 2. Smart Import Workflow

The extraction and review lifecycle guarantees that **no AI-extracted data is ever persisted directly to the database without user review and confirmation**:

```mermaid
flowchart TD
    A[Student Uploads Screenshot(s)] --> B[Select Target Semester & Mode]
    B --> C[Client-Side Validation: MIME & Size]
    C --> D[Server Action: Multi-Part Base64 Encoding]
    D --> E[Gemini Multimodal Structured Extraction]
    E --> F[Zod Schema Validation & Sanitization]
    F --> G[Subject Resolution & Code Normalization]
    G --> H[Attendance Engine Recalculation & Discrepancy Check]
    H --> I[Grading Engine Scale & Contradiction Validation]
    I --> J[Duplicate Detection Against Active Curriculum]
    J --> K[Interactive Review & Edit Modal]
    K --> L{Student Confirms?}
    L -- Cancel --> M[Discard Extraction Data]
    L -- Import Selected / Valid --> N[Atomic Prisma Database Transaction]
    N --> O[Revalidate Grades, Attendance & Dashboard]
    O --> P[Import Complete Summary Screen]
```

---

## 3. Supported Extraction Fields

### A. Attendance Records
Extracted when present on university portal screenshots:
- **Subject Code** (e.g. `CSE202`, `INT306`)
- **Subject Name** (e.g. `Object Oriented Programming`)
- **Classes Attended** (non-negative integer)
- **Classes Conducted / Delivered** (non-negative integer)
- **Attendance Percentage** (e.g. `95.0%`)
- **Last Attended Date** (e.g. `12-Oct-2024`)
- **Duty Leave / Medical Exemption** (if reported on portal)
- **Notes / Status**

> [!IMPORTANT]
> **Attendance Percentage Engine Rule**: The application does **not** blindly trust the AI-extracted percentage over mathematical ground truth. Smart Student Manager takes `attended` and `conducted` and executes `calculateAttendancePercentage(attended, conducted)`. If the portal's stated percentage differs by more than 0.1% (e.g., due to rounding or unapproved leaves), the UI displays a clear non-blocking warning informing the student that the system calculation will be used.

### B. Grades & Results
Extracted when present on grade reports:
- **Semester / Term Indicator** (e.g. `Semester 3`, `Fall 2024`)
- **Subject Code & Subject Name**
- **Letter Grade** (e.g. `A+`, `O`, `B`, `F`)
- **Grade Point** (e.g. `9.0`, `10.0`, `4.0`)
- **Marks Obtained & Maximum Marks** (e.g. `85 / 100`)
- **Credit Hours** (e.g. `3.0`, `4.0`)

> [!IMPORTANT]
> **Grade Contradiction Detection**: If both marks and a letter grade are read from the screenshot, the server validates them against the student's active `GradingScale`. If a contradiction occurs (e.g., marks = `85/100` which maps to `A+`, but the screenshot was read as `D`), import is **blocked for that row** with a visible error banner until the user edits and resolves the conflict.

### C. Detailed Marks / Assessment Breakdowns
For continuous assessment (CA), mid-term, and end-term breakdown screenshots:
- **Assessment Component Name**: **Exact source terminology is strictly preserved** (e.g. `Continuous Assessment`, `Objective Type Mid Term`, `Theory End Term`, `Attendance Marks`, `Lab Internal`). Names are **never** arbitrarily normalized.
- **Raw Marks Obtained & Maximum Marks**
- **Weightage Earned & Weightage Maximum**
- **Final Marks & Final Grade** (or auto-calculated sum from valid components)

---

## 4. Confidence & Unknown Data Principles

### Unknown Values (No Guessing / Hallucination)
- **Strict Separation**: Visible data vs. Unknown data.
- If a value cannot be clearly read (e.g. blurred credit hours, cropped grade point, ambiguous handwriting), the model returns `null`.
- The system **never** invents, extrapolates, or fabricates missing academic credentials.

### Confidence Indicators
Every extracted record displays a visual confidence badge:
- **HIGH** (Green): All characters and numbers are crystal clear and unambiguous.
- **MEDIUM** (Amber): Minor visual compression or angled camera capture.
- **LOW — please verify** (Rose/Red): Ambiguous digits or blurry screenshot. Low-confidence rows are highlighted with prominent borders to prompt careful student review before confirming.

---

## 5. Subject Matching Algorithm

After structured extraction, subjects are automatically matched against the student's existing subjects enrolled in the target semester using a strict 3-tier cascade:

1. **Exact Subject Code**: Case-insensitive, trimmed match (e.g., `CSE202` == `CSE202`).
2. **Normalized Subject Code**: Strips non-alphanumeric punctuation and spaces (e.g., `CSE-202` == `CSE202`).
3. **Strong Normalized Subject Name**: Lowercase, stripped punctuation, exact clean string equality (e.g., `Data Structures & Algorithms` == `Data Structures and Algorithms`).

> [!CAUTION]
> **No Weak Fuzzy Matching**: Weak or ambiguous fuzzy matches are explicitly disallowed to prevent silently corrupting records. If a subject cannot be confidently matched, its status is set to **"Needs Review"**, and the review UI presents a dropdown allowing the student to select an existing course or choose **"+ Create New Course"**.

---

## 6. Duplicate Detection & Resolution

If an extracted course matches an existing subject that already has an enrolled `AttendanceRecord` or `SubjectGrade`:
- The item is flagged with an **"Existing record found"** badge.
- The student can choose between:
  - **Replace Existing**: Overwrites the existing attendance numbers or grade in the database.
  - **Keep Existing (Skip)**: Ignores the imported row and retains the existing database record.

---

## 7. Privacy & Security Architecture

1. **Server-Side API Key Only**:
   - `GEMINI_API_KEY` is loaded exclusively in server actions (`"use server"`).
   - It is **never** prefixed with `NEXT_PUBLIC_` and never included in client JavaScript bundles.
2. **Zero Permanent Image Retention**:
   - Uploaded screenshots are converted to temporary in-memory buffers for the Gemini API call.
   - Images are **never** saved to the local file system or cloud object storage.
   - All buffers are freed from memory as soon as the structured JSON is extracted.
3. **Log Sanitization**:
   - Image payloads, student photos, and secret keys are never written to server console logs.
4. **Rate Limiting & Abuse Prevention**:
   - In-memory rate limiting prevents rapid repeated submissions (maximum 10 extraction requests per 5 minutes per user session).
   - File count and size limits (max 5 files, 10 MB each) protect server compute resources.

---

## 8. Fallback to Manual & CSV Entry

Smart Import is built as an **additive enhancement**:
- **Manual Entry** remains fully functional.
- **CSV / TSV Import & Export** remain fully intact and accessible throughout the application.
- If `GEMINI_API_KEY` is not configured, or if the Gemini service encounters network or rate limit issues, the UI displays clear, user-friendly fallback guidance with a direct one-click switch to CSV Import.

---

## 9. Environment Configuration

In `.env`:
```env
# Google Gemini API key for Smart Import (Server-side secret only)
GEMINI_API_KEY="your-gemini-api-key"

# Optional model override (defaults to gemini-2.5-flash)
GEMINI_MODEL="gemini-2.5-flash"
```

Refer to [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment instructions on Vercel.
