"use client";

import * as React from "react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { AttendanceSubjectCard } from "./attendance-subject-card";
import { BulkAttendanceModal } from "./bulk-attendance-modal";
import { AttendanceCsvImportModal } from "./attendance-csv-import-modal";
import { SmartImportModal } from "../ai/smart-import-modal";
import { generateAttendanceCsv } from "@/lib/utils/attendance-csv";
import {
  calculateAttendancePercentage,
  calculateAttendanceStatus,
  calculateBunkBuffer,
  calculateOverallSemesterAttendance,
} from "@/lib/calculations/attendance";
import { useToast } from "@/components/ui/toast";
import {
  BookOpen,
  ClipboardList,
  Download,
  Upload,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
} from "lucide-react";
import type { AttendancePageData, AttendanceSemesterData, AttendanceSubjectData } from "@/lib/actions/attendance";

interface AttendanceViewProps {
  initialData: AttendancePageData;
}

export function AttendanceView({ initialData }: AttendanceViewProps) {
  const { toast } = useToast();
  const { semesters, defaultAttendanceTarget, currentSemesterNumber } = initialData;

  // Select the active/current semester by default
  const [selectedSemesterId, setSelectedSemesterId] = React.useState<string>(() => {
    const active = semesters.find(
      (s) => s.status === "ACTIVE" || s.semesterNumber === currentSemesterNumber
    );
    return active?.id ?? semesters[0]?.id ?? "";
  });

  const [bulkModalOpen, setBulkModalOpen] = React.useState(false);
  const [csvImportModalOpen, setCsvImportModalOpen] = React.useState(false);
  const [smartImportOpen, setSmartImportOpen] = React.useState(false);

  const selectedSemester = React.useMemo<AttendanceSemesterData | null>(
    () => semesters.find((s) => s.id === selectedSemesterId) ?? semesters[0] ?? null,
    [semesters, selectedSemesterId]
  );

  const subjects = React.useMemo(
    () => selectedSemester?.subjects ?? [],
    [selectedSemester]
  );

  // ─── Semester-level metrics ─────────────────────────────────────────────────

  const semesterMetrics = React.useMemo(() => {
    if (!selectedSemester || subjects.length === 0) {
      return {
        overallPct: null,
        onTrack: 0,
        warning: 0,
        critical: 0,
        notStarted: 0,
        totalBunkBuffer: 0,
      };
    }

    const nonAuditSubjects = subjects.filter((s) => !s.isAudit);
    const allRecords = nonAuditSubjects.map((s) => ({
      classesAttended: s.attendance?.classesAttended ?? 0,
      classesConducted: s.attendance?.classesConducted ?? 0,
    }));

    const overallResult = calculateOverallSemesterAttendance(allRecords);

    let onTrack = 0;
    let warning = 0;
    let critical = 0;
    let notStarted = 0;
    let totalBunkBuffer = 0;

    for (const sub of nonAuditSubjects) {
      const attended = sub.attendance?.classesAttended ?? 0;
      const conducted = sub.attendance?.classesConducted ?? 0;
      const target = sub.customAttendanceTarget ?? defaultAttendanceTarget;

      if (conducted === 0) {
        notStarted++;
        continue;
      }
      const pct = calculateAttendancePercentage(attended, conducted);
      const status = calculateAttendanceStatus(pct, target, conducted);
      if (status === "ON_TRACK") {
        onTrack++;
        const bunk = calculateBunkBuffer(attended, conducted, target);
        if (bunk > 0) totalBunkBuffer += bunk;
      } else if (status === "WARNING") {
        warning++;
      } else {
        critical++;
      }
    }

    return {
      overallPct: overallResult.overallPercentage,
      onTrack,
      warning,
      critical,
      notStarted,
      totalBunkBuffer,
    };
  }, [selectedSemester, subjects, defaultAttendanceTarget]);

  // ─── Overall status for header badge ──────────────────────────────────────

  const overallStatus =
    semesterMetrics.critical > 0
      ? "critical"
      : semesterMetrics.warning > 0
      ? "warning"
      : "good";

  // ─── CSV Export ────────────────────────────────────────────────────────────

  const handleExport = () => {
    if (!selectedSemester) return;
    const csv = generateAttendanceCsv(
      selectedSemester.name,
      selectedSemester.semesterNumber,
      subjects.map((s) => ({
        code: s.code,
        name: s.name,
        isAudit: s.isAudit,
        customAttendanceTarget: s.customAttendanceTarget,
        attendance: s.attendance
          ? { classesAttended: s.attendance.classesAttended, classesConducted: s.attendance.classesConducted }
          : null,
      })),
      defaultAttendanceTarget
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `attendance-sem${selectedSemester.semesterNumber}-${selectedSemester.name.replace(/\s+/g, "-")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "Attendance CSV downloaded.", type: "success" });
  };

  // ─── Bulk modal subject data prep ─────────────────────────────────────────

  const bulkSubjects = subjects
    .filter((s) => !s.isAudit)
    .map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      customAttendanceTarget: s.customAttendanceTarget,
      attendance: s.attendance
        ? { classesAttended: s.attendance.classesAttended, classesConducted: s.attendance.classesConducted }
        : null,
    }));

  // ─── Status helpers ────────────────────────────────────────────────────────

  const overallStatusBadge = {
    critical: { label: "Critical", cls: "bg-[var(--accent-danger)]/15 text-[var(--accent-danger)] border-[var(--accent-danger)]/30" },
    warning: { label: "Warning", cls: "bg-[var(--accent-warning)]/15 text-[var(--accent-warning)] border-[var(--accent-warning)]/30" },
    good: { label: "On Track", cls: "bg-[var(--accent-success)]/15 text-[var(--accent-success)] border-[var(--accent-success)]/30" },
  }[overallStatus];

  const formatSubjectTarget = (sub: AttendanceSubjectData) =>
    sub.customAttendanceTarget ?? defaultAttendanceTarget;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <PageHeader
        title="Attendance"
        description="Track your attendance, monitor bunk budgets, and stay ahead of shortfalls."
        badge={
          subjects.length > 0 ? (
            <Badge variant="default" className={`${overallStatusBadge.cls} text-xs font-semibold`}>
              {overallStatus === "critical" && <AlertTriangle className="h-3 w-3 mr-1" />}
              {overallStatus === "warning" && <AlertTriangle className="h-3 w-3 mr-1" />}
              {overallStatus === "good" && <CheckCircle2 className="h-3 w-3 mr-1" />}
              {overallStatusBadge.label}
            </Badge>
          ) : null
        }
      >
        {selectedSemester && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setSmartImportOpen(true)}
              className="gap-1.5 shadow-2xs"
              id="attendance-smart-import-btn"
            >
              <Sparkles className="h-4 w-4" />
              Smart Import
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCsvImportModalOpen(true)}
              className="gap-1.5"
              id="attendance-csv-import-btn"
            >
              <Upload className="h-4 w-4" />
              Import CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExport}
              className="gap-1.5"
              id="attendance-export-btn"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            {bulkSubjects.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setBulkModalOpen(true)}
                className="gap-1.5"
                id="attendance-bulk-edit-btn"
              >
                <ClipboardList className="h-4 w-4" />
                Bulk Edit
              </Button>
            )}
          </div>
        )}
      </PageHeader>


      {/* No semesters empty state */}
      {semesters.length === 0 && (
        <EmptyState
          icon={<BookOpen className="h-8 w-8" />}
          title="No Semesters Yet"
          description="Create a semester and add subjects in the Grades section to start tracking attendance."
        />
      )}

      {semesters.length > 0 && (
        <>
          {/* Semester selector */}
          {semesters.length > 1 && (
            <div className="flex flex-wrap gap-2 pb-1" role="tablist" aria-label="Semester selector">
              {semesters.map((sem) => (
                <button
                  key={sem.id}
                  role="tab"
                  aria-selected={selectedSemesterId === sem.id}
                  onClick={() => setSelectedSemesterId(sem.id)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                    selectedSemesterId === sem.id
                      ? "bg-[var(--brand-primary)] text-white dark:text-slate-950 font-bold border-[var(--brand-primary)] shadow-[0_0_15px_rgba(0,229,255,0.3)]"
                      : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] backdrop-blur-xs"
                  }`}
                >
                  Sem {sem.semesterNumber}
                  {sem.status === "ACTIVE" && (
                    <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent-success)] align-middle" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Stat cards */}
          {selectedSemester && subjects.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard
                title="Overall Attendance"
                value={
                  semesterMetrics.overallPct === null || semesterMetrics.notStarted === subjects.filter((s) => !s.isAudit).length
                    ? "—"
                    : `${semesterMetrics.overallPct.toFixed(1)}%`
                }
                subtitle="Across all non-audit subjects"
                icon={<BarChart3 className="h-5 w-5" />}
                variant={
                  semesterMetrics.overallPct === null
                    ? "default"
                    : semesterMetrics.overallPct >= defaultAttendanceTarget
                    ? "success"
                    : semesterMetrics.overallPct >= defaultAttendanceTarget - 10
                    ? "warning"
                    : "danger"
                }
              />
              <StatCard
                title="On Track"
                value={semesterMetrics.onTrack}
                subtitle={`of ${subjects.filter((s) => !s.isAudit).length} subjects`}
                icon={<CheckCircle2 className="h-5 w-5" />}
                variant="success"
              />
              <StatCard
                title="At Risk"
                value={semesterMetrics.warning + semesterMetrics.critical}
                subtitle={`${semesterMetrics.critical} critical, ${semesterMetrics.warning} warning`}
                icon={<AlertTriangle className="h-5 w-5" />}
                variant={semesterMetrics.critical > 0 ? "danger" : semesterMetrics.warning > 0 ? "warning" : "default"}
              />
              <StatCard
                title="Total Bunk Budget"
                value={semesterMetrics.totalBunkBuffer <= 0 ? "0" : `+${semesterMetrics.totalBunkBuffer}`}
                subtitle="Classes you can still miss"
                icon={<ClipboardList className="h-5 w-5" />}
                variant={semesterMetrics.totalBunkBuffer > 0 ? "success" : "default"}
              />
            </div>
          )}

          {/* No subjects empty state */}
          {selectedSemester && subjects.length === 0 && (
            <EmptyState
              icon={<BookOpen className="h-8 w-8" />}
              title="No Subjects in This Semester"
              description="Add subjects in the Grades section to start tracking attendance here."
            />
          )}

          {/* Subjects grid */}
          {selectedSemester && subjects.length > 0 && (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              role="list"
              aria-label="Subject attendance cards"
            >
              {subjects.map((subject) => (
                <div key={subject.id} role="listitem">
                  <AttendanceSubjectCard
                    subjectId={subject.id}
                    subjectName={subject.name}
                    subjectCode={subject.code}
                    creditHours={subject.creditHours}
                    category={subject.category}
                    isAudit={subject.isAudit}
                    classesAttended={subject.attendance?.classesAttended ?? 0}
                    classesConducted={subject.attendance?.classesConducted ?? 0}
                    targetPercentage={formatSubjectTarget(subject)}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {selectedSemester && bulkSubjects.length > 0 && (
        <BulkAttendanceModal
          open={bulkModalOpen}
          onOpenChange={setBulkModalOpen}
          semesterName={selectedSemester.name}
          subjects={bulkSubjects}
        />
      )}

      {/* CSV Import modal */}
      {selectedSemester && (
        <AttendanceCsvImportModal
          open={csvImportModalOpen}
          onOpenChange={setCsvImportModalOpen}
          semesterName={selectedSemester.name}
          subjects={subjects.map((s) => ({ id: s.id, name: s.name, code: s.code }))}
          onSwitchToSmartImport={() => {
            setCsvImportModalOpen(false);
            setSmartImportOpen(true);
          }}
        />
      )}

      {/* Smart Import modal */}
      <SmartImportModal
        open={smartImportOpen}
        onOpenChange={setSmartImportOpen}
        defaultImportType="ATTENDANCE"
        selectedSemesterId={selectedSemesterId}
        semesters={semesters.map((s) => ({
          id: s.id,
          name: s.name,
          semesterNumber: s.semesterNumber,
        }))}
        onFallbackToCsv={() => setCsvImportModalOpen(true)}
      />
    </div>
  );
}
