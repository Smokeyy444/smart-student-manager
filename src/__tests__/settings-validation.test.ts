import { describe, it, expect } from "vitest";
import { userSettingsSchema } from "@/lib/validations/settings";

describe("User Settings Validation Schema", () => {
  it("should successfully parse valid user settings", () => {
    const validSettings = {
      defaultAttendanceTarget: 75.0,
      defaultGradingScaleId: "standard-10-point",
      themePreference: "dark",
      inAppNotificationsEnabled: true,
      browserNotificationsEnabled: false,
    };

    const result = userSettingsSchema.safeParse(validSettings);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaultAttendanceTarget).toBe(75.0);
      expect(result.data.themePreference).toBe("dark");
    }
  });

  it("should enforce attendance target bounds (50% to 99.9%)", () => {
    // Exactly at boundaries
    expect(userSettingsSchema.safeParse({ defaultAttendanceTarget: 50.0 }).success).toBe(true);
    expect(userSettingsSchema.safeParse({ defaultAttendanceTarget: 99.9 }).success).toBe(true);

    // Below 50%
    expect(userSettingsSchema.safeParse({ defaultAttendanceTarget: 49.9 }).success).toBe(false);

    // 100% or higher is rejected to prevent mathematical division by zero in catch-up formulas
    expect(userSettingsSchema.safeParse({ defaultAttendanceTarget: 100.0 }).success).toBe(false);
    expect(userSettingsSchema.safeParse({ defaultAttendanceTarget: 105.0 }).success).toBe(false);
  });

  it("should validate theme preferences to only light, dark, or system", () => {
    expect(userSettingsSchema.safeParse({ themePreference: "light" }).success).toBe(true);
    expect(userSettingsSchema.safeParse({ themePreference: "dark" }).success).toBe(true);
    expect(userSettingsSchema.safeParse({ themePreference: "system" }).success).toBe(true);
    expect(userSettingsSchema.safeParse({ themePreference: "solarized" }).success).toBe(false);
  });

  it("should apply default values when fields are omitted", () => {
    const result = userSettingsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaultAttendanceTarget).toBe(75.0);
      expect(result.data.themePreference).toBe("system");
      expect(result.data.inAppNotificationsEnabled).toBe(true);
      expect(result.data.browserNotificationsEnabled).toBe(false);
    }
  });
});
