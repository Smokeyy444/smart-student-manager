import { z } from "zod";

export const EventTypeEnum = z.enum([
  "EXAM",
  "TEST",
  "ASSIGNMENT",
  "PROJECT",
  "PRESENTATION",
  "COLLEGE_EVENT",
  "PERSONAL",
  "OTHER",
  "COLLEGE",
  "CUSTOM",
]);

export type EventTypeValue = z.infer<typeof EventTypeEnum>;

export const PriorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export type PriorityValue = z.infer<typeof PriorityEnum>;

export const EventStatusEnum = z.enum([
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);
export type EventStatusValue = z.infer<typeof EventStatusEnum>;

export const ReminderStatusEnum = z.enum([
  "SCHEDULED",
  "DUE",
  "COMPLETED",
  "DISMISSED",
  "CANCELLED",
  "TRIGGERED",
]);
export type ReminderStatusValue = z.infer<typeof ReminderStatusEnum>;

// Time string regex: HH:mm (24-hour)
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Date string regex: YYYY-MM-DD
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const reminderInputSchema = z.object({
  id: z.string().optional(),
  leadTimeMinutes: z.number().int().min(0, "Lead time must be non-negative"),
  triggerAt: z.union([z.string(), z.date()]).optional(),
  status: ReminderStatusEnum.optional(),
  channel: z.string().optional(),
});

export type ReminderInput = z.infer<typeof reminderInputSchema>;

export const createEventSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Event title is required")
      .max(200, "Event title cannot exceed 200 characters"),
    description: z
      .string()
      .trim()
      .max(2000, "Description cannot exceed 2000 characters")
      .optional()
      .nullable(),
    eventType: EventTypeEnum.default("ASSIGNMENT"),
    priority: PriorityEnum.default("MEDIUM"),
    date: z
      .string()
      .regex(dateRegex, "Date must be in YYYY-MM-DD format"),
    time: z
      .string()
      .regex(timeRegex, "Time must be in HH:mm 24-hour format")
      .optional()
      .nullable()
      .or(z.literal("")),
    endDate: z
      .string()
      .regex(dateRegex, "End date must be in YYYY-MM-DD format")
      .optional()
      .nullable()
      .or(z.literal("")),
    endTime: z
      .string()
      .regex(timeRegex, "End time must be in HH:mm 24-hour format")
      .optional()
      .nullable()
      .or(z.literal("")),
    isAllDay: z.boolean().optional().default(false),
    semesterId: z.string().trim().optional().nullable().or(z.literal("")),
    subjectId: z.string().trim().optional().nullable().or(z.literal("")),
    reminders: z.array(reminderInputSchema).optional().default([]),
  })
  .refine(
    (data) => {
      // If end date is provided, it cannot precede start date
      if (data.endDate && data.endDate.trim() !== "") {
        if (data.endDate < data.date) {
          return false;
        }
        // If same date and both have times, end time cannot precede start time
        if (
          data.endDate === data.date &&
          data.time &&
          data.endTime &&
          data.time.trim() !== "" &&
          data.endTime.trim() !== ""
        ) {
          if (data.endTime < data.time) {
            return false;
          }
        }
      }
      return true;
    },
    {
      message: "End date and time cannot precede event start date and time",
      path: ["endDate"],
    }
  );

export type CreateEventInput = z.input<typeof createEventSchema>;

export const updateEventSchema = z
  .object({
    id: z.string().min(1, "Event ID is required"),
    title: z
      .string()
      .trim()
      .min(1, "Event title is required")
      .max(200, "Event title cannot exceed 200 characters")
      .optional(),
    description: z
      .string()
      .trim()
      .max(2000, "Description cannot exceed 2000 characters")
      .optional()
      .nullable(),
    eventType: EventTypeEnum.optional(),
    priority: PriorityEnum.optional(),
    status: EventStatusEnum.optional(),
    date: z
      .string()
      .regex(dateRegex, "Date must be in YYYY-MM-DD format")
      .optional(),
    time: z
      .string()
      .regex(timeRegex, "Time must be in HH:mm 24-hour format")
      .optional()
      .nullable()
      .or(z.literal("")),
    endDate: z
      .string()
      .regex(dateRegex, "End date must be in YYYY-MM-DD format")
      .optional()
      .nullable()
      .or(z.literal("")),
    endTime: z
      .string()
      .regex(timeRegex, "End time must be in HH:mm 24-hour format")
      .optional()
      .nullable()
      .or(z.literal("")),
    isAllDay: z.boolean().optional(),
    semesterId: z.string().trim().optional().nullable().or(z.literal("")),
    subjectId: z.string().trim().optional().nullable().or(z.literal("")),
    reminders: z.array(reminderInputSchema).optional(),
  })
  .refine(
    (data) => {
      if (data.date && data.endDate && data.endDate.trim() !== "") {
        if (data.endDate < data.date) {
          return false;
        }
        if (
          data.endDate === data.date &&
          data.time &&
          data.endTime &&
          data.time.trim() !== "" &&
          data.endTime.trim() !== ""
        ) {
          if (data.endTime < data.time) {
            return false;
          }
        }
      }
      return true;
    },
    {
      message: "End date and time cannot precede event start date and time",
      path: ["endDate"],
    }
  );

export type UpdateEventInput = z.input<typeof updateEventSchema>;

export const filterEventsSchema = z.object({
  query: z.string().optional(),
  eventType: z.string().optional(),
  priority: z.string().optional(),
  status: z.enum(["ALL", "PENDING", "COMPLETED", "OVERDUE"]).optional().default("ALL"),
  semesterId: z.string().optional(),
  subjectId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sortBy: z.enum(["date-asc", "date-desc", "priority", "title"]).optional().default("date-asc"),
});

export type FilterEventsInput = z.input<typeof filterEventsSchema>;
