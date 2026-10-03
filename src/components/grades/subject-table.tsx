"use client";

import * as React from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Plus, Edit2, Trash2, Award, BookOpen } from "lucide-react";
import type { SGPACalculationResult } from "@/lib/calculations/types";

export interface SubjectRowData {
  id: string;
  name: string;
  code?: string | null;
  creditHours: number;
  category: "CORE" | "ELECTIVE" | "LAB" | "AUDIT";
  isAudit: boolean;
  customAttendanceTarget?: number | null;
  grade?: {
    id: string;
    gradeLetter?: string | null;
    gradePoint?: number | null;
    marksObtained?: number | null;
    maxMarks?: number | null;
    isPassing: boolean;
  } | null;
}

interface SubjectTableProps {
  subjects: SubjectRowData[];
  metrics: SGPACalculationResult;
  semesterName: string;
  onAddSubject: () => void;
  onBulkAddSubjects?: () => void;
  onBulkEnterGrades?: () => void;
  onEditSubject: (subject: SubjectRowData) => void;
  onDeleteSubject: (subject: SubjectRowData) => void;
  onEnterGrade: (subject: SubjectRowData) => void;
}

export function SubjectTable({
  subjects,
  metrics,
  semesterName,
  onAddSubject,
  onBulkAddSubjects,
  onBulkEnterGrades,
  onEditSubject,
  onDeleteSubject,
  onEnterGrade,
}: SubjectTableProps) {
  if (subjects.length === 0) {
    return (
      <EmptyState
        icon={<BookOpen className="h-8 w-8 text-[var(--brand-primary)]" />}
        title="No Subjects Enrolled Yet"
        description={`No courses have been added to ${semesterName}. Add individual subjects or use the fast bulk spreadsheet entry to enroll all 7–8 courses in one screen.`}
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            {onBulkAddSubjects && (
              <Button variant="primary" size="sm" onClick={onBulkAddSubjects}>
                <Plus className="h-4 w-4 mr-1.5" />
                Bulk Add All Subjects
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onAddSubject}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add Single Subject
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Enrolled Subjects ({subjects.length})</h3>
        {onBulkEnterGrades && (
          <Button variant="outline" size="sm" onClick={onBulkEnterGrades} className="text-xs">
            <Award className="h-3.5 w-3.5 mr-1 text-[var(--brand-primary)]" />
            Enter Results in Bulk
          </Button>
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xs">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] font-semibold uppercase tracking-wider text-[11px]">
              <th className="py-3.5 px-4">Subject & Code</th>
              <th className="py-3.5 px-3">Category</th>
              <th className="py-3.5 px-3 text-center">Credits ($c_i$)</th>
              <th className="py-3.5 px-3 text-center">Marks</th>
              <th className="py-3.5 px-3 text-center">Grade</th>
              <th className="py-3.5 px-3 text-center">Points ($g_i$)</th>
              <th className="py-3.5 px-3 text-center">Quality Points ($c_i \times g_i$)</th>
              <th className="py-3.5 px-3 text-center">Status</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-primary)]">
            {subjects.map((sub) => {
              const hasGrade = sub.grade && sub.grade.gradeLetter;
              const gradePoint = sub.grade?.gradePoint ?? null;
              const qualityPoints =
                !sub.isAudit && gradePoint !== null ? sub.creditHours * gradePoint : null;

              return (
                <tr
                  key={sub.id}
                  className={`hover:bg-[var(--bg-surface-elevated)]/60 transition-colors ${
                    sub.isAudit ? "opacity-75 bg-[var(--bg-surface-elevated)]/20" : ""
                  }`}
                >
                  {/* Subject Name & Code */}
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-sm text-[var(--text-primary)]">
                      {sub.name}
                    </div>
                    {sub.code && (
                      <div className="text-[11px] text-[var(--text-muted)] font-mono">
                        {sub.code}
                      </div>
                    )}
                  </td>

                  {/* Category */}
                  <td className="py-3.5 px-3">
                    <Badge variant={sub.isAudit ? "secondary" : "default"}>
                      {sub.category}
                    </Badge>
                  </td>

                  {/* Credits */}
                  <td className="py-3.5 px-3 text-center font-medium tabular-nums">
                    {sub.isAudit ? (
                      <span className="text-[var(--text-muted)]" title="Excluded from SGPA denominator">
                        0.0 (Audit)
                      </span>
                    ) : (
                      `${sub.creditHours.toFixed(1)}`
                    )}
                  </td>

                  {/* Marks */}
                  <td className="py-3.5 px-3 text-center tabular-nums text-[var(--text-secondary)]">
                    {sub.grade?.marksObtained !== null && sub.grade?.marksObtained !== undefined
                      ? `${sub.grade.marksObtained} / ${sub.grade.maxMarks || 100}`
                      : "—"}
                  </td>

                  {/* Grade */}
                  <td className="py-3.5 px-3 text-center">
                    {hasGrade ? (
                      <span className="inline-flex items-center justify-center font-bold text-xs rounded-md bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] px-2 py-0.5">
                        {sub.grade?.gradeLetter}
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    )}
                  </td>

                  {/* Points */}
                  <td className="py-3.5 px-3 text-center font-medium tabular-nums">
                    {gradePoint !== null ? gradePoint.toFixed(1) : "—"}
                  </td>

                  {/* Quality Points */}
                  <td className="py-3.5 px-3 text-center font-semibold tabular-nums text-[var(--brand-primary)]">
                    {sub.isAudit ? (
                      <span className="text-[var(--text-muted)] font-normal text-[11px]">Audit</span>
                    ) : qualityPoints !== null ? (
                      qualityPoints.toFixed(1)
                    ) : (
                      "—"
                    )}
                  </td>

                  {/* Status */}
                  <td className="py-3.5 px-3 text-center">
                    {sub.isAudit ? (
                      <Badge variant="secondary">Audit</Badge>
                    ) : !hasGrade ? (
                      <Badge variant="outline">In Progress</Badge>
                    ) : sub.grade?.isPassing ? (
                      <Badge variant="success">Passed</Badge>
                    ) : (
                      <Badge variant="danger">Failed</Badge>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onEnterGrade(sub)}
                        title="Enter / Edit Grade"
                      >
                        <Award className="h-3.5 w-3.5 mr-1 text-[var(--brand-primary)]" />
                        {hasGrade ? "Result" : "Grade"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEditSubject(sub)}
                        title="Edit Subject Details"
                      >
                        <Edit2 className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDeleteSubject(sub)}
                        title="Delete Subject"
                        className="hover:text-[var(--accent-danger)]"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* Formula Transparency Summary Footer */}
          <tfoot>
            <tr className="border-t-2 border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] font-semibold text-xs">
              <td colSpan={2} className="py-3.5 px-4">
                Semester Total & Formula Rollup:
              </td>
              <td className="py-3.5 px-3 text-center tabular-nums text-[var(--brand-primary)]">
                {metrics.totalCreditBearingCredits.toFixed(1)} Credits
              </td>
              <td className="py-3.5 px-3 text-center text-[var(--text-muted)]">—</td>
              <td className="py-3.5 px-3 text-center text-[var(--text-muted)]">—</td>
              <td className="py-3.5 px-3 text-center text-[var(--text-muted)]">—</td>
              <td className="py-3.5 px-3 text-center tabular-nums text-[var(--brand-primary)]">
                {metrics.totalQualityPoints.toFixed(1)} QP
              </td>
              <td colSpan={2} className="py-3.5 px-4 text-right">
                <span className="text-xs text-[var(--text-secondary)] mr-2">
                  SGPA (&Sigma; QP / &Sigma; Credits):
                </span>
                <span className="text-base font-bold text-[var(--brand-primary)] tabular-nums">
                  {metrics.sgpa !== null ? metrics.sgpa.toFixed(2) : "N/A"}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile Card List View (<= 768px) */}
      <div className="md:hidden space-y-3">
        {subjects.map((sub) => {
          const hasGrade = sub.grade && sub.grade.gradeLetter;
          const gradePoint = sub.grade?.gradePoint ?? null;
          const qualityPoints =
            !sub.isAudit && gradePoint !== null ? sub.creditHours * gradePoint : null;

          return (
            <div
              key={sub.id}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3 shadow-2xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-semibold text-sm text-[var(--text-primary)]">
                    {sub.name}
                  </h4>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--text-muted)]">
                    {sub.code && <span className="font-mono">{sub.code}</span>}
                    <span>•</span>
                    <span>{sub.isAudit ? "Audit Course" : `${sub.creditHours} Credits`}</span>
                  </div>
                </div>
                <Badge variant={sub.isAudit ? "secondary" : !hasGrade ? "outline" : sub.grade?.isPassing ? "success" : "danger"}>
                  {sub.isAudit ? "Audit" : !hasGrade ? "In Progress" : sub.grade?.gradeLetter}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-lg bg-[var(--bg-surface-elevated)] p-2.5 text-center text-xs">
                <div>
                  <span className="text-[10px] text-[var(--text-muted)] block">Grade Point</span>
                  <span className="font-bold text-[var(--text-primary)] tabular-nums">
                    {gradePoint !== null ? gradePoint.toFixed(1) : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--text-muted)] block">Marks</span>
                  <span className="font-bold text-[var(--text-primary)] tabular-nums">
                    {sub.grade?.marksObtained !== null && sub.grade?.marksObtained !== undefined
                      ? `${sub.grade.marksObtained}`
                      : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--text-muted)] block">Quality Pts</span>
                  <span className="font-bold text-[var(--brand-primary)] tabular-nums">
                    {qualityPoints !== null ? qualityPoints.toFixed(1) : "—"}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1 border-t border-[var(--border-subtle)]">
                <Button variant="secondary" size="sm" onClick={() => onEnterGrade(sub)}>
                  <Award className="h-3.5 w-3.5 mr-1 text-[var(--brand-primary)]" />
                  {hasGrade ? "Edit Grade" : "Enter Grade"}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onEditSubject(sub)}>
                  <Edit2 className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onDeleteSubject(sub)}>
                  <Trash2 className="h-3.5 w-3.5 text-[var(--accent-danger)]" />
                </Button>
              </div>
            </div>
          );
        })}

        {/* Mobile Summary Card */}
        <div className="rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/5 p-4 text-xs space-y-1">
          <div className="flex justify-between font-semibold">
            <span>Total Enrolled Credits:</span>
            <span className="tabular-nums">{metrics.totalCreditBearingCredits.toFixed(1)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Total Quality Points:</span>
            <span className="tabular-nums">{metrics.totalQualityPoints.toFixed(1)}</span>
          </div>
          <div className="flex justify-between items-center text-sm font-bold pt-2 border-t border-[var(--border-subtle)] text-[var(--brand-primary)]">
            <span>Semester SGPA:</span>
            <span className="text-base tabular-nums">
              {metrics.sgpa !== null ? metrics.sgpa.toFixed(2) : "N/A"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
