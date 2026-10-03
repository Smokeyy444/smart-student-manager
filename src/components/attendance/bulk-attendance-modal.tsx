"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { bulkUpdateAttendance } from "@/lib/actions/academic";
import {
  calculateAttendancePercentage,
  calculateAttendanceStatus,
  calculateBunkBuffer,
  calculateRecoveryClasses,
} from "@/lib/calculations/attendance";

interface AttendanceSubjectItem {
  id: string;
  name: string;
  code?: string | null;
  customAttendanceTarget?: number | null;
  attendance?: {
    classesAttended: number;
    classesConducted: number;
  } | null;
}

interface BulkAttendanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  semesterName: string;
  subjects: AttendanceSubjectItem[];
  defaultTargetPercentage?: number;
}

interface AttendanceRowState {
  subjectId: string;
  attended: string;
  conducted: string;
}

export function BulkAttendanceModal({
  open,
  onOpenChange,
  semesterName,
  subjects,
  defaultTargetPercentage = 75.0,
}: BulkAttendanceModalProps) {
  const { toast } = useToast();
  const router = useRouter();

  const [edits, setEdits] = React.useState<Record<string, { attended?: string; conducted?: string }>>({});
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const getRowState = React.useCallback(
    (sub: AttendanceSubjectItem): AttendanceRowState => {
      const edit = edits[sub.id];
      return {
        subjectId: sub.id,
        attended:
          edit?.attended !== undefined
            ? edit.attended
            : sub.attendance
            ? String(sub.attendance.classesAttended)
            : "0",
        conducted:
          edit?.conducted !== undefined
            ? edit.conducted
            : sub.attendance
            ? String(sub.attendance.classesConducted)
            : "0",
      };
    },
    [edits]
  );

  const updateRow = (subjectId: string, updates: Partial<{ attended: string; conducted: string }>) => {
    setEdits((prev) => ({
      ...prev,
      [subjectId]: {
        ...prev[subjectId],
        ...updates,
      },
    }));
  };

  // Derive attendance calculations live for each row
  const rowMetrics = React.useMemo(() => {
    const metrics: Record<
      string,
      {
        percentage: number;
        status: "ON_TRACK" | "WARNING" | "CRITICAL" | "NEUTRAL";
        bunkBuffer: number;
        recoveryNeeded: number;
        isValid: boolean;
        error: string | null;
      }
    > = {};

    subjects.forEach((sub) => {
      const state = getRowState(sub);
      const attended = parseInt(state.attended, 10);
      const conducted = parseInt(state.conducted, 10);
      const target = sub.customAttendanceTarget ?? defaultTargetPercentage;

      if (isNaN(attended) || attended < 0) {
        metrics[sub.id] = { percentage: 0, status: "NEUTRAL", bunkBuffer: 0, recoveryNeeded: 0, isValid: false, error: "Attended classes cannot be negative." };
        return;
      }
      if (isNaN(conducted) || conducted < 0) {
        metrics[sub.id] = { percentage: 0, status: "NEUTRAL", bunkBuffer: 0, recoveryNeeded: 0, isValid: false, error: "Conducted classes cannot be negative." };
        return;
      }
      if (attended > conducted) {
        metrics[sub.id] = {
          percentage: 0,
          status: "CRITICAL",
          bunkBuffer: 0,
          recoveryNeeded: 0,
          isValid: false,
          error: `Attended (${attended}) cannot exceed conducted (${conducted}).`,
        };
        return;
      }

      const percentage = calculateAttendancePercentage(attended, conducted);
      const status = calculateAttendanceStatus(percentage, target, conducted);
      const bunkBuffer = calculateBunkBuffer(attended, conducted, target);
      const recovery = calculateRecoveryClasses(attended, conducted, target);

      metrics[sub.id] = {
        percentage,
        status,
        bunkBuffer: isFinite(bunkBuffer) ? bunkBuffer : 0,
        recoveryNeeded: recovery.classesRequired,
        isValid: true,
        error: null,
      };
    });

    return metrics;
  }, [subjects, getRowState, defaultTargetPercentage]);

  const handleSaveAll = async () => {
    setServerError(null);

    const records = [];
    for (const sub of subjects) {
      const state = getRowState(sub);
      if (!state) continue;

      const metric = rowMetrics[sub.id];
      if (!metric.isValid) {
        setServerError(`Please fix validation error on '${sub.name}': ${metric.error}`);
        return;
      }

      records.push({
        subjectId: sub.id,
        classesAttended: parseInt(state.attended, 10),
        classesConducted: parseInt(state.conducted, 10),
      });
    }

    if (records.length === 0) {
      setServerError("No attendance records to update.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await bulkUpdateAttendance({ records });
      if (res.success) {
        toast({
          title: "Attendance Updated",
          description: `Successfully updated attendance for ${records.length} subjects in ${semesterName}.`,
          type: "success",
        });
        onOpenChange(false);
        router.refresh();
      } else {
        setServerError(res.error || "Failed to save attendance.");
      }
    } catch {
      setServerError("An unexpected error occurred while saving attendance.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
        <DialogTitle className="text-lg font-bold">Bulk Attendance Entry — {semesterName}</DialogTitle>
        <DialogDescription>
          Quickly enter attended and conducted counts across all subjects. Bunk buffers and recovery goals update live.
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

      {/* Attendance Spreadsheet Grid */}
      <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] max-h-[50vh]">
        <table className="w-full text-xs text-left border-collapse min-w-[700px]">
          <thead className="sticky top-0 bg-[var(--bg-surface-elevated)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)] uppercase tracking-wider font-semibold z-10">
            <tr>
              <th className="py-2.5 px-3">Subject</th>
              <th className="py-2.5 px-3 w-28 text-center">Attended</th>
              <th className="py-2.5 px-3 w-28 text-center">Conducted</th>
              <th className="py-2.5 px-3 w-24 text-center">Attendance %</th>
              <th className="py-2.5 px-3 w-24 text-center">Status</th>
              <th className="py-2.5 px-3 w-36">Margin & Advice</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {subjects.map((sub) => {
              const state = getRowState(sub);
              const metric = rowMetrics[sub.id];
              const target = sub.customAttendanceTarget ?? defaultTargetPercentage;

              return (
                <tr
                  key={sub.id}
                  className={`hover:bg-[var(--bg-surface-elevated)]/50 transition-colors ${
                    !metric?.isValid ? "bg-[var(--accent-danger)]/5" : ""
                  }`}
                >
                  <td className="py-2.5 px-3">
                    <div className="font-medium text-[var(--text-primary)]">{sub.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-[var(--text-secondary)]">
                      {sub.code && <span className="font-mono">{sub.code}</span>}
                      <span>&bull; Target: {target}%</span>
                    </div>
                    {metric?.error && (
                      <div className="text-[11px] text-[var(--accent-danger)] mt-1 font-medium">
                        &bull; {metric.error}
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    <input
                      type="number"
                      min="0"
                      value={state.attended}
                      onChange={(e) => updateRow(sub.id, { attended: e.target.value })}
                      className="w-20 h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-xs text-center tabular-nums text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                    />
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    <input
                      type="number"
                      min="0"
                      value={state.conducted}
                      onChange={(e) => updateRow(sub.id, { conducted: e.target.value })}
                      className="w-20 h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-xs text-center tabular-nums text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                    />
                  </td>
                  <td className="py-2 px-3 text-center tabular-nums font-mono font-bold text-sm">
                    {metric?.isValid ? `${metric.percentage.toFixed(1)}%` : "—"}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {metric?.status === "ON_TRACK" && (
                      <Badge variant="default" className="bg-[var(--accent-success)]/15 text-[var(--accent-success)] border-[var(--accent-success)]/30">
                        On Track
                      </Badge>
                    )}
                    {metric?.status === "WARNING" && (
                      <Badge variant="default" className="bg-[var(--accent-warning)]/15 text-[var(--accent-warning)] border-[var(--accent-warning)]/30">
                        Warning
                      </Badge>
                    )}
                    {metric?.status === "CRITICAL" && (
                      <Badge variant="default" className="bg-[var(--accent-danger)]/15 text-[var(--accent-danger)] border-[var(--accent-danger)]/30">
                        Critical
                      </Badge>
                    )}
                    {metric?.status === "NEUTRAL" && (
                      <Badge variant="secondary">No Classes</Badge>
                    )}
                  </td>
                  <td className="py-2 px-3 text-xs">
                    {metric?.isValid && metric.status === "ON_TRACK" && (
                      <span className="text-[var(--accent-success)] font-medium">
                        Can bunk {metric.bunkBuffer} {metric.bunkBuffer === 1 ? "class" : "classes"}
                      </span>
                    )}
                    {metric?.isValid && (metric.status === "WARNING" || metric.status === "CRITICAL") && (
                      <span className="text-[var(--accent-danger)] font-medium">
                        Must attend {metric.recoveryNeeded} {metric.recoveryNeeded === 1 ? "class" : "classes"}
                      </span>
                    )}
                    {metric?.status === "NEUTRAL" && <span className="text-[var(--text-muted)]">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
          {isSubmitting ? "Saving Attendance..." : "Save All Records"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
