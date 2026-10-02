import { z } from "zod";

export const gradeMappingSchema = z.object({
  letter: z.string().trim().min(1, { message: "Grade letter is required." }).max(5),
  points: z.number().min(0, { message: "Grade points cannot be negative." }).max(100),
  minPercentage: z.number().min(0).max(100).optional(),
  maxPercentage: z.number().min(0).max(100).optional(),
  description: z.string().trim().max(100).optional(),
  isPassing: z.boolean().default(true),
});

export const gradingScaleSchema = z.object({
  name: z.string().trim().min(2, { message: "Scale name must be at least 2 characters." }).max(100),
  scaleType: z.enum(["TEN_POINT", "FOUR_POINT", "PERCENTAGE", "CUSTOM"]),
  mappings: z.array(gradeMappingSchema).min(2, { message: "Scale must define at least two grade levels." }),
  isDefault: z.boolean().default(false),
});

export type GradingScaleInput = z.infer<typeof gradingScaleSchema>;
