"use client";

import * as React from "react";
import Link from "next/link";
import { type DashboardData } from "@/lib/actions/dashboard";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card";
import { StatCard } from "../ui/stat-card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { formatHumanDate, formatHumanTime } from "@/lib/utils/events";
import { getLeadTimeLabel } from "@/lib/constants/events";
import {
  GraduationCap,
  ClipboardCheck,
  CalendarDays,
  Bell,
  ArrowRight,
  Plus,
  BookOpen,
  AlertTriangle,
  Clock,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";

interface DashboardViewProps {
  data: DashboardData;
  user: {
    email: string;
    profile?: {
      fullName: string;
      currentSemester: number;
      university?: string | null;
      course?: string | null;
      branch?: string | null;
    } | null;
  };
}

export function DashboardView({ data, user }: DashboardViewProps) {
  const { academic, attendance, events, reminders } = data;
  const fullName = user.profile?.fullName || "Student";
  const firstName = fullName.split(" ")[0];

  // Format attendance percentage
  const attendanceFormatted =
    attendance.overallPercentage !== null
      ? `${attendance.overallPercentage.toFixed(1)}%`
      : "—%";

  // Format CGPA
  const cgpaFormatted =
    academic.cgpa !== null ? academic.cgpa.toFixed(2) : "—";

  // Format SGPA
  const sgpaFormatted =
    academic.currentSemesterSgpa !== null
      ? academic.currentSemesterSgpa.toFixed(2)
      : "—";

  return (
    <div className="space-y-8">
      {/* ─── COMMAND CENTER HEADER ────────────────────────────────────────── */}
      <div className="relative rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] backdrop-blur-xl p-6 sm:p-8 overflow-hidden shadow-md">
        {/* Subtle Cyber Glow Mesh */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-[var(--brand-cyan)]/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-16 w-64 h-64 rounded-full bg-[var(--brand-magenta)]/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-[var(--brand-cyan)]/10 text-[var(--brand-cyan)] border border-[var(--brand-cyan)]/30">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-cyan)] animate-pulse" />
                Live Command Center
              </span>
              <span className="text-xs text-[var(--text-muted)] font-mono">
                Semester {academic.currentSemesterNumber}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
              Welcome back, <span className="cyber-gradient-text">{firstName}</span>
            </h1>

            <p className="text-xs sm:text-sm text-[var(--text-secondary)] max-w-2xl leading-relaxed">
              Academic overview, live attendance buffer, and deadline alerts for{" "}
              {academic.currentSemesterName || `Semester ${academic.currentSemesterNumber}`}.
              {user.profile?.course ? ` • ${user.profile.course}` : ""}
              {user.profile?.branch ? ` (${user.profile.branch})` : ""}
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Link href="/events">
              <Button size="sm" variant="outline" className="gap-1.5">
                <Plus className="h-3.5 w-3.5 text-[var(--brand-primary)]" />
                Add Event
              </Button>
            </Link>
            <Link href="/attendance">
              <Button size="sm" variant="secondary" className="gap-1.5">
                <ClipboardCheck className="h-3.5 w-3.5 text-[var(--brand-cyan)]" />
                Track Attendance
              </Button>
            </Link>
            <Link href="/grades">
              <Button size="sm" variant="primary" className="gap-1.5">
                <GraduationCap className="h-3.5 w-3.5" />
                Manage Grades
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* ─── PRIMARY KPI STRIP ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CGPA */}
        <StatCard
          title="Cumulative CGPA"
          value={cgpaFormatted}
          subtitle={
            academic.totalCredits > 0
              ? `${academic.totalEarnedCredits} / ${academic.totalCredits} Credits Earned`
              : "No completed semesters yet"
          }
          icon={<GraduationCap className="h-5 w-5" />}
          badge={
            <Badge variant="cyber-cyan">
              {academic.scaleName.split(" ")[0]} {academic.cgpaScaleMax}.0
            </Badge>
          }
          variant="default"
        />

        {/* Current SGPA */}
        <StatCard
          title={`Semester ${academic.currentSemesterNumber} SGPA`}
          value={sgpaFormatted}
          subtitle={
            academic.currentSemesterCredits > 0
              ? `${academic.currentSemesterCredits} credits enrolled`
              : "Enroll subjects to project SGPA"
          }
          icon={<BookOpen className="h-5 w-5" />}
          badge={
            academic.currentSemesterSgpa !== null ? (
              <Badge variant="success">Active</Badge>
            ) : (
              <Badge variant="secondary">In Progress</Badge>
            )
          }
          variant={academic.currentSemesterSgpa !== null ? "success" : "default"}
        />

        {/* Overall Attendance */}
        <StatCard
          title="Overall Attendance"
          value={attendanceFormatted}
          subtitle={
            attendance.trackedSubjectsCount > 0
              ? `${attendance.trackedSubjectsCount} tracked subjects • Target ${attendance.targetPercentage}%`
              : `Target threshold: ${attendance.targetPercentage}%`
          }
          icon={<ClipboardCheck className="h-5 w-5" />}
          badge={
            attendance.overallPercentage === null ? (
              <Badge variant="secondary">0 Subjects</Badge>
            ) : attendance.overallPercentage >= attendance.targetPercentage ? (
              <Badge variant="success">On Track</Badge>
            ) : (
              <Badge variant="danger">Below Target</Badge>
            )
          }
          variant={
            attendance.overallPercentage === null
              ? "default"
              : attendance.overallPercentage >= attendance.targetPercentage
              ? "success"
              : "danger"
          }
        />

        {/* Upcoming Deadlines / Alerts */}
        <StatCard
          title="Upcoming Deadlines"
          value={events.totalUpcomingCount}
          subtitle={
            events.todayCount > 0
              ? `${events.todayCount} scheduled today`
              : events.nextEvent
              ? `Next: ${events.nextEvent.title.slice(0, 18)}...`
              : "No upcoming events scheduled"
          }
          icon={<CalendarDays className="h-5 w-5" />}
          badge={
            reminders.dueCount > 0 ? (
              <Badge variant="danger">{reminders.dueCount} Due Alerts</Badge>
            ) : events.totalUpcomingCount > 0 ? (
              <Badge variant="cyber-cyan">Scheduled</Badge>
            ) : (
              <Badge variant="success">All Clear</Badge>
            )
          }
          variant={reminders.dueCount > 0 ? "danger" : "default"}
        />
      </div>

      {/* ─── DUE REMINDERS ALERT BANNER (If Active) ───────────────────────── */}
      {reminders.dueCount > 0 && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 backdrop-blur-md p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[0_0_20px_rgba(244,63,94,0.15)]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/20 text-rose-400">
              <Bell className="h-4 w-4 animate-bounce" />
            </div>
            <div>
              <p className="text-xs font-bold text-rose-300">
                You have {reminders.dueCount} due reminder{reminders.dueCount > 1 ? "s" : ""} requiring attention
              </p>
              <p className="text-[11px] text-rose-400/80">
                Acknowledge or dismiss upcoming deadlines directly from the Reminder Center.
              </p>
            </div>
          </div>
          <Link href="/reminders">
            <Button size="sm" variant="danger" className="shrink-0 text-xs">
              Open Reminder Center
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      )}

      {/* ─── MAIN COCKPIT GRID ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT / LARGE: ACADEMIC PERFORMANCE PANEL (7 COLS) */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-[var(--brand-primary)]" />
                  Academic Trajectory
                </CardTitle>
                <CardDescription>
                  Semester-by-semester SGPA progression & credit accumulation
                </CardDescription>
              </div>
              <Link href="/grades">
                <Button size="sm" variant="ghost" className="text-xs gap-1">
                  What-If Simulator
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardHeader>

            <CardContent className="pt-5 flex-1 flex flex-col justify-between">
              {academic.semestersTrend.length === 0 ? (
                <EmptyState
                  icon={<GraduationCap className="h-6 w-6 text-[var(--brand-primary)]" />}
                  title="No Academic Semesters Found"
                  description="Add your first semester and courses to start tracking credit hours, grade points, and projected CGPA."
                  action={
                    <Link href="/grades">
                      <Button variant="primary" size="sm">
                        <Plus className="h-4 w-4 mr-1.5" />
                        Create Semester 1
                      </Button>
                    </Link>
                  }
                />
              ) : (
                <div className="space-y-4">
                  {/* Semester Progression Bars */}
                  <div className="space-y-3">
                    {academic.semestersTrend.map((sem) => {
                      const isCurrent = sem.semesterNumber === academic.currentSemesterNumber;
                      const sgpa = sem.sgpa;
                      const percentage =
                        sgpa !== null ? (sgpa / academic.cgpaScaleMax) * 100 : 0;

                      return (
                        <div
                          key={sem.id}
                          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/60 p-3.5 transition-all hover:border-[var(--border-luminous)]/40"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-[var(--text-primary)]">
                                {sem.name || `Semester ${sem.semesterNumber}`}
                              </span>
                              {isCurrent && (
                                <Badge variant="cyber-cyan" className="text-[10px]">
                                  Current
                                </Badge>
                              )}
                              {sem.isCompleted && (
                                <Badge variant="success" className="text-[10px]">
                                  Completed
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-xs text-[var(--text-muted)] font-mono">
                                SGPA:
                              </span>
                              <span className="text-sm font-extrabold font-mono text-[var(--text-primary)]">
                                {sgpa !== null ? sgpa.toFixed(2) : "—"}
                              </span>
                              <span className="text-[10px] text-[var(--text-muted)] font-mono">
                                / {academic.cgpaScaleMax}.0
                              </span>
                            </div>
                          </div>

                          {/* Visual Progress Bar */}
                          <div className="w-full bg-[var(--border-subtle)] h-2 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-cyan)]"
                              style={{ width: `${Math.min(100, percentage)}%` }}
                            />
                          </div>

                          <div className="flex items-center justify-between mt-2 text-[10px] text-[var(--text-muted)] font-mono">
                            <span>{sem.credits} credits</span>
                            <span>{percentage > 0 ? `${percentage.toFixed(0)}% performance` : "In progress"}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Summary Footer */}
                  <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <span className="font-mono text-[11px]">
                      Grading Scale: <strong className="text-[var(--text-primary)]">{academic.scaleName}</strong>
                    </span>
                    <Link
                      href="/grades"
                      className="text-xs font-semibold text-[var(--brand-primary)] hover:underline inline-flex items-center gap-1"
                    >
                      View Full Grade Sheet
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: ATTENDANCE RADAR & BUNK STATUS (5 COLS) */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-[var(--brand-cyan)]" />
                  Attendance Radar
                </CardTitle>
                <CardDescription>
                  Buffer limits & recovery classes for Semester {academic.currentSemesterNumber}
                </CardDescription>
              </div>
              <Link href="/attendance">
                <Button size="sm" variant="ghost" className="text-xs gap-1">
                  Log
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardHeader>

            <CardContent className="pt-5 flex-1 flex flex-col justify-between">
              {attendance.trackedSubjectsCount === 0 ? (
                <EmptyState
                  icon={<ClipboardCheck className="h-6 w-6 text-[var(--brand-cyan)]" />}
                  title="No Subjects Enrolled"
                  description={`Add subjects to Semester ${academic.currentSemesterNumber} to unlock live attendance tracking, bunk buffer calculations, and recovery alerts.`}
                  action={
                    <Link href="/attendance">
                      <Button variant="primary" size="sm">
                        <Plus className="h-4 w-4 mr-1.5" />
                        Enroll Subjects
                      </Button>
                    </Link>
                  }
                />
              ) : (
                <div className="space-y-4">
                  {/* Gauge Status Block */}
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/60 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider font-mono">
                        Semester Aggregate
                      </span>
                      <span className="text-xs font-mono font-semibold text-[var(--text-muted)]">
                        Target: {attendance.targetPercentage}%
                      </span>
                    </div>

                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-3xl font-extrabold font-mono text-[var(--text-primary)]">
                        {attendanceFormatted}
                      </span>
                      {attendance.overallPercentage !== null && (
                        <span
                          className={`text-xs font-semibold ${
                            attendance.overallPercentage >= attendance.targetPercentage
                              ? "text-emerald-400"
                              : "text-rose-400"
                          }`}
                        >
                          {attendance.overallPercentage >= attendance.targetPercentage
                            ? "✓ Target Met"
                            : `⚠ ${(attendance.targetPercentage - attendance.overallPercentage).toFixed(1)}% deficit`}
                        </span>
                      )}
                    </div>

                    {/* Progress indicator */}
                    <div className="w-full bg-[var(--border-subtle)] h-2.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          attendance.overallPercentage === null
                            ? "bg-slate-500"
                            : attendance.overallPercentage >= attendance.targetPercentage
                            ? "bg-[var(--accent-success)] shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                            : "bg-[var(--accent-danger)] shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                        }`}
                        style={{
                          width: `${Math.min(100, attendance.overallPercentage ?? 0)}%`,
                        }}
                      />
                    </div>

                    {/* Quick Buffer Highlights */}
                    <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)] text-[11px] font-mono">
                      <div>
                        <span className="text-[var(--text-muted)]">Total Bunk Buffer:</span>
                        <p className="font-bold text-[var(--accent-success)]">
                          +{attendance.totalBunkBuffer} classes safe
                        </p>
                      </div>
                      <div>
                        <span className="text-[var(--text-muted)]">Recovery Needed:</span>
                        <p className="font-bold text-rose-400">
                          {attendance.totalRecoveryNeeded > 0
                            ? `${attendance.totalRecoveryNeeded} classes`
                            : "0 classes (Clear)"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Lowest Subject Alert / Priority List */}
                  {attendance.subjectsNeedingAttention.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-400">
                        <AlertTriangle className="h-4 w-4" />
                        <span>Subjects Requiring Attendance Catch-Up:</span>
                      </div>
                      {attendance.subjectsNeedingAttention.slice(0, 2).map((sub) => (
                        <div
                          key={sub.id}
                          className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 flex items-center justify-between text-xs"
                        >
                          <div>
                            <p className="font-bold text-[var(--text-primary)]">
                              {sub.name}
                            </p>
                            <p className="text-[10px] text-[var(--text-muted)] font-mono">
                              Attended {sub.attended}/{sub.conducted} classes ({sub.percentage}%)
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-bold font-mono text-rose-400 bg-rose-950/40 px-2 py-0.5 rounded border border-rose-500/30">
                              Attend +{sub.recoveryClasses}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : attendance.lowestSubject ? (
                    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/40 p-3 text-xs flex items-center justify-between">
                      <div>
                        <span className="text-[10px] uppercase font-mono text-[var(--text-muted)]">
                          Lowest Subject Tracked
                        </span>
                        <p className="font-bold text-[var(--text-primary)]">
                          {attendance.lowestSubject.name}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-sm text-[var(--text-primary)]">
                          {attendance.lowestSubject.percentage}%
                        </span>
                        <p className="text-[10px] text-emerald-400">Above target</p>
                      </div>
                    </div>
                  ) : null}

                  {/* Action Link */}
                  <div className="pt-2 flex justify-end">
                    <Link
                      href="/attendance"
                      className="text-xs font-semibold text-[var(--brand-primary)] hover:underline inline-flex items-center gap-1"
                    >
                      Open Full Attendance Manager
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ─── BOTTOM SECTION: DEADLINES, EVENTS & REMINDERS ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* UPCOMING DEADLINES & EXAMS TIMELINE (7 COLS) */}
        <div className="lg:col-span-7">
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-[var(--brand-primary)]" />
                  Upcoming Exams & Deadlines
                </CardTitle>
                <CardDescription>
                  Scheduled exams, tests, project deliveries & assignments
                </CardDescription>
              </div>
              <Link href="/events">
                <Button size="sm" variant="outline" className="text-xs gap-1">
                  Full Calendar
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardHeader>

            <CardContent className="pt-5">
              {events.nearestExamsAndDeadlines.length === 0 ? (
                <EmptyState
                  icon={<CalendarDays className="h-6 w-6 text-[var(--brand-primary)]" />}
                  title="No Deadlines on the Horizon"
                  description="You are completely clear. When you schedule mid-terms, quizzes, and project submission deadlines, they will appear here."
                  action={
                    <Link href="/events">
                      <Button variant="primary" size="sm">
                        <Plus className="h-4 w-4 mr-1.5" />
                        Schedule Event
                      </Button>
                    </Link>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {events.nearestExamsAndDeadlines.map((ev) => {
                    const dateObj = new Date(ev.startTime);
                    const formattedDate = formatHumanDate(dateObj);
                    const formattedTime = ev.isAllDay ? "All Day" : formatHumanTime(dateObj);

                    return (
                      <div
                        key={ev.id}
                        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/60 p-3.5 flex items-center justify-between transition-all hover:border-[var(--border-luminous)]/40 hover:bg-[var(--bg-surface-elevated)]"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs sm:text-sm text-[var(--text-primary)]">
                              {ev.title}
                            </span>
                            <Badge
                              variant={
                                ev.type === "EXAM" || ev.type === "TEST"
                                  ? "danger"
                                  : "cyber-cyan"
                              }
                              className="text-[10px]"
                            >
                              {ev.type}
                            </Badge>
                            {ev.priority === "HIGH" && (
                              <span className="text-[10px] text-rose-400 font-mono font-bold">
                                🚩 High
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)] font-mono">
                            <span className="flex items-center gap-1">
                              <CalendarDays className="h-3 w-3" />
                              {formattedDate}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formattedTime}
                            </span>
                            {ev.subjectName && (
                              <span className="text-[var(--brand-primary)] truncate max-w-[150px]">
                                • {ev.subjectName}
                              </span>
                            )}
                          </div>
                        </div>

                        <Link href="/events">
                          <Button size="icon" variant="ghost" className="h-8 w-8">
                            <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
                          </Button>
                        </Link>
                      </div>
                    );
                  })}

                  <div className="pt-2 flex justify-between items-center text-xs text-[var(--text-muted)]">
                    <span>
                      Total upcoming items:{" "}
                      <strong className="text-[var(--text-primary)] font-mono">
                        {events.totalUpcomingCount}
                      </strong>
                    </span>
                    <Link
                      href="/events"
                      className="text-xs font-semibold text-[var(--brand-primary)] hover:underline inline-flex items-center gap-1"
                    >
                      View All Events
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* REMINDERS & TECHNICAL DISPATCH STATUS (5 COLS) */}
        <div className="lg:col-span-5">
          <Card className="h-full flex flex-col justify-between">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-[var(--brand-magenta)]" />
                  Alert Center Status
                </CardTitle>
                <CardDescription>
                  Notification dispatch & lead-time triggers
                </CardDescription>
              </div>
              <Link href="/reminders">
                <Button size="sm" variant="ghost" className="text-xs gap-1">
                  Manage
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardHeader>

            <CardContent className="pt-5 space-y-4 flex-1 flex flex-col justify-between">
              <div className="space-y-3">
                {/* Next Reminder Highlight */}
                {reminders.nextReminder ? (
                  <div className="rounded-xl border border-[var(--border-luminous)]/40 bg-[var(--bg-surface-elevated)]/80 p-4 space-y-2 shadow-xs">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-[10px] uppercase font-bold text-[var(--brand-cyan)] flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Next Scheduled Alert
                      </span>
                      <span className="text-[10px] font-mono text-[var(--text-muted)]">
                        {getLeadTimeLabel(reminders.nextReminder.leadTimeMinutes)}
                      </span>
                    </div>

                    <p className="font-bold text-sm text-[var(--text-primary)]">
                      {reminders.nextReminder.eventTitle}
                    </p>

                    <div className="text-[11px] text-[var(--text-secondary)] font-mono">
                      Fires: {formatHumanDate(new Date(reminders.nextReminder.triggerAt))} at{" "}
                      {formatHumanTime(new Date(reminders.nextReminder.triggerAt))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/30 p-4 text-center text-xs text-[var(--text-muted)] space-y-1">
                    <ShieldCheck className="h-6 w-6 text-emerald-400 mx-auto opacity-80" />
                    <p className="font-semibold text-[var(--text-primary)]">No Pending Alerts</p>
                    <p className="text-[11px]">All reminders are completed or clear.</p>
                  </div>
                )}

                {/* Technical Status Strip */}
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/50 p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-muted)] font-mono text-[11px]">
                      In-App Bell Alerts:
                    </span>
                    <span className="font-mono text-emerald-400 font-bold">
                      Active (Real-time)
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-muted)] font-mono text-[11px]">
                      Desktop Notifications:
                    </span>
                    <span className="font-mono text-[var(--brand-cyan)] font-bold">
                      Supported in Tab
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-muted)] font-mono text-[11px]">
                      Due Count:
                    </span>
                    <span className="font-mono font-bold text-[var(--text-primary)]">
                      {reminders.dueCount} active
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <Link href="/reminders" className="w-full block pt-2">
                <Button variant="secondary" className="w-full text-xs">
                  Open Dedicated Reminder Center
                  <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
