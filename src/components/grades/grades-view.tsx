"use client";

import * as React from "react";
import { PageHeader } from "../ui/page-header";
import { StatCard } from "../ui/stat-card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { EmptyState } from "../ui/empty-state";
import { SemesterModal } from "./semester-modal";
import { SubjectModal } from "./subject-modal";
import { GradeEntryModal } from "./grade-entry-modal";
import { WhatIfSimulator } from "./what-if-simulator";
import { SubjectTable, type SubjectRowData } from "./subject-table";
import { BulkSubjectModal } from "./bulk-subject-modal";
import { BulkGradeModal } from "./bulk-grade-modal";
import { BulkAttendanceModal } from "../attendance/bulk-attendance-modal";
import { SmartImportModal } from "../ai/smart-import-modal";
import { deleteSemester, deleteSubject } from "@/lib/actions/academic";
import { generateSemesterCsv } from "@/lib/utils/csv-parser";
import { useToast } from "../ui/toast";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  GraduationCap,
  BookOpen,
  Award,
  Sparkles,
  Plus,
  Edit2,
  Trash2,
  Settings,
  Calendar,
  Download,
  Layers,
  FileSpreadsheet,
  CheckSquare,
} from "lucide-react";
import type { GradingScaleDefinition } from "@/lib/constants/grading";
import type { SGPACalculationResult, CGPACalculationResult } from "@/lib/calculations/types";

export interface SemesterData {
  id: string;
  name: string;
  semesterNumber: number;
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  startDate?: Date | null;
  endDate?: Date | null;
  subjects: SubjectRowData[];
  metrics: SGPACalculationResult;
}

interface GradesViewProps {
  initialData: {
    semesters: SemesterData[];
    cgpaResult: CGPACalculationResult;
    gradingScale: GradingScaleDefinition;
    currentSemesterNumber: number;
  };
}

