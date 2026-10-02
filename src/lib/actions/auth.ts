"use server";

import { registerSchema, loginSchema, type RegisterInput, type LoginInput } from "../validations/auth";
import { prisma } from "../prisma";
import { hashPassword, verifyPassword } from "../auth/password";
import { createSessionCookie, deleteSessionCookie } from "../auth/session";
import { redirect } from "next/navigation";

export interface ActionResult<T = unknown> {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: T;
}

export async function registerUser(input: RegisterInput): Promise<ActionResult> {
  const validation = registerSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: "Validation failed. Please correct the highlighted fields.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { fullName, email, password } = validation.data;

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      return {
        success: false,
        error: "An account with this email address already exists.",
      };
    }

    const passwordHash = await hashPassword(password);

    // Atomically create User, StudentProfile, UserSetting, and initial Semester
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: "STUDENT",
        },
      });

      await tx.studentProfile.create({
        data: {
          userId: newUser.id,
          fullName,
          currentSemester: 1,
        },
      });

      await tx.userSetting.create({
        data: {
          userId: newUser.id,
          defaultAttendanceTarget: 75.0,
          themePreference: "system",
          inAppNotificationsEnabled: true,
          browserNotificationsEnabled: false,
        },
      });

      await tx.semester.create({
        data: {
          userId: newUser.id,
          name: "Semester 1",
          semesterNumber: 1,
          status: "ACTIVE",
        },
      });

      return newUser;
    });

    await createSessionCookie(user.id, user.email, user.role);

    return { success: true };
  } catch (error) {
    console.error("Registration error:", error);
    return {
      success: false,
      error: "An unexpected error occurred during registration. Please try again.",
    };
  }
}

export async function loginUser(input: LoginInput): Promise<ActionResult> {
  const validation = loginSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: "Please provide a valid email and password.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { email, password } = validation.data;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return {
        success: false,
        error: "Invalid email or password.",
      };
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return {
        success: false,
        error: "Invalid email or password.",
      };
    }

    await createSessionCookie(user.id, user.email, user.role);

    return { success: true };
  } catch (error) {
    console.error("Login error:", error);
    return {
      success: false,
      error: "An unexpected error occurred during login. Please try again.",
    };
  }
}

export async function logoutUser(): Promise<void> {
  await deleteSessionCookie();
  redirect("/login");
}
