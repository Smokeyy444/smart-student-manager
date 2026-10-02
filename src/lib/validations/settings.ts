import { z } from "zod";

export const userSettingsSchema = z.object({
  defaultAttendanceTarget: z
    .number()
    .min(50.0, { message: "Attendance target must be at least 50%." })
    .max(99.9, { message: "Attendance target cannot exceed 99.9% (to avoid mathematical division anomalies)." })
    .default(75.0),
  defaultGradingScaleId: z.string().nullable().optional(),
  themePreference: z.enum(["light", "dark", "system"]).default("system"),
  inAppNotificationsEnabled: z.boolean().default(true),
  browserNotificationsEnabled: z.boolean().default(false),
});

export type UserSettingsInput = z.input<typeof userSettingsSchema>;
export type UserSettingsOutput = z.output<typeof userSettingsSchema>;
