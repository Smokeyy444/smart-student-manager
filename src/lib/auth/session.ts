import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET_KEY =
  process.env.AUTH_SECRET ||
  "smart-student-manager-development-secret-key-change-in-prod-123456";
const encodedKey = new TextEncoder().encode(SECRET_KEY);

export const SESSION_COOKIE_NAME = "smart_student_session";
export const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface SessionPayload {
  userId: string;
  email: string;
  role: string;
  expiresAt: number;
}

/**
 * Encrypt and sign a session JWT token.
 */
export async function encryptSession(payload: Omit<SessionPayload, "expiresAt">): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  return new SignJWT({ ...payload, expiresAt })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(encodedKey);
}

/**
 * Verify and decode session JWT token.
 */
export async function decryptSession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, encodedKey, {
      algorithms: ["HS256"],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

let mockSessionToken: string | null = null;

export function setTestSessionToken(token: string | null): void {
  mockSessionToken = token;
}

/**
 * Sets secure HTTP-only cookie with session token.
 */
export async function createSessionCookie(userId: string, email: string, role = "STUDENT"): Promise<string> {
  const token = await encryptSession({ userId, email, role });
  mockSessionToken = token;
  try {
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DURATION_SECONDS,
    });
  } catch {
    // Graceful fallback when executed outside Next.js request scope (e.g. unit/integration tests)
  }
  return token;
}

/**
 * Reads and validates the current session from incoming cookies.
 */
export async function getSession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (token) {
      return decryptSession(token);
    }
  } catch {
    // Fall back to in-memory test token if executed outside Next.js request scope
  }

  if (mockSessionToken) {
    return decryptSession(mockSessionToken);
  }

  return null;
}

/**
 * Clears the session cookie on logout.
 */
export async function deleteSessionCookie(): Promise<void> {
  mockSessionToken = null;
  try {
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  } catch {
    // Graceful fallback outside request scope
  }
}
