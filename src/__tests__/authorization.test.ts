import { describe, it, expect } from "vitest";
import { assertUserOwnsRecord, AuthError } from "@/lib/auth/guards";

describe("Multi-Tenancy & Authorization Guard", () => {
  it("should permit access when authenticated user ID matches the record owner ID", () => {
    const studentId = "student_usr_abc_123";
    expect(() => assertUserOwnsRecord(studentId, studentId)).not.toThrow();
  });

  it("should throw a 403 Forbidden AuthError when a student attempts to access another student's record", () => {
    const studentA = "student_usr_alice";
    const studentB = "student_usr_bob";

    expect(() => assertUserOwnsRecord(studentA, studentB)).toThrow(AuthError);

    try {
      assertUserOwnsRecord(studentA, studentB);
    } catch (err) {
      const authErr = err as AuthError;
      expect(authErr.statusCode).toBe(403);
      expect(authErr.message).toContain("Forbidden");
    }
  });
});
