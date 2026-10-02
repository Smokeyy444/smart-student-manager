import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { encryptSession, decryptSession } from "@/lib/auth/session";

describe("Authentication Utilities", () => {
  describe("Password Hashing & Verification", () => {
    it("should hash a plaintext password with salt rounds and not store it plaintext", async () => {
      const plaintext = "StudentPass123!";
      const hash = await hashPassword(plaintext);

      expect(hash).toBeDefined();
      expect(hash).not.toEqual(plaintext);
      expect(hash.startsWith("$2")).toBe(true); // standard bcrypt prefix
    });

    it("should successfully verify a correct password against its hash", async () => {
      const plaintext = "CorrectAcademicPassword2025";
      const hash = await hashPassword(plaintext);

      const isValid = await verifyPassword(plaintext, hash);
      expect(isValid).toBe(true);
    });

    it("should reject an incorrect password", async () => {
      const plaintext = "CorrectPassword123";
      const hash = await hashPassword(plaintext);

      const isValid = await verifyPassword("WrongPassword456", hash);
      expect(isValid).toBe(false);
    });
  });

  describe("Session Encryption & Decryption", () => {
    it("should encrypt session data into a valid JWT and decrypt it correctly", async () => {
      const sessionData = {
        userId: "usr_student_123",
        email: "alex@university.edu",
        role: "STUDENT",
      };

      const token = await encryptSession(sessionData);
      expect(token).toBeDefined();
      expect(typeof token).toBe("string");

      const decrypted = await decryptSession(token);
      expect(decrypted).not.toBeNull();
      expect(decrypted?.userId).toBe(sessionData.userId);
      expect(decrypted?.email).toBe(sessionData.email);
      expect(decrypted?.role).toBe(sessionData.role);
      expect(decrypted?.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it("should return null for invalid, corrupted, or tampered tokens", async () => {
      const corruptToken = "invalid.token.structure";
      const result = await decryptSession(corruptToken);
      expect(result).toBeNull();

      const emptyResult = await decryptSession("");
      expect(emptyResult).toBeNull();

      const undefinedResult = await decryptSession(undefined);
      expect(undefinedResult).toBeNull();
    });
  });
});
