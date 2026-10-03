import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createSemester,
  bulkCreateSubjects,
  bulkSaveSubjectGrades,
  bulkUpdateAttendance,
  getStudentAcademicData,
} from "@/lib/actions/academic";
import { hashPassword } from "@/lib/auth/password";
import { createSessionCookie } from "@/lib/auth/session";

describe("Bulk Academic Data Entry Integration", () => {
  const aliceEmail = "bulk.alice@university.edu";
  const bobEmail = "bulk.bob@university.edu";
  const password = "Password123!";

  let aliceId = "";
  let bobId = "";
  let semesterId = "";
  let createdSubjectIds: string[] = [];

  beforeAll(async () => {
    // Cleanup prior tests
    await prisma.user.deleteMany({
      where: { email: { in: [aliceEmail, bobEmail] } },
    });

    // Create Alice
    const userA = await prisma.user.create({
      data: {
        email: aliceEmail,
        passwordHash: await hashPassword(password),
        role: "STUDENT",
        profile: {
          create: { fullName: "Alice Bulk", currentSemester: 1 },
        },
        settings: {
          create: {
            defaultAttendanceTarget: 75.0,
            defaultGradingScaleId: "standard-10-point",
          },
        },
      },
    });
    aliceId = userA.id;

    // Create Bob (unauthorized actor)
    const userB = await prisma.user.create({
      data: {
        email: bobEmail,
        passwordHash: await hashPassword(password),
        role: "STUDENT",
        profile: {
          create: { fullName: "Bob Intruder", currentSemester: 1 },
        },
        settings: {
          create: {
            defaultAttendanceTarget: 75.0,
            defaultGradingScaleId: "standard-10-point",
          },
        },
      },
    });
    bobId = userB.id;

    // Create Semester 1 for Alice
    await createSessionCookie(aliceId, aliceEmail);
    const semRes = await createSemester({
      name: "Semester 1",
      semesterNumber: 1,
      status: "ACTIVE",
    });
    expect(semRes.success).toBe(true);
    semesterId = (semRes.data as { id: string }).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [aliceEmail, bobEmail] } },
    });
  });

  it("should bulk create 7 subjects in a single transaction with automatic attendance records", async () => {
    await createSessionCookie(aliceId, aliceEmail);

    const bulkRes = await bulkCreateSubjects({
      semesterId,
      subjects: [
        { code: "CS101", name: "Data Structures", creditHours: 4.0, category: "CORE", isAudit: false },
        { code: "CS102", name: "Computer Networks", creditHours: 4.0, category: "CORE", isAudit: false },
        { code: "CS103", name: "Operating Systems", creditHours: 3.0, category: "CORE", isAudit: false },
        { code: "CS104", name: "Database Systems", creditHours: 3.0, category: "CORE", isAudit: false },
        { code: "CS105L", name: "Networks Lab", creditHours: 1.5, category: "LAB", isAudit: false },
        { code: "HS101", name: "Technical Writing", creditHours: 2.0, category: "ELECTIVE", isAudit: false },
        { code: "PE101", name: "Physical Education", creditHours: 0.0, category: "AUDIT", isAudit: true },
      ],
    });

    expect(bulkRes.success).toBe(true);
    const payload = bulkRes.data as { count: number; subjects: Array<{ id: string }> };
    expect(payload.count).toBe(7);
    expect(payload.subjects.length).toBe(7);
    createdSubjectIds = payload.subjects.map((s) => s.id);

    // Verify all 7 initial attendance records exist
    const attendanceRecords = await prisma.attendanceRecord.findMany({
      where: { subjectId: { in: createdSubjectIds } },
    });
    expect(attendanceRecords.length).toBe(7);
    attendanceRecords.forEach((rec) => {
      expect(rec.classesConducted).toBe(0);
      expect(rec.classesAttended).toBe(0);
    });
  });

  it("should reject bulk subject creation if there are duplicate course codes in the batch", async () => {
    await createSessionCookie(aliceId, aliceEmail);

    const dupRes = await bulkCreateSubjects({
      semesterId,
      subjects: [
        { code: "MATH201", name: "Calculus I", creditHours: 3.0, category: "CORE", isAudit: false },
        { code: "MATH201", name: "Advanced Calculus", creditHours: 3.0, category: "CORE", isAudit: false },
      ],
    });

    expect(dupRes.success).toBe(false);
    expect(dupRes.error).toContain("Duplicate course code 'MATH201'");
  });

  it("should reject bulk subject creation with negative credit hours", async () => {
    await createSessionCookie(aliceId, aliceEmail);

    const badCreditsRes = await bulkCreateSubjects({
      semesterId,
      subjects: [
        { code: "PHYS101", name: "Physics", creditHours: -3.0, category: "CORE", isAudit: false },
      ],
    });

    expect(badCreditsRes.success).toBe(false);
  });

  it("should prevent another student from bulk adding subjects to a semester they do not own", async () => {
    // Act as Bob
    await createSessionCookie(bobId, bobEmail);

    const hackRes = await bulkCreateSubjects({
      semesterId, // Alice's semester
      subjects: [
        { code: "HACK101", name: "Malicious Course", creditHours: 3.0, category: "CORE", isAudit: false },
      ],
    });

    expect(hackRes.success).toBe(false);
    expect(hackRes.error).toContain("Failed to bulk create subjects");
  });

  it("should bulk save subject grades across Grade, Marks, and Both modes and calculate SGPA", async () => {
    await createSessionCookie(aliceId, aliceEmail);

    // Enter results for all 7 subjects in one transaction
    const bulkGradesRes = await bulkSaveSubjectGrades({
      grades: [
        // Mode A: Direct Grade (A+ = 9.0)
        { subjectId: createdSubjectIds[0], mode: "GRADE", gradeLetter: "A+" },
        // Mode A: Direct Grade (O = 10.0)
        { subjectId: createdSubjectIds[1], mode: "GRADE", gradeLetter: "O" },
        // Mode B: Marks (82 / 100 maps to A+ / 9.0 in standard 10-point scale)
        { subjectId: createdSubjectIds[2], mode: "MARKS", marksObtained: 82, maxMarks: 100 },
        // Mode B: Marks (75 / 100 maps to A / 8.0)
        { subjectId: createdSubjectIds[3], mode: "MARKS", marksObtained: 75, maxMarks: 100 },
        // Mode C: Both consistent (95 marks + O)
        { subjectId: createdSubjectIds[4], mode: "BOTH", gradeLetter: "O", marksObtained: 95, maxMarks: 100 },
        // Mode A: Direct Grade (B+ = 7.0)
        { subjectId: createdSubjectIds[5], mode: "GRADE", gradeLetter: "B+" },
        // Mode A: Audit course (Satisfactory / Pass, 0 credits)
        { subjectId: createdSubjectIds[6], mode: "GRADE", gradeLetter: "A" },
      ],
    });

    expect(bulkGradesRes.success).toBe(true);
    const data = bulkGradesRes.data as { count: number };
    expect(data.count).toBe(7);

    const academicData = await getStudentAcademicData();
    expect(academicData).not.toBeNull();
    const sem1 = academicData!.semesters.find((s) => s.id === semesterId);
    expect(sem1).toBeDefined();

    // Credits: 4 + 4 + 3 + 3 + 1.5 + 2 = 17.5 credit-bearing credits
    expect(sem1?.metrics.totalCreditBearingCredits).toBe(17.5);
    // QP: 4*9 + 4*10 + 3*9 + 3*8 + 1.5*10 + 2*7 = 36 + 40 + 27 + 24 + 15 + 14 = 156.0
    expect(sem1?.metrics.totalQualityPoints).toBe(156.0);
    // SGPA = 156 / 17.5 = 8.914... -> 8.91
    expect(sem1?.metrics.sgpa).toBe(8.91);
  });

  it("should reject bulk grade saving when marks and grade contradict each other", async () => {
    await createSessionCookie(aliceId, aliceEmail);

    // Contradiction: 45 marks with Grade 'O'
    const conflictRes = await bulkSaveSubjectGrades({
      grades: [
        {
          subjectId: createdSubjectIds[0],
          mode: "BOTH",
          gradeLetter: "O",
          marksObtained: 45,
          maxMarks: 100,
        },
      ],
    });

    expect(conflictRes.success).toBe(false);
    expect(conflictRes.error).toContain("contradicts entered grade 'O'");
  });

  it("should bulk update attendance records and enforce classesAttended <= classesConducted", async () => {
    await createSessionCookie(aliceId, aliceEmail);

    // Valid bulk attendance update
    const validAttRes = await bulkUpdateAttendance({
      records: [
        { subjectId: createdSubjectIds[0], classesAttended: 18, classesConducted: 20 }, // 90%
        { subjectId: createdSubjectIds[1], classesAttended: 15, classesConducted: 20 }, // 75%
        { subjectId: createdSubjectIds[2], classesAttended: 12, classesConducted: 20 }, // 60%
      ],
    });

    expect(validAttRes.success).toBe(true);

    const updated = await prisma.attendanceRecord.findUnique({
      where: { subjectId: createdSubjectIds[0] },
    });
    expect(updated?.classesAttended).toBe(18);
    expect(updated?.classesConducted).toBe(20);

    // Invalid attendance: Attended > Conducted
    const invalidAttRes = await bulkUpdateAttendance({
      records: [
        { subjectId: createdSubjectIds[0], classesAttended: 25, classesConducted: 20 },
      ],
    });

    expect(invalidAttRes.success).toBe(false);
  });

  it("should prevent unauthorized students from bulk updating attendance", async () => {
    await createSessionCookie(bobId, bobEmail);

    const hackAtt = await bulkUpdateAttendance({
      records: [
        { subjectId: createdSubjectIds[0], classesAttended: 20, classesConducted: 20 },
      ],
    });

    expect(hackAtt.success).toBe(false);
    expect(hackAtt.error).toContain("Failed to bulk update attendance");
  });
});
