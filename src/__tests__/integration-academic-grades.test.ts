import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createSemester,
  updateSemester,
  deleteSemester,
  createSubject,
  updateSubject,
  deleteSubject,
  saveSubjectGrade,
  deleteSubjectGrade,
  getStudentAcademicData,
} from "@/lib/actions/academic";
import { hashPassword } from "@/lib/auth/password";
import { createSessionCookie } from "@/lib/auth/session";

describe("Academic Grades & Results Server Integration", () => {
  const studentAEmail = "academic.alice@university.edu";
  const studentBEmail = "academic.bob@university.edu";
  const password = "Password123!";

  let studentAId = "";
  let studentBId = "";

  beforeAll(async () => {
    // Clean up any existing test records
    await prisma.user.deleteMany({
      where: { email: { in: [studentAEmail, studentBEmail] } },
    });

    // Create Student A
    const userA = await prisma.user.create({
      data: {
        email: studentAEmail,
        passwordHash: await hashPassword(password),
        role: "STUDENT",
        profile: {
          create: {
            fullName: "Alice Academic",
            currentSemester: 1,
          },
        },
        settings: {
          create: {
            defaultAttendanceTarget: 75.0,
            defaultGradingScaleId: "standard-10-point",
          },
        },
      },
    });
    studentAId = userA.id;

    // Create Student B
    const userB = await prisma.user.create({
      data: {
        email: studentBEmail,
        passwordHash: await hashPassword(password),
        role: "STUDENT",
        profile: {
          create: {
            fullName: "Bob Intruder",
            currentSemester: 1,
          },
        },
        settings: {
          create: {
            defaultAttendanceTarget: 75.0,
            defaultGradingScaleId: "standard-10-point",
          },
        },
      },
    });
    studentBId = userB.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [studentAEmail, studentBEmail] } },
    });
  });

  let semester1Id = "";
  let subject1Id = "";
  let subject2Id = "";

  it("should allow creating a semester and reject duplicate semester numbers", async () => {
    // Act as Student A
    await createSessionCookie(studentAId, studentAEmail);

    const semRes = await createSemester({
      name: "Semester 1",
      semesterNumber: 1,
      status: "ACTIVE",
    });

    expect(semRes.success).toBe(true);
    semester1Id = (semRes.data as { id: string }).id;

    // Attempt to create duplicate semester 1 for same student
    const dupRes = await createSemester({
      name: "Semester 1 Duplicate",
      semesterNumber: 1,
      status: "ACTIVE",
    });

    expect(dupRes.success).toBe(false);
    expect(dupRes.error).toContain("already exists");
  });

  it("should create credit-bearing and audit subjects and auto-instantiate AttendanceRecord", async () => {
    await createSessionCookie(studentAId, studentAEmail);

    // 1. Credit-bearing subject: Algorithms (4.0 credits)
    const sub1Res = await createSubject({
      semesterId: semester1Id,
      name: "Algorithms & Data Structures",
      code: "CS201",
      creditHours: 4.0,
      category: "CORE",
      isAudit: false,
    });

    expect(sub1Res.success).toBe(true);
    subject1Id = (sub1Res.data as { id: string }).id;

    // Verify AttendanceRecord was created with 0/0
    const attRec = await prisma.attendanceRecord.findUnique({
      where: { subjectId: subject1Id },
    });
    expect(attRec).not.toBeNull();
    expect(attRec?.classesConducted).toBe(0);
    expect(attRec?.classesAttended).toBe(0);

    // 2. Audit subject: Physical Education (0.0 credits)
    const sub2Res = await createSubject({
      semesterId: semester1Id,
      name: "Physical Education",
      code: "PE101",
      creditHours: 0.0,
      category: "AUDIT",
      isAudit: true,
    });

    expect(sub2Res.success).toBe(true);
    subject2Id = (sub2Res.data as { id: string }).id;

    // 3. Reject negative credit hours
    const badSubRes = await createSubject({
      semesterId: semester1Id,
      name: "Invalid Subject",
      creditHours: -2.0,
      category: "CORE",
      isAudit: false,
    });
    expect(badSubRes.success).toBe(false);
  });

  it("should record grades in Mode A (Direct Grade) and resolve grade points", async () => {
    await createSessionCookie(studentAId, studentAEmail);

    const gradeRes = await saveSubjectGrade({
      subjectId: subject1Id,
      mode: "GRADE",
      gradeLetter: "A+",
      maxMarks: 100,
    });

    expect(gradeRes.success).toBe(true);

    const saved = await prisma.subjectGrade.findUnique({
      where: { subjectId: subject1Id },
    });
    expect(saved).not.toBeNull();
    expect(saved?.gradeLetter).toBe("A+");
    expect(saved?.gradePoint).toBe(9.0);
    expect(saved?.isPassing).toBe(true);
  });

  it("should record grades in Mode B (Marks) and map to grade letter and points", async () => {
    await createSessionCookie(studentAId, studentAEmail);

    // 95 out of 100 -> O (10.0 points)
    const gradeRes = await saveSubjectGrade({
      subjectId: subject1Id,
      mode: "MARKS",
      marksObtained: 95,
      maxMarks: 100,
    });

    expect(gradeRes.success).toBe(true);

    const saved = await prisma.subjectGrade.findUnique({
      where: { subjectId: subject1Id },
    });
    expect(saved?.gradeLetter).toBe("O");
    expect(saved?.gradePoint).toBe(10.0);
    expect(saved?.marksObtained).toBe(95);
  });

  it("should validate Mode C (Both) and reject contradictory marks vs grade entries", async () => {
    await createSessionCookie(studentAId, studentAEmail);

    // Contradictory: 35 marks out of 100 (which is F), but student enters "O"
    const conflictRes = await saveSubjectGrade({
      subjectId: subject1Id,
      mode: "BOTH",
      marksObtained: 35,
      maxMarks: 100,
      gradeLetter: "O",
    });

    expect(conflictRes.success).toBe(false);
    expect(conflictRes.error).toContain("contradicts entered grade 'O'");

    // Consistent: 85 marks out of 100 with "A+"
    const validBoth = await saveSubjectGrade({
      subjectId: subject1Id,
      mode: "BOTH",
      marksObtained: 85,
      maxMarks: 100,
      gradeLetter: "A+",
    });

    expect(validBoth.success).toBe(true);
    const saved = await prisma.subjectGrade.findUnique({
      where: { subjectId: subject1Id },
    });
    expect(saved?.gradeLetter).toBe("A+");
    expect(saved?.gradePoint).toBe(9.0);
  });

  it("should compute accurate SGPA excluding audit courses", async () => {
    await createSessionCookie(studentAId, studentAEmail);

    // Subject 1: Algorithms (4 credits, grade A+ = 9.0) -> 36.0 QP
    // Subject 2: Physical Education (0 credits, Audit) -> excluded
    const data = await getStudentAcademicData();
    expect(data).not.toBeNull();

    const sem1 = data?.semesters.find((s) => s.id === semester1Id);
    expect(sem1).toBeDefined();
    expect(sem1?.metrics.sgpa).toBe(9.0);
    expect(sem1?.metrics.totalCreditBearingCredits).toBe(4.0);
    expect(sem1?.metrics.totalQualityPoints).toBe(36.0);
    expect(sem1?.metrics.auditSubjectCount).toBe(1);
  });

  it("should calculate credit-weighted CGPA across multiple completed semesters", async () => {
    await createSessionCookie(studentAId, studentAEmail);

    // Create Semester 2
    const sem2Res = await createSemester({
      name: "Semester 2",
      semesterNumber: 2,
      status: "COMPLETED",
    });
    expect(sem2Res.success).toBe(true);
    const semester2Id = (sem2Res.data as { id: string }).id;

    // Add subject in Semester 2: Database Systems (6.0 credits, grade B = 6.0) -> 36.0 QP
    const sub3Res = await createSubject({
      semesterId: semester2Id,
      name: "Database Systems",
      creditHours: 6.0,
      category: "CORE",
    });
    const sub3Id = (sub3Res.data as { id: string }).id;

    await saveSubjectGrade({
      subjectId: sub3Id,
      mode: "GRADE",
      gradeLetter: "B", // 6.0 points
    });

    // Mark Semester 1 as COMPLETED too
    await updateSemester(semester1Id, {
      name: "Semester 1",
      semesterNumber: 1,
      status: "COMPLETED",
    });

    // Semester 1: 4.0 credits, 36.0 QP (SGPA = 9.00)
    // Semester 2: 6.0 credits, 36.0 QP (SGPA = 6.00)
    // Total Credits = 10.0, Total QP = 72.0 -> CGPA = 7.20
    // (Note: simple average (9 + 6)/2 = 7.50 is mathematically wrong; 7.20 is credit-weighted!)
    const data = await getStudentAcademicData();
    expect(data?.cgpaResult.cgpa).toBe(7.2);
    expect(data?.cgpaResult.totalCredits).toBe(10.0);
    expect(data?.cgpaResult.totalQualityPoints).toBe(72.0);
  });

  it("should enforce tenant boundary and prevent another student from modifying or deleting records", async () => {
    // Switch to Student B
    await createSessionCookie(studentBId, studentBEmail);

    // Student B attempts to update Student A's semester
    const hackSem = await updateSemester(semester1Id, {
      name: "Hacked Semester",
      semesterNumber: 1,
      status: "ACTIVE",
    });
    expect(hackSem.success).toBe(false);

    // Student B attempts to delete Student A's subject
    const hackSub = await deleteSubject(subject1Id);
    expect(hackSub.success).toBe(false);

    // Student B attempts to save a grade on Student A's subject
    const hackGrade = await saveSubjectGrade({
      subjectId: subject1Id,
      mode: "GRADE",
      gradeLetter: "O",
    });
    expect(hackGrade.success).toBe(false);
  });

  it("should support updating subjects and removing grades independently", async () => {
    await createSessionCookie(studentAId, studentAEmail);

    // Update subject 2 details
    const updateRes = await updateSubject(subject2Id, {
      name: "Physical Education & Wellness",
      code: "PE102",
      creditHours: 1.0,
      category: "ELECTIVE",
      isAudit: false,
    });
    expect(updateRes.success).toBe(true);

    const updatedSub = await prisma.subject.findUnique({ where: { id: subject2Id } });
    expect(updatedSub?.name).toBe("Physical Education & Wellness");
    expect(updatedSub?.creditHours).toBe(1.0);

    // Delete subject grade for subject 1
    const delGradeRes = await deleteSubjectGrade(subject1Id);
    expect(delGradeRes.success).toBe(true);

    const checkGrade = await prisma.subjectGrade.findUnique({ where: { subjectId: subject1Id } });
    expect(checkGrade).toBeNull();
  });

  it("should cascade delete subject and its grade and attendance records, and delete semester", async () => {
    await createSessionCookie(studentAId, studentAEmail);

    const delRes = await deleteSubject(subject1Id);
    expect(delRes.success).toBe(true);

    const checkSubject = await prisma.subject.findUnique({ where: { id: subject1Id } });
    const checkGrade = await prisma.subjectGrade.findUnique({ where: { subjectId: subject1Id } });
    const checkAttendance = await prisma.attendanceRecord.findUnique({ where: { subjectId: subject1Id } });

    expect(checkSubject).toBeNull();
    expect(checkGrade).toBeNull();
    expect(checkAttendance).toBeNull();

    // Delete semester 1
    const delSemRes = await deleteSemester(semester1Id);
    expect(delSemRes.success).toBe(true);

    const checkSem = await prisma.semester.findUnique({ where: { id: semester1Id } });
    expect(checkSem).toBeNull();
  });
});
