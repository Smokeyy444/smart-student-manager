"use server";

import { studentProfileSchema, type StudentProfileInput } from "../validations/profile";
import { getCurrentUser } from "../auth/guards";
import { prisma } from "../prisma";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./auth";

export async function updateStudentProfile(
  input: StudentProfileInput
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      success: false,
      error: "You must be signed in to update your profile.",
    };
  }

  const validation = studentProfileSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: "Validation failed. Please correct the highlighted fields.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const {
    fullName,
    studentIdNumber,
    university,
    course,
    branch,
    currentSemester,
    avatarUrl,
  } = validation.data;

  try {
    const updated = await prisma.studentProfile.upsert({
      where: { userId: user.id },
      update: {
        fullName,
        studentIdNumber: studentIdNumber || null,
        university: university || null,
        course: course || null,
        branch: branch || null,
        currentSemester,
        avatarUrl: avatarUrl || null,
      },
      create: {
        userId: user.id,
        fullName,
        studentIdNumber: studentIdNumber || null,
        university: university || null,
        course: course || null,
        branch: branch || null,
        currentSemester,
        avatarUrl: avatarUrl || null,
      },
    });

    revalidatePath("/profile");
    revalidatePath("/dashboard");
    revalidatePath("/settings");

    return {
      success: true,
      data: updated,
    };
  } catch (error) {
    console.error("Profile update error:", error);
    return {
      success: false,
      error: "Failed to update profile. Please try again.",
    };
  }
}
