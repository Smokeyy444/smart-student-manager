import { z } from "zod";

export const semesterSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "Semester name is required." })
    .max(100, { message: "Semester name cannot exceed 100 characters." }),
  semesterNumber: z
    .coerce
    .number()
    .int()
    .min(1, { message: "Semester number must be at least 1." })
    .max(20, { message: "Semester number cannot exceed 20." }),
  status: z.enum(["ACTIVE", "COMPLETED", "ARCHIVED"]).default("ACTIVE"),
  startDate: z.string().optional().nullable().or(z.literal("")),
  endDate: z.string().optional().nullable().or(z.literal("")),
});

export type SemesterInput = z.input<typeof semesterSchema>;
export type SemesterOutput = z.output<typeof semesterSchema>;

export const subjectSchema = z.object({
  semesterId: z.string().min(1, { message: "Semester ID is required." }),
  name: z
    .string()
    .trim()
    .min(1, { message: "Subject name is required." })
    .max(150, { message: "Subject name cannot exceed 150 characters." }),
  code: z
    .string()
    .trim()
    .max(50, { message: "Course code cannot exceed 50 characters." })
    .optional()
    .or(z.literal("")),
  creditHours: z
    .coerce
    .number()
    .min(0, { message: "Credit hours cannot be negative." })
    .max(30, { message: "Credit hours cannot exceed 30." })
    .default(3.0),
  category: z.enum(["CORE", "ELECTIVE", "LAB", "AUDIT"]).default("CORE"),
  isAudit: z.boolean().default(false),
  customAttendanceTarget: z
    .coerce
    .number()
    .min(50.0, { message: "Attendance target must be at least 50%." })
    .max(99.9, { message: "Attendance target cannot exceed 99.9%." })
    .optional()
    .nullable(),
});

export type SubjectInput = z.input<typeof subjectSchema>;
export type SubjectOutput = z.output<typeof subjectSchema>;

export const gradeEntryModeSchema = z.enum(["GRADE", "MARKS", "BOTH"]);
export type GradeEntryMode = z.infer<typeof gradeEntryModeSchema>;

export const subjectGradeSchema = z
  .object({
    subjectId: z.string().min(1, { message: "Subject ID is required." }),
    mode: gradeEntryModeSchema.default("GRADE"),
    gradeLetter: z.string().trim().optional().nullable().or(z.literal("")),
    gradePoint: z.number().min(0).max(100).optional().nullable(),
    marksObtained: z.coerce.number().min(0, { message: "Marks cannot be negative." }).optional().nullable(),
    maxMarks: z.coerce.number().min(1, { message: "Max marks must be greater than 0." }).default(100.0),
  })
  .refine(
    (data) => {
      if (data.mode === "GRADE") {
        return !!data.gradeLetter && data.gradeLetter.trim().length > 0;
      }
      return true;
    },
    {
      message: "Please select a grade letter.",
      path: ["gradeLetter"],
    }
  )
  .refine(
    (data) => {
      if (data.mode === "MARKS" || data.mode === "BOTH") {
        return typeof data.marksObtained === "number" && !isNaN(data.marksObtained);
      }
      return true;
    },
    {
      message: "Please enter marks obtained.",
      path: ["marksObtained"],
    }
  )
  .refine(
    (data) => {
      if (
        (data.mode === "MARKS" || data.mode === "BOTH") &&
        typeof data.marksObtained === "number" &&
        typeof data.maxMarks === "number"
      ) {
        return data.marksObtained <= data.maxMarks;
      }
      return true;
    },
    {
      message: "Marks obtained cannot exceed maximum marks.",
      path: ["marksObtained"],
    }
  )
  .refine(
    (data) => {
      if (data.mode === "BOTH") {
        return !!data.gradeLetter && data.gradeLetter.trim().length > 0;
      }
      return true;
    },
    {
      message: "Please select a grade letter when entering both marks and grade.",
      path: ["gradeLetter"],
    }
  );

export type SubjectGradeInput = z.input<typeof subjectGradeSchema>;
export type SubjectGradeOutput = z.output<typeof subjectGradeSchema>;

// Bulk Subject Entry Schema
export const bulkSubjectRowSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "Subject name is required." })
    .max(150, { message: "Subject name cannot exceed 150 characters." }),
  code: z
    .string()
    .trim()
    .max(50, { message: "Course code cannot exceed 50 characters." })
    .optional()
    .nullable()
    .or(z.literal("")),
  creditHours: z
    .coerce
    .number()
    .min(0, { message: "Credit hours cannot be negative." })
    .max(30, { message: "Credit hours cannot exceed 30." })
    .default(3.0),
  category: z.enum(["CORE", "ELECTIVE", "LAB", "AUDIT"]).default("CORE"),
  isAudit: z.boolean().default(false),
  customAttendanceTarget: z
    .coerce
    .number()
    .min(50.0, { message: "Attendance target must be at least 50%." })
    .max(99.9, { message: "Attendance target cannot exceed 99.9%." })
    .optional()
    .nullable(),
});

