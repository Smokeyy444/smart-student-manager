import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { getDashboardData } from "@/lib/actions/dashboard";
import { createSessionCookie } from "@/lib/auth/session";

describe("Dashboard Command Center Integration", () => {
  let testUserId: string;

  beforeEach(async () => {
    // Clean up test data
    await prisma.reminder.deleteMany();
    await prisma.event.deleteMany();
    await prisma.attendanceLog.deleteMany();
    await prisma.attendanceRecord.deleteMany();
    await prisma.subjectGrade.deleteMany();
    await prisma.subject.deleteMany();
    await prisma.semester.deleteMany();
    await prisma.userSetting.deleteMany();
    await prisma.studentProfile.deleteMany();
    await prisma.user.deleteMany();

    // Create a primary student user
    const user = await prisma.user.create({
      data: {
        email: "dashboard.student@test.com",
        passwordHash: "dummy-hash",
        role: "STUDENT",
        profile: {
          create: {
            fullName: "Dashboard Explorer",
            currentSemester: 3,
            university: "Cyber University",
            course: "B.Tech Computer Science",
          },
        },
        settings: {
          create: {
            defaultAttendanceTarget: 75.0,
          },
        },
      },
      include: {
        profile: true,
        settings: true,
      },
    });

    testUserId = user.id;

    // Set authenticated session cookie
    await createSessionCookie(user.id, user.email);
  });

  it("should return clean default metrics for a new student with no records", async () => {
    const data = await getDashboardData();
    expect(data).not.toBeNull();
    if (!data) return;

    // Academic defaults
    expect(data.academic.cgpa).toBeNull();
    expect(data.academic.currentSemesterSgpa).toBeNull();
    expect(data.academic.currentSemesterNumber).toBe(3);
    expect(data.academic.totalCredits).toBe(0);

    // Attendance defaults
    expect(data.attendance.overallPercentage).toBeNull();
    expect(data.attendance.trackedSubjectsCount).toBe(0);
    expect(data.attendance.belowTargetCount).toBe(0);
    expect(data.attendance.totalBunkBuffer).toBe(0);

    // Events & Reminders defaults
    expect(data.events.totalUpcomingCount).toBe(0);
    expect(data.events.todayCount).toBe(0);
    expect(data.events.nextEvent).toBeNull();
    expect(data.reminders.dueCount).toBe(0);
  });

  it("should aggregate live semester SGPA, CGPA, and credit metrics", async () => {
    // Create Semester 1 (completed, 4 credits, grade 10.0)
    await prisma.semester.create({
      data: {
        userId: testUserId,
        name: "Semester 1",
        semesterNumber: 1,
        status: "COMPLETED",
        subjects: {
          create: {
            name: "Mathematics I",
            code: "MTH101",
            creditHours: 4,
            grade: {
              create: {
                gradePoint: 10,
                gradeLetter: "A+",
              },
            },
          },
        },
      },
    });

    // Create Semester 3 (current, 4 credits, grade 8.0)
    await prisma.semester.create({
      data: {
        userId: testUserId,
        name: "Semester 3",
        semesterNumber: 3,
        status: "ACTIVE",
        subjects: {
          create: {
            name: "Database Systems",
            code: "CS301",
            creditHours: 4,
            grade: {
              create: {
                gradePoint: 8,
                gradeLetter: "B+",
              },
            },
            attendance: {
              create: {
                classesAttended: 18,
                classesConducted: 20, // 90% attendance
              },
            },
          },
        },
      },
    });

    const data = await getDashboardData();
    expect(data).not.toBeNull();
    if (!data) return;

    // Academic check
    expect(data.academic.currentSemesterNumber).toBe(3);
    expect(data.academic.currentSemesterSgpa).toBe(8.0);
    // CGPA weighted average: (4*10 + 4*8) / 8 = 9.0
    expect(data.academic.cgpa).toBe(9.0);
    expect(data.academic.semestersTrend.length).toBe(2);

    // Attendance check
    expect(data.attendance.overallPercentage).toBe(90.0);
    expect(data.attendance.trackedSubjectsCount).toBe(1);
    expect(data.attendance.belowTargetCount).toBe(0);
    expect(data.attendance.totalBunkBuffer).toBe(4); // floor((1800 - 1500) / 75) = 4 classes
  });

  it("should identify subjects below attendance threshold and compute catch-up recovery classes", async () => {
    // Current Semester 3 with low attendance subject (10 / 20 = 50%, target = 75%)
    await prisma.semester.create({
      data: {
        userId: testUserId,
        name: "Semester 3",
        semesterNumber: 3,
        status: "ACTIVE",
        subjects: {
          create: {
            name: "Computer Networks",
            code: "CS302",
            creditHours: 4,
            attendance: {
              create: {
                classesAttended: 10,
                classesConducted: 20, // 50% vs 75% target
              },
            },
          },
        },
      },
    });

    const data = await getDashboardData();
    expect(data).not.toBeNull();
    if (!data) return;

    expect(data.attendance.overallPercentage).toBe(50.0);
    expect(data.attendance.belowTargetCount).toBe(1);
    expect(data.attendance.subjectsNeedingAttention.length).toBe(1);
    expect(data.attendance.subjectsNeedingAttention[0].name).toBe("Computer Networks");
    expect(data.attendance.subjectsNeedingAttention[0].status).toBe("CRITICAL");
    // Recovery classes needed: ceil((75*20 - 100*10) / 25) = ceil(500 / 25) = 20
    expect(data.attendance.subjectsNeedingAttention[0].recoveryClasses).toBe(20);
    expect(data.attendance.totalRecoveryNeeded).toBe(20);
  });

  it("should aggregate upcoming events, exams, and due reminders", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 3);
    futureDate.setHours(10, 0, 0, 0);

    // Create an exam event with a due reminder
    await prisma.event.create({
      data: {
        userId: testUserId,
        title: "DBMS Midterm Examination",
        eventType: "EXAM",
        priority: "HIGH",
        startTime: futureDate,
        reminders: {
          create: {
            triggerAt: new Date(Date.now() - 60000), // Due 1 minute ago
            leadTimeMinutes: 60,
            status: "DUE",
          },
        },
      },
    });

    const data = await getDashboardData();
    expect(data).not.toBeNull();
    if (!data) return;

    expect(data.events.totalUpcomingCount).toBe(1);
    expect(data.events.upcomingExamsCount).toBe(1);
    expect(data.events.nextEvent?.title).toBe("DBMS Midterm Examination");
    expect(data.events.nextEvent?.type).toBe("EXAM");
    expect(data.events.nextEvent?.priority).toBe("HIGH");

    // Reminder due check
    expect(data.reminders.dueCount).toBe(1);
  });
});