export function GradesView({ initialData }: GradesViewProps) {
  const { toast } = useToast();
  const router = useRouter();

  const { semesters, cgpaResult, gradingScale, currentSemesterNumber } = initialData;

  // Selected semester state: defaults to current semester or first available
  const [selectedSemesterId, setSelectedSemesterId] = React.useState<string>(() => {
    const active = semesters.find((s) => s.status === "ACTIVE" || s.semesterNumber === currentSemesterNumber);
    return active ? active.id : semesters[0]?.id || "";
  });

  const selectedSemester = React.useMemo(() => {
    return semesters.find((s) => s.id === selectedSemesterId) || semesters[0] || null;
  }, [semesters, selectedSemesterId]);

  // Modal states
  const [semesterModalOpen, setSemesterModalOpen] = React.useState(false);
  const [editingSemester, setEditingSemester] = React.useState<SemesterData | null>(null);

  const [subjectModalOpen, setSubjectModalOpen] = React.useState(false);
  const [editingSubject, setEditingSubject] = React.useState<SubjectRowData | null>(null);

  const [gradeModalOpen, setGradeModalOpen] = React.useState(false);
  const [gradingSubject, setGradingSubject] = React.useState<SubjectRowData | null>(null);

  const [whatIfOpen, setWhatIfOpen] = React.useState(false);

  // Bulk operation modals
  const [bulkSubjectOpen, setBulkSubjectOpen] = React.useState(false);
  const [bulkGradeOpen, setBulkGradeOpen] = React.useState(false);
  const [bulkAttendanceOpen, setBulkAttendanceOpen] = React.useState(false);
  const [smartImportOpen, setSmartImportOpen] = React.useState(false);

  // Deletion confirmations
  const [deleteSemesterConfirmOpen, setDeleteSemesterConfirmOpen] = React.useState(false);
  const [deletingSemester, setDeletingSemester] = React.useState<SemesterData | null>(null);
  const [isDeletingSemester, setIsDeletingSemester] = React.useState(false);

  const [deleteSubjectConfirmOpen, setDeleteSubjectConfirmOpen] = React.useState(false);
  const [deletingSubject, setDeletingSubject] = React.useState<SubjectRowData | null>(null);
  const [isDeletingSubject, setIsDeletingSubject] = React.useState(false);

  // Handlers for Semesters
  const handleOpenCreateSemester = () => {
    setEditingSemester(null);
    setSemesterModalOpen(true);
  };

  const handleOpenEditSemester = (semester: SemesterData) => {
    setEditingSemester(semester);
    setSemesterModalOpen(true);
  };

  const handleOpenDeleteSemester = (semester: SemesterData) => {
    setDeletingSemester(semester);
    setDeleteSemesterConfirmOpen(true);
  };

  const confirmDeleteSemester = async () => {
    if (!deletingSemester) return;
    setIsDeletingSemester(true);
    try {
      const res = await deleteSemester(deletingSemester.id);
      if (res.success) {
        toast({
          title: "Semester Deleted",
          description: `${deletingSemester.name} and all enrolled subjects have been removed.`,
          type: "info",
        });
        setDeleteSemesterConfirmOpen(false);
        router.refresh();
      } else {
        toast({
          title: "Error",
          description: res.error || "Failed to delete semester.",
          type: "error",
        });
      }
    } finally {
      setIsDeletingSemester(false);
    }
  };

  // Handlers for Subjects
  const handleOpenAddSubject = () => {
    setEditingSubject(null);
    setSubjectModalOpen(true);
  };

  const handleOpenEditSubject = (subject: SubjectRowData) => {
    setEditingSubject(subject);
    setSubjectModalOpen(true);
  };

  const handleOpenDeleteSubject = (subject: SubjectRowData) => {
    setDeletingSubject(subject);
    setDeleteSubjectConfirmOpen(true);
  };

  const confirmDeleteSubject = async () => {
    if (!deletingSubject) return;
    setIsDeletingSubject(true);
    try {
      const res = await deleteSubject(deletingSubject.id);
      if (res.success) {
        toast({
          title: "Subject Removed",
          description: `'${deletingSubject.name}' has been deleted.`,
          type: "info",
        });
        setDeleteSubjectConfirmOpen(false);
        router.refresh();
      } else {
        toast({
          title: "Error",
          description: res.error || "Failed to delete subject.",
          type: "error",
        });
      }
    } finally {
      setIsDeletingSubject(false);
    }
  };

  // Handler for Grades
  const handleOpenGradeModal = (subject: SubjectRowData) => {
    setGradingSubject(subject);
    setGradeModalOpen(true);
  };

  const handleOpenBulkAddSubjects = () => {
    setBulkSubjectOpen(true);
  };

  const handleOpenBulkGrades = () => {
    setBulkGradeOpen(true);
  };

  const handleOpenBulkAttendance = () => {
    setBulkAttendanceOpen(true);
  };

  const handleCreatedAndSetupSubjects = (semesterId: string) => {
    setSelectedSemesterId(semesterId);
    setBulkSubjectOpen(true);
  };

  const handleExportCsv = () => {
    if (!selectedSemester) return;
    const csvContent = generateSemesterCsv(
      selectedSemester.name,
      selectedSemester.semesterNumber,
      selectedSemester.subjects
    );
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `${selectedSemester.name.toLowerCase().replace(/\s+/g, "_")}_academic_records.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({
      title: "CSV Exported",
      description: `Downloaded academic records for ${selectedSemester.name}.`,
      type: "success",
    });
  };

  const nextSuggestedSemesterNumber = React.useMemo(() => {
    if (semesters.length === 0) return 1;
    const max = Math.max(...semesters.map((s) => s.semesterNumber));
    return max + 1;
  }, [semesters]);

  const totalCreditsEnrolledAll = React.useMemo(() => {
    return semesters.reduce((sum, s) => sum + s.metrics.totalEnrolledCredits, 0);
  }, [semesters]);

  const totalCreditsEarnedAll = React.useMemo(() => {
    return semesters.reduce((sum, s) => sum + s.metrics.earnedCredits, 0);
  }, [semesters]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Grades & Academic Results"
        description="Comprehensive grade sheet, credit-weighted SGPA/CGPA calculations, and scenario planning."
        badge={
          <Badge variant="default" className="text-xs">
            {gradingScale.name}
          </Badge>
        }
      >
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSmartImportOpen(true)}
            className="gap-1.5"
            id="grades-smart-import-header-btn"
          >
            <Sparkles className="h-4 w-4 text-[var(--brand-primary)]" />
            Smart Import
          </Button>

          <Button variant="secondary" size="sm" onClick={() => setWhatIfOpen((prev) => !prev)}>
            <Sparkles className="h-4 w-4 mr-1.5 text-[var(--brand-primary)]" />
            {whatIfOpen ? "Hide What-If" : "What-If Simulator"}
          </Button>

          <Button variant="primary" size="sm" onClick={handleOpenCreateSemester}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Semester
          </Button>
        </div>
      </PageHeader>

      {/* Top Academic Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Cumulative CGPA Card */}
        <StatCard
          title="Cumulative CGPA"
          value={cgpaResult.cgpa !== null ? cgpaResult.cgpa.toFixed(2) : "—"}
          subtitle={`Across ${cgpaResult.totalCredits.toFixed(1)} completed credit hours`}
          icon={<GraduationCap className="h-5 w-5" />}
          badge={
            <Badge variant={cgpaResult.cgpa !== null ? "success" : "secondary"}>
              {cgpaResult.cgpa !== null ? "Credit-Weighted" : "Pending"}
            </Badge>
          }
        />

        {/* Selected Semester SGPA Card */}
        <StatCard
          title={`${selectedSemester?.name || "Semester"} SGPA`}
          value={
            selectedSemester?.metrics.sgpa !== null && selectedSemester?.metrics.sgpa !== undefined
              ? selectedSemester.metrics.sgpa.toFixed(2)
              : "—"
          }
          subtitle={
            selectedSemester
              ? `${selectedSemester.metrics.totalQualityPoints.toFixed(1)} QP / ${selectedSemester.metrics.totalCreditBearingCredits.toFixed(1)} Credits`
              : "No semester selected"
          }
          icon={<BookOpen className="h-5 w-5" />}
          badge={
            <Badge variant="default">
              {selectedSemester ? `${selectedSemester.status}` : "—"}
            </Badge>
          }
        />

        {/* Total Academic Credits */}
        <StatCard
          title="Curriculum Progress"
          value={`${totalCreditsEarnedAll.toFixed(1)} / ${totalCreditsEnrolledAll.toFixed(1)}`}
          subtitle="Earned vs Enrolled Credits"
          icon={<Award className="h-5 w-5" />}
          badge={
            <Badge variant="secondary">
              {totalCreditsEnrolledAll > 0
                ? `${Math.round((totalCreditsEarnedAll / totalCreditsEnrolledAll) * 100)}% Pass Rate`
                : "0%"}
            </Badge>
          }
        />

        {/* Active Grading Scale Card */}
        <StatCard
          title="Active Grading Rubric"
          value={gradingScale.scaleType}
          subtitle={gradingScale.name}
          icon={<Settings className="h-5 w-5" />}
          badge={
            <Link href="/settings">
              <Badge variant="outline" className="cursor-pointer hover:border-[var(--brand-primary)]">
                Change
              </Badge>
            </Link>
          }
        />
      </div>

      {/* Main Semester Section */}
      {semesters.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-10 w-10 text-[var(--brand-primary)]" />}
          title="No Semesters Created Yet"
          description="Your academic curriculum has no semesters recorded. Create your first semester to begin enrolling subjects and logging grades."
          action={
            <Button variant="primary" onClick={handleOpenCreateSemester}>
              <Plus className="h-4 w-4 mr-1.5" />
              Create Semester 1
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {/* Semester Tabs Navigation */}
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 overflow-x-auto">
            <div className="flex items-center gap-1.5">
              {semesters.map((sem) => {
                const isSelected = sem.id === selectedSemester?.id;
                return (
                  <button
                    key={sem.id}
                    onClick={() => setSelectedSemesterId(sem.id)}
                    className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                      isSelected
                        ? "bg-[var(--brand-primary)] text-white dark:text-slate-950 font-bold shadow-[0_0_15px_rgba(0,229,255,0.3)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <span>{sem.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                        isSelected
                          ? "bg-black/20 text-white dark:text-slate-950"
                          : "bg-[var(--bg-surface-elevated)] text-[var(--text-muted)]"
                      }`}
                    >
                      {sem.metrics.sgpa !== null ? `SGPA: ${sem.metrics.sgpa.toFixed(2)}` : "In Progress"}
                    </span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={handleOpenCreateSemester}
                className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--brand-primary)] hover:bg-[var(--bg-surface-elevated)] transition-colors whitespace-nowrap cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Semester</span>
              </button>
            </div>
          </div>

          {/* Selected Semester Management Header */}
          {selectedSemester && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[var(--bg-surface)] p-4 rounded-xl border border-[var(--border-subtle)] shadow-2xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">
                    {selectedSemester.name}
                  </h2>
                  <Badge
                    variant={
                      selectedSemester.status === "ACTIVE"
                        ? "default"
                        : selectedSemester.status === "COMPLETED"
                        ? "success"
                        : "secondary"
                    }
                  >
                    {selectedSemester.status}
                  </Badge>
                  {selectedSemester.startDate && (
                    <span className="text-xs text-[var(--text-muted)]">
                      Started: {new Date(selectedSemester.startDate).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  {selectedSemester.subjects.length} Subjects enrolled •{" "}
                  {selectedSemester.metrics.totalCreditBearingCredits.toFixed(1)} Credit Hours •{" "}
                  {selectedSemester.metrics.auditSubjectCount > 0
                    ? `${selectedSemester.metrics.auditSubjectCount} Audit course(s)`
                    : "All credit-bearing"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setSmartImportOpen(true)}
                  title="Extract grades or attendance from university screenshot"
                  className="gap-1.5 shadow-2xs"
                  id="grades-smart-import-semester-btn"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Smart Import
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCsv}
                  title="Export semester records as CSV"
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Export CSV
                </Button>
                {selectedSemester.subjects.length > 0 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleOpenBulkAttendance}
                      title="Update classes attended & conducted in batch"
                    >
                      <CheckSquare className="h-3.5 w-3.5 mr-1 text-[var(--accent-success)]" />
                      Attendance Batch
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleOpenBulkGrades}
                      title="Enter results for all courses in one screen"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5 mr-1 text-[var(--brand-primary)]" />
                      Bulk Results
                    </Button>
                  </>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleOpenBulkAddSubjects}
                  title="Open fast spreadsheet entry for multiple courses"
                >
                  <Layers className="h-3.5 w-3.5 mr-1 text-[var(--brand-primary)]" />
                  Bulk Add Subjects
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenEditSemester(selectedSemester)}
                >
                  <Edit2 className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenDeleteSemester(selectedSemester)}
                  className="text-[var(--accent-danger)] hover:bg-[var(--accent-danger)]/10"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Delete
                </Button>
                <Button variant="primary" size="sm" onClick={handleOpenAddSubject}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Subject
                </Button>
              </div>
            </div>
          )}

          {/* What-If Simulator Drawer (when toggled) */}
          {whatIfOpen && selectedSemester && (
            <div className="animate-in fade-in slide-in-from-top-4 duration-200">
              <WhatIfSimulator
                subjects={selectedSemester.subjects}
                gradingScale={gradingScale}
                semesterName={selectedSemester.name}
              />
            </div>
          )}

          {/* Subjects Table & Results */}
          {selectedSemester && (
            <SubjectTable
              subjects={selectedSemester.subjects}
              metrics={selectedSemester.metrics}
              semesterName={selectedSemester.name}
              onAddSubject={handleOpenAddSubject}
              onBulkAddSubjects={handleOpenBulkAddSubjects}
              onBulkEnterGrades={handleOpenBulkGrades}
              onEditSubject={handleOpenEditSubject}
              onDeleteSubject={handleOpenDeleteSubject}
              onEnterGrade={handleOpenGradeModal}
            />
          )}
        </div>
      )}

      {/* Modals & Dialogs */}
      <SemesterModal
        open={semesterModalOpen}
        onOpenChange={setSemesterModalOpen}
        semesterToEdit={editingSemester}
        suggestedSemesterNumber={nextSuggestedSemesterNumber}
        onCreatedAndSetupSubjects={handleCreatedAndSetupSubjects}
      />

      {selectedSemester && (
        <SubjectModal
          open={subjectModalOpen}
          onOpenChange={setSubjectModalOpen}
          semesterId={selectedSemester.id}
          semesterName={selectedSemester.name}
          subjectToEdit={editingSubject}
        />
      )}

      <GradeEntryModal
        open={gradeModalOpen}
        onOpenChange={setGradeModalOpen}
        subject={gradingSubject}
        gradingScale={gradingScale}
      />

      {selectedSemester && (
        <BulkSubjectModal
          open={bulkSubjectOpen}
          onOpenChange={setBulkSubjectOpen}
          semesterId={selectedSemester.id}
          semesterName={selectedSemester.name}
          onSwitchToSmartImport={() => {
            setBulkSubjectOpen(false);
            setSmartImportOpen(true);
          }}
        />
      )}

      {selectedSemester && (
        <BulkGradeModal
          open={bulkGradeOpen}
          onOpenChange={setBulkGradeOpen}
          semesterName={selectedSemester.name}
          subjects={selectedSemester.subjects}
          gradingScale={gradingScale}
        />
      )}

      {selectedSemester && (
        <BulkAttendanceModal
          open={bulkAttendanceOpen}
          onOpenChange={setBulkAttendanceOpen}
          semesterName={selectedSemester.name}
          subjects={selectedSemester.subjects}
        />
      )}

      <ConfirmDialog
        open={deleteSemesterConfirmOpen}
        onOpenChange={setDeleteSemesterConfirmOpen}
        title={`Delete ${deletingSemester?.name || "Semester"}?`}
        description="Are you sure you want to delete this semester? All enrolled subjects, grades, and associated attendance records will be permanently removed. This action cannot be undone."
        confirmText="Delete Semester"
        variant="danger"
        isLoading={isDeletingSemester}
        onConfirm={confirmDeleteSemester}
      />

      <ConfirmDialog
        open={deleteSubjectConfirmOpen}
        onOpenChange={setDeleteSubjectConfirmOpen}
        title={`Delete '${deletingSubject?.name || "Subject"}'?`}
        description="Are you sure you want to delete this subject? Its grades and attendance records will be permanently deleted."
        confirmText="Delete Subject"
        variant="danger"
        isLoading={isDeletingSubject}
        onConfirm={confirmDeleteSubject}
      />

      {/* Smart Import Modal */}
      <SmartImportModal
        open={smartImportOpen}
        onOpenChange={setSmartImportOpen}
        defaultImportType="GRADES"
        selectedSemesterId={selectedSemester?.id}
        semesters={semesters.map((s) => ({
          id: s.id,
          name: s.name,
          semesterNumber: s.semesterNumber,
        }))}
        onFallbackToCsv={() => setBulkSubjectOpen(true)}
      />
    </div>
  );
}
