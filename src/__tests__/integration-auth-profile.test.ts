import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerUser, loginUser } from "@/lib/actions/auth";
import { assertUserOwnsRecord, AuthError } from "@/lib/auth/guards";

describe("End-to-End Integration: Auth, Profile, Multi-Tenancy & Settings", () => {
  const testEmail = "integration.student@university.edu";
  const testPassword = "Password123!";

  beforeAll(async () => {
    // Clean up any previous test artifacts
    await prisma.user.deleteMany({
      where: { email: { in: [testEmail, "intruder.student@university.edu"] } },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [testEmail, "intruder.student@university.edu"] } },
    });
  });

  it("should successfully register a student and create profile, settings, and semester 1 atomically", async () => {
    const regResult = await registerUser({
      fullName: "Integration Student",
      email: testEmail,
      password: testPassword,
      confirmPassword: testPassword,
    });

    expect(regResult.success).toBe(true);

    // Verify database record
    const user = await prisma.user.findUnique({
      where: { email: testEmail },
      include: {
        profile: true,
        settings: true,
        semesters: true,
      },
    });

    expect(user).not.toBeNull();
    expect(user?.email).toBe(testEmail);
    expect(user?.profile?.fullName).toBe("Integration Student");
    expect(user?.profile?.currentSemester).toBe(1);
    expect(user?.settings?.defaultAttendanceTarget).toBe(75.0);
    expect(user?.semesters.length).toBe(1);
    expect(user?.semesters[0].name).toBe("Semester 1");
    expect(user?.semesters[0].status).toBe("ACTIVE");
  });

  it("should prevent duplicate registration with the same email", async () => {
    const duplicateResult = await registerUser({
      fullName: "Duplicate Student",
      email: testEmail,
      password: testPassword,
      confirmPassword: testPassword,
    });

    expect(duplicateResult.success).toBe(false);
    expect(duplicateResult.error).toContain("already exists");
  });

  it("should validate credentials on login and reject wrong passwords", async () => {
    const failLogin = await loginUser({
      email: testEmail,
      password: "WrongPassword999!",
    });
    expect(failLogin.success).toBe(false);
    expect(failLogin.error).toContain("Invalid email or password");

    const validLogin = await loginUser({
      email: testEmail,
      password: testPassword,
    });
    expect(validLogin.success).toBe(true);
  });

  it("should enforce multi-tenancy isolation and reject cross-student access", async () => {
    const regIntruder = await registerUser({
      fullName: "Intruder Student",
      email: "intruder.student@university.edu",
      password: testPassword,
      confirmPassword: testPassword,
    });
    expect(regIntruder.success).toBe(true);

    const victimUser = await prisma.user.findUnique({ where: { email: testEmail } });
    const intruderUser = await prisma.user.findUnique({
      where: { email: "intruder.student@university.edu" },
    });

    expect(victimUser).not.toBeNull();
    expect(intruderUser).not.toBeNull();

    // Verifies tenant assertion throws 403 Forbidden
    expect(() => {
      assertUserOwnsRecord(victimUser!.id, intruderUser!.id);
    }).toThrow(AuthError);
  });
});
