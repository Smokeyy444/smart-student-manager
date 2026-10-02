import { getSession } from "./session";
import { prisma } from "../prisma";
import { redirect } from "next/navigation";

export class AuthError extends Error {
  constructor(message: string, public statusCode: number = 401) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Returns current authenticated user with profile and settings, or null.
 */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session?.userId) {
    return null;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        profile: true,
        settings: true,
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      profile: user.profile,
      settings: user.settings,
    };
  } catch (error) {
    console.error("Failed to fetch current user:", error);
    return null;
  }
}

/**
 * Server Component / Server Action guard that enforces an authenticated session.
 * If redirectUrl is provided and user is unauthenticated, redirects immediately.
 */
export async function requireAuth(redirectUrl?: string) {
  const user = await getCurrentUser();
  if (!user) {
    if (redirectUrl) {
      redirect(redirectUrl);
    }
    throw new AuthError("Unauthorized: Authentication required", 401);
  }
  return user;
}

/**
 * Multi-tenancy isolation guard:
 * Verifies that the requested resource belongs to the currently authenticated student.
 */
export function assertUserOwnsRecord(recordOwnerId: string, currentUserId: string): void {
  if (recordOwnerId !== currentUserId) {
    throw new AuthError("Forbidden: You are not authorized to access this resource", 403);
  }
}
