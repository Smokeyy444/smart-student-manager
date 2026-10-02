import { z } from "zod";

export const studentProfileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, { message: "Full name must be at least 2 characters long." })
    .max(100, { message: "Full name cannot exceed 100 characters." }),
  studentIdNumber: z
    .string()
    .trim()
    .max(50, { message: "Student ID number cannot exceed 50 characters." })
    .optional()
    .or(z.literal("")),
  university: z
    .string()
    .trim()
    .max(150, { message: "University / Institution name cannot exceed 150 characters." })
    .optional()
    .or(z.literal("")),
  course: z
    .string()
    .trim()
    .max(100, { message: "Course / Degree cannot exceed 100 characters." })
    .optional()
    .or(z.literal("")),
  branch: z
    .string()
    .trim()
    .max(100, { message: "Branch / Major cannot exceed 100 characters." })
    .optional()
    .or(z.literal("")),
  currentSemester: z
    .number()
    .int()
    .min(1, { message: "Semester must be at least 1." })
    .max(16, { message: "Semester cannot exceed 16." }),
  avatarUrl: z
    .string()
    .url({ message: "Avatar must be a valid URL." })
    .optional()
    .or(z.literal("")),
});

export type StudentProfileInput = z.infer<typeof studentProfileSchema>;
