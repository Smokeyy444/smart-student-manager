import { requireAuth } from "@/lib/auth/guards";
import { AppLayout } from "@/components/layout/app-layout";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  GraduationCap,
  ClipboardCheck,
  CalendarDays,
  ArrowRight,
  Plus,
  BookOpen,
  UserCheck,
  CheckCircle2,
} from "lucide-react";

export default async function DashboardPage() {
  const user = await requireAuth("/login");
  const fullName = user.profile?.fullName || "Student";
  const currentSemester = user.profile?.currentSemester || 1;
  const attendanceTarget = user.settings?.defaultAttendanceTarget ?? 75.0;

  return (
    <AppLayout user={user}>
      <div className="space-y-8">
        {/* Header Greeting */}
        <PageHeader
          title={`Welcome back, ${fullName}`}
          description={`Academic cockpit for Semester ${currentSemester} • Attendance target: ${attendanceTarget}%`}
          badge={<Badge variant="default">Phase 1 Active</Badge>}
        >
          <Link href="/profile">
            <Button variant="secondary" size="sm">
              <UserCheck className="h-4 w-4 mr-1.5" />
              Update Profile
            </Button>
          </Link>
        </PageHeader>

        {/* Top Metric Strip (Realistic placeholders) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Cumulative CGPA"
            value="—"
            subtitle="No completed semesters yet"
            icon={<GraduationCap className="h-5 w-5" />}
            badge={<Badge variant="secondary">Scale 10.0</Badge>}
          />

          <StatCard
            title="Semester SGPA"
            value="—"
            subtitle={`Semester ${currentSemester} in progress`}
            icon={<BookOpen className="h-5 w-5" />}
            badge={<Badge variant="secondary">Enrolled</Badge>}
          />

          <StatCard
            title="Overall Attendance"
            value="—%"
            subtitle={`Target threshold: ${attendanceTarget}%`}
            icon={<ClipboardCheck className="h-5 w-5" />}
            badge={<Badge variant="secondary">0 Subjects</Badge>}
          />

          <StatCard
            title="Upcoming Deadlines"
            value="0"
            subtitle="No pending tasks due"
            icon={<CalendarDays className="h-5 w-5" />}
            badge={<Badge variant="success">All Clear</Badge>}
          />
        </div>

        {/* Realistic Placeholders for Operational Modules */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Attendance Radar Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Attendance Radar</CardTitle>
                <CardDescription>
                  Live tracking and bunk safety buffer for Semester {currentSemester}
                </CardDescription>
              </div>
              <Badge variant="secondary">Phase 4 Ready</Badge>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={<ClipboardCheck className="h-6 w-6" />}
                title="No Subjects Enrolled Yet"
                description={`You haven't enrolled any subjects for Semester ${currentSemester}. When subjects are added, live attendance percentages, bunk counters, and catch-up alerts will appear here.`}
                action={
                  <Link href="/attendance">
                    <Button variant="outline" size="sm">
                      <Plus className="h-4 w-4 mr-1.5" />
                      Go to Attendance Manager
                    </Button>
                  </Link>
                }
              />
            </CardContent>
          </Card>

          {/* Upcoming Academic Events */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Academic Deadlines & Events</CardTitle>
                <CardDescription>
                  Upcoming exams, assignments, and presentations
                </CardDescription>
              </div>
              <Badge variant="secondary">Phase 5 Ready</Badge>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={<CalendarDays className="h-6 w-6" />}
                title="No Deadlines Scheduled"
                description="Your academic calendar is completely clear. Upcoming exams, tests, assignment due dates, and reminders will be tracked here."
                action={
                  <Link href="/events">
                    <Button variant="outline" size="sm">
                      <Plus className="h-4 w-4 mr-1.5" />
                      Go to Event Calendar
                    </Button>
                  </Link>
                }
              />
            </CardContent>
          </Card>
        </div>

        {/* Quick Navigation Cards */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Quick Navigation
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link href="/attendance">
              <Card className="p-4 hover:border-[var(--brand-primary)]/50 transition-all cursor-pointer group">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
                    <ClipboardCheck className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-[var(--text-muted)] group-hover:text-[var(--brand-primary)] group-hover:translate-x-1 transition-all" />
                </div>
                <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                  Attendance Tracker
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Log sessions, calculate bunk limits & recovery classes.
                </p>
              </Card>
            </Link>

            <Link href="/grades">
              <Card className="p-4 hover:border-[var(--brand-primary)]/50 transition-all cursor-pointer group">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-[var(--text-muted)] group-hover:text-[var(--brand-primary)] group-hover:translate-x-1 transition-all" />
                </div>
                <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                  Grades & SGPA
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Manage credit hours, enter grades & project your CGPA.
                </p>
              </Card>
            </Link>

            <Link href="/events">
              <Card className="p-4 hover:border-[var(--brand-primary)]/50 transition-all cursor-pointer group">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-[var(--text-muted)] group-hover:text-[var(--brand-primary)] group-hover:translate-x-1 transition-all" />
                </div>
                <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                  Events & Tasks
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Schedule exams, track assignment deadlines & set alerts.
                </p>
              </Card>
            </Link>

            <Link href="/profile">
              <Card className="p-4 hover:border-[var(--brand-primary)]/50 transition-all cursor-pointer group">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-[var(--text-muted)] group-hover:text-[var(--brand-primary)] group-hover:translate-x-1 transition-all" />
                </div>
                <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                  Profile Setup
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Configure college, degree, major, roll number & semester.
                </p>
              </Card>
            </Link>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