export type BulkSubjectRowInput = z.input<typeof bulkSubjectRowSchema>;
export type BulkSubjectRowOutput = z.output<typeof bulkSubjectRowSchema>;

export const bulkSubjectsSchema = z.object({
  semesterId: z.string().min(1, { message: "Semester ID is required." }),
  subjects: z
    .array(bulkSubjectRowSchema)
    .min(1, { message: "At least one subject must be provided." })
    .max(50, { message: "Cannot bulk add more than 50 subjects at once." }),
});

export type BulkSubjectsInput = z.input<typeof bulkSubjectsSchema>;
export type BulkSubjectsOutput = z.output<typeof bulkSubjectsSchema>;

// Bulk Grade Entry Schema
export const bulkGradeRowSchema = z
  .object({
    subjectId: z.string().min(1, { message: "Subject ID is required." }),
    mode: gradeEntryModeSchema.default("GRADE"),
    gradeLetter: z.string().trim().optional().nullable().or(z.literal("")),
    marksObtained: z.coerce.number().min(0, { message: "Marks cannot be negative." }).optional().nullable(),
    maxMarks: z.coerce.number().min(1, { message: "Max marks must be greater than 0." }).default(100.0),
  })
  .refine(
    (data) => {
      if (data.mode === "GRADE") {
        return !!data.gradeLetter && data.gradeLetter.trim().length > 0;
      }
      return true;
    },
    {
      message: "Please select a grade letter.",
      path: ["gradeLetter"],
    }
  )
  .refine(
    (data) => {
      if (data.mode === "MARKS" || data.mode === "BOTH") {
        return typeof data.marksObtained === "number" && !isNaN(data.marksObtained);
      }
      return true;
    },
    {
      message: "Please enter marks obtained.",
      path: ["marksObtained"],
    }
  )
  .refine(
    (data) => {
      if (
        (data.mode === "MARKS" || data.mode === "BOTH") &&
        typeof data.marksObtained === "number" &&
        typeof data.maxMarks === "number"
      ) {
        return data.marksObtained <= data.maxMarks;
      }
      return true;
    },
    {
      message: "Marks obtained cannot exceed maximum marks.",
      path: ["marksObtained"],
    }
  )
  .refine(
    (data) => {
      if (data.mode === "BOTH") {
        return !!data.gradeLetter && data.gradeLetter.trim().length > 0;
      }
      return true;
    },
    {
      message: "Please select a grade letter when entering both marks and grade.",
      path: ["gradeLetter"],
    }
  );

export type BulkGradeRowInput = z.input<typeof bulkGradeRowSchema>;
export type BulkGradeRowOutput = z.output<typeof bulkGradeRowSchema>;

export const bulkGradesSchema = z.object({
  grades: z
    .array(bulkGradeRowSchema)
    .min(1, { message: "At least one grade result must be provided." }),
});

export type BulkGradesInput = z.input<typeof bulkGradesSchema>;
export type BulkGradesOutput = z.output<typeof bulkGradesSchema>;

// Bulk Attendance Entry Schema
export const bulkAttendanceRowSchema = z
  .object({
    subjectId: z.string().min(1, { message: "Subject ID is required." }),
    classesAttended: z
      .coerce
      .number()
      .int({ message: "Classes attended must be an integer." })
      .min(0, { message: "Classes attended cannot be negative." }),
    classesConducted: z
      .coerce
      .number()
      .int({ message: "Classes conducted must be an integer." })
      .min(0, { message: "Classes conducted cannot be negative." }),
  })
  .refine((data) => data.classesAttended <= data.classesConducted, {
    message: "Classes attended cannot exceed classes conducted.",
    path: ["classesAttended"],
  });

export type BulkAttendanceRowInput = z.input<typeof bulkAttendanceRowSchema>;
export type BulkAttendanceRowOutput = z.output<typeof bulkAttendanceRowSchema>;

export const bulkAttendanceSchema = z.object({
  records: z
    .array(bulkAttendanceRowSchema)
    .min(1, { message: "At least one attendance record must be provided." }),
});

export type BulkAttendanceInput = z.input<typeof bulkAttendanceSchema>;
export type BulkAttendanceOutput = z.output<typeof bulkAttendanceSchema>;
