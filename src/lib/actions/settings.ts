"use server";

import { userSettingsSchema, type UserSettingsInput } from "../validations/settings";
import { getCurrentUser } from "../auth/guards";
import { prisma } from "../prisma";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./auth";

export async function updateUserSettings(
  input: UserSettingsInput
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      success: false,
      error: "You must be signed in to modify settings.",
    };
  }

  const validation = userSettingsSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: "Invalid settings data.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const {
    defaultAttendanceTarget,
    defaultGradingScaleId,
    themePreference,
    inAppNotificationsEnabled,
    browserNotificationsEnabled,
  } = validation.data;

  try {
    const updated = await prisma.userSetting.upsert({
      where: { userId: user.id },
      update: {
        defaultAttendanceTarget,
        defaultGradingScaleId,
        themePreference,
        inAppNotificationsEnabled,
        browserNotificationsEnabled,
      },
      create: {
        userId: user.id,
        defaultAttendanceTarget,
        defaultGradingScaleId,
        themePreference,
        inAppNotificationsEnabled,
        browserNotificationsEnabled,
      },
    });

    revalidatePath("/settings");
    revalidatePath("/dashboard");

    return {
      success: true,
      data: updated,
    };
  } catch (error) {
    console.error("Settings update error:", error);
    return {
      success: false,
      error: "Failed to save settings. Please try again.",
    };
  }
}
