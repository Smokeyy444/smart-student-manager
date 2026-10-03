"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { bulkSaveSubjectGrades } from "@/lib/actions/academic";
import type { GradingScaleDefinition } from "@/lib/constants/grading";
import {
  resolveGradePoint,
  resolveGradeFromMarks,
  validateMarksAndGrade,
} from "@/lib/calculations/grading-scale";
import { calculateSGPA } from "@/lib/calculations/gpa";
import type { SubjectCreditGrade } from "@/lib/calculations/types";
import type { GradeEntryMode } from "@/lib/validations/academic";

interface BulkSubjectItem {
  id: string;
  name: string;
  code?: string | null;
  creditHours: number;
  isAudit: boolean;
  category: string;
  grade?: {
    gradeLetter?: string | null;
    gradePoint?: number | null;
    marksObtained?: number | null;
    maxMarks?: number | null;
    isPassing: boolean;
  } | null;
}

interface BulkGradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  semesterName: string;
  subjects: BulkSubjectItem[];
  gradingScale: GradingScaleDefinition;
}

interface RowState {
  subjectId: string;
  mode: GradeEntryMode;
  gradeLetter: string;
  marksObtained: string;
  maxMarks: string;
}

export function BulkGradeModal({
  open,
  onOpenChange,
  semesterName,
  subjects,
  gradingScale,
}: BulkGradeModalProps) {
  const { toast } = useToast();
  const router = useRouter();

  const [edits, setEdits] = React.useState<Record<string, Partial<RowState>>>({});
  const [globalMode, setGlobalMode] = React.useState<GradeEntryMode>("GRADE");
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const getRowState = React.useCallback(
    (sub: BulkSubjectItem): RowState => {
      const edit = edits[sub.id];
      const hasMarks = sub.grade?.marksObtained !== null && sub.grade?.marksObtained !== undefined;
      const hasGrade = !!sub.grade?.gradeLetter;
      let defaultMode: GradeEntryMode = globalMode;
      if (hasMarks && hasGrade) defaultMode = "BOTH";
      else if (hasMarks && !hasGrade) defaultMode = "MARKS";

      return {
        subjectId: sub.id,
        mode: edit?.mode ?? defaultMode,
        gradeLetter: edit?.gradeLetter !== undefined ? edit.gradeLetter : (sub.grade?.gradeLetter || ""),
        marksObtained:
          edit?.marksObtained !== undefined
            ? edit.marksObtained
            : hasMarks
            ? String(sub.grade!.marksObtained)
            : "",
        maxMarks:
          edit?.maxMarks !== undefined
            ? edit.maxMarks
            : sub.grade?.maxMarks
            ? String(sub.grade.maxMarks)
            : "100",
      };
    },
    [edits, globalMode]
  );

  const updateRow = (subjectId: string, updates: Partial<RowState>) => {
    setEdits((prev) => ({
      ...prev,
      [subjectId]: {
        ...prev[subjectId],
        ...updates,
      },
    }));
  };

  const setAllModes = (mode: GradeEntryMode) => {
    setGlobalMode(mode);
    setEdits((prev) => {
      const updated = { ...prev };
      subjects.forEach((sub) => {
        updated[sub.id] = { ...updated[sub.id], mode };
      });
      return updated;
    });
  };

  // Derive calculations for every row
  const rowMetrics = React.useMemo(() => {
    const metrics: Record<
      string,
      {
        gradeLetter: string | null;
        gradePoint: number | null;
        qualityPoints: number | null;
        conflict: string | null;
        isValid: boolean;
      }
    > = {};

    subjects.forEach((sub) => {
      const state = getRowState(sub);

      const mode = state.mode;
      const numMarks = state.marksObtained !== "" ? parseFloat(state.marksObtained) : null;
      const numMax = state.maxMarks !== "" ? parseFloat(state.maxMarks) : 100.0;

      if (mode === "GRADE") {
        const pt = resolveGradePoint(state.gradeLetter, gradingScale);
        const qp = pt !== null && !sub.isAudit ? sub.creditHours * pt : null;
        metrics[sub.id] = {
          gradeLetter: state.gradeLetter || null,
          gradePoint: pt,
          qualityPoints: qp,
          conflict: null,
          isValid: true,
        };
      } else if (mode === "MARKS") {
        if (numMarks !== null && !isNaN(numMarks) && numMax > 0) {
          const mapping = resolveGradeFromMarks(numMarks, numMax, gradingScale);
          const pt = mapping?.points ?? null;
          const qp = pt !== null && !sub.isAudit ? sub.creditHours * pt : null;
          metrics[sub.id] = {
            gradeLetter: mapping?.letter || null,
            gradePoint: pt,
            qualityPoints: qp,
            conflict: numMarks > numMax ? "Marks exceed maximum marks." : null,
            isValid: numMarks <= numMax,
          };
        } else {
          metrics[sub.id] = { gradeLetter: null, gradePoint: null, qualityPoints: null, conflict: null, isValid: true };
        }
      } else {
        // BOTH mode
        if (numMarks !== null && !isNaN(numMarks) && state.gradeLetter) {
          const check = validateMarksAndGrade(numMarks, numMax, state.gradeLetter, gradingScale);
          const pt = check.expectedGradePoint;
          const qp = pt !== null && !sub.isAudit ? sub.creditHours * pt : null;
          metrics[sub.id] = {
            gradeLetter: check.expectedGradeLetter,
            gradePoint: pt,
            qualityPoints: qp,
            conflict: check.isContradictory ? (check.conflictReason || "Contradiction detected.") : null,
            isValid: check.isValid && !check.isContradictory,
          };
        } else {
          metrics[sub.id] = { gradeLetter: null, gradePoint: null, qualityPoints: null, conflict: null, isValid: true };
        }
      }
    });

    return metrics;
  }, [subjects, getRowState, gradingScale]);

  // Compute live projected SGPA across all subjects
  const projectedMetrics = React.useMemo(() => {
    const calcInputs: SubjectCreditGrade[] = subjects.map((sub) => {
      const metric = rowMetrics[sub.id];
      return {
        id: sub.id,
        name: sub.name,
        creditHours: sub.creditHours,
        isAudit: sub.isAudit,
        gradePoint: metric?.gradePoint ?? sub.grade?.gradePoint ?? null,
      };
    });

    return calculateSGPA(calcInputs);
  }, [subjects, rowMetrics]);

  // Submission
  const handleSaveAll = async () => {
    setServerError(null);

    // Identify rows that have entered data
    const payloadItems = [];
    for (const sub of subjects) {
      const state = getRowState(sub);

      const metric = rowMetrics[sub.id];
      if (metric?.conflict) {
        setServerError(`Please resolve the conflict for ${sub.name}: ${metric.conflict}`);
        return;
      }

      const numMarks = state.marksObtained !== "" ? parseFloat(state.marksObtained) : null;
      const numMax = state.maxMarks !== "" ? parseFloat(state.maxMarks) : 100.0;

      // Only submit rows where something was selected/entered
      const hasInput =
        (state.mode === "GRADE" && state.gradeLetter) ||
        (state.mode === "MARKS" && numMarks !== null) ||
        (state.mode === "BOTH" && (state.gradeLetter || numMarks !== null));

      if (hasInput) {
        payloadItems.push({
          subjectId: sub.id,
          mode: state.mode,
          gradeLetter: state.gradeLetter || null,
          marksObtained: numMarks,
          maxMarks: numMax,
        });
      }
    }

    if (payloadItems.length === 0) {
      setServerError("Please enter a grade or marks for at least one subject.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await bulkSaveSubjectGrades({ grades: payloadItems });
      if (res.success) {
        toast({
          title: "Results Saved",
          description: `Successfully saved results for ${payloadItems.length} subjects in ${semesterName}.`,
          type: "success",
        });
        onOpenChange(false);
        router.refresh();
      } else {
        setServerError(res.error || "Failed to save results.");
      }
    } catch {
      setServerError("An unexpected error occurred while saving academic results.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const gradeOptions = [
    { label: "-- Select --", value: "" },
    ...gradingScale.mappings.map((m) => ({
      label: `${m.letter} (${m.points.toFixed(1)} pts)`,
      value: m.letter,
    })),
  ];

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setServerError(null);
      setEdits({});
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} className="max-w-4xl w-[95vw]">
      <DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
          <DialogTitle className="text-lg font-bold">Enter Results in Bulk — {semesterName}</DialogTitle>
          <div className="flex items-center gap-1.5 bg-[var(--bg-surface-elevated)] p-1 rounded-lg border border-[var(--border-subtle)] text-xs">
            <span className="text-[var(--text-secondary)] px-2 font-medium">Batch Mode:</span>
            {(["GRADE", "MARKS", "BOTH"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setAllModes(m)}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  globalMode === m
                    ? "bg-[var(--brand-primary)] text-white shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {m === "GRADE" ? "Direct Grade" : m === "MARKS" ? "Marks" : "Both"}
              </button>
            ))}
          </div>
        </div>
        <DialogDescription>
          Record academic results for all subjects on a single screen using {gradingScale.name}.
        </DialogDescription>
      </DialogHeader>

      {serverError && (
        <div
          role="alert"
          className="rounded-lg border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10 p-3 text-xs text-[var(--accent-danger)] font-medium"
        >
          {serverError}
        </div>
      )}

      {/* Spreadsheet Results Table */}
      <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] max-h-[50vh]">
        <table className="w-full text-xs text-left border-collapse min-w-[700px]">
          <thead className="sticky top-0 bg-[var(--bg-surface-elevated)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)] uppercase tracking-wider font-semibold z-10">
            <tr>
              <th className="py-2.5 px-3">Subject</th>
              <th className="py-2.5 px-3 w-16 text-center">Credits</th>
              <th className="py-2.5 px-3 w-28">Mode</th>
              <th className="py-2.5 px-3 w-32">Grade</th>
              <th className="py-2.5 px-3 w-24">Marks</th>
              <th className="py-2.5 px-3 w-20">Max</th>
              <th className="py-2.5 px-3 w-20 text-center">Points</th>
              <th className="py-2.5 px-3 w-24 text-center">Quality Pts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {subjects.map((sub) => {
              const state = getRowState(sub);
              const metric = rowMetrics[sub.id];

              return (
                <tr
                  key={sub.id}
                  className={`hover:bg-[var(--bg-surface-elevated)]/50 transition-colors ${
                    metric?.conflict ? "bg-[var(--accent-danger)]/5" : ""
                  }`}
                >
                  <td className="py-2 px-3">
                    <div className="font-medium text-[var(--text-primary)]">{sub.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {sub.code && <span className="font-mono text-[var(--text-muted)]">{sub.code}</span>}
                      {sub.isAudit && <Badge variant="secondary">Audit</Badge>}
                    </div>
                    {metric?.conflict && (
                      <div className="text-[11px] text-[var(--accent-danger)] mt-1 font-medium">
                        &bull; {metric.conflict}
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center tabular-nums font-semibold">
                    {sub.creditHours.toFixed(1)}
                  </td>
                  <td className="py-1.5 px-2">
                    <select
                      value={state.mode}
                      onChange={(e) => updateRow(sub.id, { mode: e.target.value as GradeEntryMode })}
                      className="w-full h-8 px-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                    >
                      <option value="GRADE">Grade</option>
                      <option value="MARKS">Marks</option>
                      <option value="BOTH">Both</option>
                    </select>
                  </td>
                  <td className="py-1.5 px-2">
                    {state.mode === "MARKS" ? (
                      <div className="h-8 px-2 flex items-center bg-[var(--bg-surface-elevated)] rounded border border-[var(--border-subtle)] font-semibold text-[var(--text-primary)]">
                        {metric?.gradeLetter || "— (Auto)"}
                      </div>
                    ) : (
                      <select
                        value={state.gradeLetter}
                        onChange={(e) => updateRow(sub.id, { gradeLetter: e.target.value })}
                        className="w-full h-8 px-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                      >
                        {gradeOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="py-1.5 px-2">
                    {state.mode === "GRADE" ? (
                      <span className="text-[var(--text-muted)] px-2">—</span>
                    ) : (
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        placeholder="Marks"
                        value={state.marksObtained}
                        onChange={(e) => updateRow(sub.id, { marksObtained: e.target.value })}
                        className="w-full h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-xs text-center tabular-nums text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                      />
                    )}
                  </td>
                  <td className="py-1.5 px-2">
                    {state.mode === "GRADE" ? (
                      <span className="text-[var(--text-muted)] px-2">—</span>
                    ) : (
                      <input
                        type="number"
                        min="1"
                        placeholder="100"
                        value={state.maxMarks}
                        onChange={(e) => updateRow(sub.id, { maxMarks: e.target.value })}
                        className="w-full h-8 px-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-xs text-center tabular-nums text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                      />
                    )}
                  </td>
                  <td className="py-2 px-3 text-center tabular-nums font-mono font-bold text-[var(--brand-primary)]">
                    {metric?.gradePoint !== null && metric?.gradePoint !== undefined
                      ? metric.gradePoint.toFixed(1)
                      : "—"}
                  </td>
                  <td className="py-2 px-3 text-center tabular-nums font-mono">
                    {metric?.qualityPoints !== null && metric?.qualityPoints !== undefined
                      ? metric.qualityPoints.toFixed(1)
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary Footer with Live SGPA */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[var(--bg-surface-elevated)] rounded-lg border border-[var(--border-subtle)] text-xs">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-[var(--text-secondary)]">Total Credits: </span>
            <span className="font-semibold text-[var(--text-primary)] tabular-nums">
              {projectedMetrics.totalCreditBearingCredits.toFixed(1)}
            </span>
          </div>
          <div>
            <span className="text-[var(--text-secondary)]">Total Quality Points: </span>
            <span className="font-semibold text-[var(--text-primary)] tabular-nums">
              {projectedMetrics.totalQualityPoints.toFixed(1)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-secondary)] font-medium">Projected SGPA:</span>
          <span className="text-base font-bold text-[var(--brand-primary)] tabular-nums">
            {projectedMetrics.sgpa !== null ? projectedMetrics.sgpa.toFixed(2) : "N/A"}
          </span>
        </div>
      </div>

      <DialogFooter className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--border-subtle)]">
        <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSaveAll}
          disabled={isSubmitting}
          className="min-w-[140px]"
        >
          {isSubmitting ? "Saving Results..." : "Save All Results"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
