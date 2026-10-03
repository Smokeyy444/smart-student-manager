import { z } from "zod";

// ─── Single aggregate update ─────────────────────────────────────────────────

export const aggregateAttendanceUpdateSchema = z
  .object({
    subjectId: z.string().min(1, { message: "Subject ID is required." }),
    classesAttended: z
      .coerce.number()
      .int({ message: "Classes attended must be a whole number." })
      .min(0, { message: "Classes attended cannot be negative." }),
    classesConducted: z
      .coerce.number()
      .int({ message: "Classes conducted must be a whole number." })
      .min(0, { message: "Classes conducted cannot be negative." }),
  })
  .refine((data) => data.classesAttended <= data.classesConducted, {
    message: "Classes attended cannot exceed classes conducted.",
    path: ["classesAttended"],
  });

export type AggregateAttendanceUpdateInput = z.input<typeof aggregateAttendanceUpdateSchema>;
export type AggregateAttendanceUpdateOutput = z.output<typeof aggregateAttendanceUpdateSchema>;

// ─── Quick update (present / absent) ─────────────────────────────────────────

export const quickAttendanceUpdateSchema = z.object({
  subjectId: z.string().min(1, { message: "Subject ID is required." }),
  action: z.enum(["PRESENT", "ABSENT"], {
    message: "Action must be PRESENT or ABSENT.",
  }),
});

export type QuickAttendanceUpdateInput = z.input<typeof quickAttendanceUpdateSchema>;
export type QuickAttendanceUpdateOutput = z.output<typeof quickAttendanceUpdateSchema>;

// ─── Reset attendance ─────────────────────────────────────────────────────────

export const resetAttendanceSchema = z.object({
  subjectId: z.string().min(1, { message: "Subject ID is required." }),
});

export type ResetAttendanceInput = z.input<typeof resetAttendanceSchema>;

// ─── Attendance log entry ─────────────────────────────────────────────────────

export const attendanceLogCreateSchema = z.object({
  subjectId: z.string().min(1, { message: "Subject ID is required." }),
  sessionDate: z
    .string()
    .min(1, { message: "Session date is required." })
    .refine((d) => !isNaN(Date.parse(d)), { message: "Session date must be a valid date." }),
  status: z.enum(["PRESENT", "ABSENT", "CANCELLED"], {
    message: "Status must be PRESENT, ABSENT, or CANCELLED.",
  }),
  notes: z
    .string()
    .max(500, { message: "Notes cannot exceed 500 characters." })
    .optional()
    .nullable(),
});

export type AttendanceLogCreateInput = z.input<typeof attendanceLogCreateSchema>;
export type AttendanceLogCreateOutput = z.output<typeof attendanceLogCreateSchema>;

// ─── Attendance log update ────────────────────────────────────────────────────

export const attendanceLogUpdateSchema = z.object({
  logId: z.string().min(1, { message: "Log ID is required." }),
  sessionDate: z
    .string()
    .min(1, { message: "Session date is required." })
    .refine((d) => !isNaN(Date.parse(d)), { message: "Session date must be a valid date." }),
  status: z.enum(["PRESENT", "ABSENT", "CANCELLED"], {
    message: "Status must be PRESENT, ABSENT, or CANCELLED.",
  }),
  notes: z
    .string()
    .max(500, { message: "Notes cannot exceed 500 characters." })
    .optional()
    .nullable(),
});

export type AttendanceLogUpdateInput = z.input<typeof attendanceLogUpdateSchema>;
export type AttendanceLogUpdateOutput = z.output<typeof attendanceLogUpdateSchema>;

// ─── CSV attendance import row ────────────────────────────────────────────────

export const attendanceCsvRowSchema = z
  .object({
    subjectCode: z.string().optional().nullable(),
    subjectName: z.string().min(1, { message: "Subject name is required." }),
    classesAttended: z
      .coerce.number()
      .int({ message: "Classes attended must be an integer." })
      .min(0, { message: "Classes attended cannot be negative." }),
    classesConducted: z
      .coerce.number()
      .int({ message: "Classes conducted must be an integer." })
      .min(0, { message: "Classes conducted cannot be negative." }),
  })
  .refine((d) => d.classesAttended <= d.classesConducted, {
    message: "Classes attended cannot exceed classes conducted.",
    path: ["classesAttended"],
  });

export type AttendanceCsvRowInput = z.input<typeof attendanceCsvRowSchema>;
export type AttendanceCsvRowOutput = z.output<typeof attendanceCsvRowSchema>;
