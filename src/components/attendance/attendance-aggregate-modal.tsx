"use client";

import * as React from "react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { updateAggregateAttendance } from "@/lib/actions/attendance";
import {
  calculateAttendancePercentage,
  calculateAttendanceStatus,
  calculateBunkBuffer,
  calculateRecoveryClasses,
} from "@/lib/calculations/attendance";

interface AttendanceAggregateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  subjectName: string;
  subjectCode?: string | null;
  currentAttended: number;
  currentConducted: number;
  targetPercentage: number;
}

export function AttendanceAggregateModal({
  open,
  onOpenChange,
  subjectId,
  subjectName,
  subjectCode,
  currentAttended,
  currentConducted,
  targetPercentage,
}: AttendanceAggregateModalProps) {
  const { toast } = useToast();
  const router = useRouter();

  const [attended, setAttended] = React.useState(String(currentAttended));
  const [conducted, setConducted] = React.useState(String(currentConducted));
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setAttended(String(currentAttended));
      setConducted(String(currentConducted));
      setFieldError(null);
    }
  }

  const attendedNum = parseInt(attended, 10);
  const conductedNum = parseInt(conducted, 10);
  const isValid =
    !isNaN(attendedNum) &&
    !isNaN(conductedNum) &&
    attendedNum >= 0 &&
    conductedNum >= 0 &&
    attendedNum <= conductedNum;

  const liveMetrics = React.useMemo(() => {
    if (!isValid || conductedNum < 0) return null;
    const pct = calculateAttendancePercentage(attendedNum, conductedNum);
    const status = calculateAttendanceStatus(pct, targetPercentage, conductedNum);
    const bunk = calculateBunkBuffer(attendedNum, conductedNum, targetPercentage);
    const recovery = calculateRecoveryClasses(attendedNum, conductedNum, targetPercentage);
    return { pct, status, bunk, recovery };
  }, [attendedNum, conductedNum, isValid, targetPercentage]);

  const handleSave = async () => {
    setFieldError(null);
    if (!isValid) {
      setFieldError("Classes attended cannot exceed classes conducted, and both must be non-negative integers.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await updateAggregateAttendance({
        subjectId,
        classesAttended: attendedNum,
        classesConducted: conductedNum,
      });

      if (res.success) {
        toast({
          title: "Attendance Updated",
          description: `${subjectName}: ${attendedNum}/${conductedNum} saved.`,
          type: "success",
        });
        onOpenChange(false);
        router.refresh();
      } else {
        setFieldError(res.error || "Failed to save attendance.");
      }
    } catch {
      setFieldError("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusVariant = {
    ON_TRACK: "text-[var(--accent-success)]",
    WARNING: "text-[var(--accent-warning)]",
    CRITICAL: "text-[var(--accent-danger)]",
    NEUTRAL: "text-[var(--text-muted)]",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Edit Attendance — {subjectName}</DialogTitle>
        <DialogDescription>
          {subjectCode && <span className="font-mono text-xs mr-2">{subjectCode}</span>}
          Update the aggregate attended and conducted counts. This does not create
          detailed log entries.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        {fieldError && (
          <div
            role="alert"
            className="rounded-lg border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10 p-3 text-xs text-[var(--accent-danger)] font-medium"
          >
            {fieldError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor={`att-attended-${subjectId}`} className="text-xs font-semibold text-[var(--text-secondary)]">
              Classes Attended
            </label>
            <input
              id={`att-attended-${subjectId}`}
              type="number"
              min="0"
              value={attended}
              onChange={(e) => setAttended(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-base tabular-nums text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
              aria-label="Classes attended"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`att-conducted-${subjectId}`} className="text-xs font-semibold text-[var(--text-secondary)]">
              Classes Conducted
            </label>
            <input
              id={`att-conducted-${subjectId}`}
              type="number"
              min="0"
              value={conducted}
              onChange={(e) => setConducted(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-base tabular-nums text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
              aria-label="Classes conducted"
            />
          </div>
        </div>

        {liveMetrics && isValid && (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Live Preview
              </span>
              <span className={`text-xs font-bold ${statusVariant[liveMetrics.status]}`}>
                {liveMetrics.status === "ON_TRACK" && "✓ On Track"}
                {liveMetrics.status === "WARNING" && "⚠ Warning"}
                {liveMetrics.status === "CRITICAL" && "✗ Critical"}
                {liveMetrics.status === "NEUTRAL" && "— Not Started"}
              </span>
            </div>

            <div className="space-y-2">
              {/* Progress bar */}
              {conductedNum > 0 ? (
                <div>
                  <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1">
                    <span>Attendance</span>
                    <span className="tabular-nums font-bold text-[var(--text-primary)]">
                      {liveMetrics.pct.toFixed(1)}%
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={Math.min(liveMetrics.pct, 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="w-full h-2.5 rounded-full bg-[var(--border-subtle)] overflow-hidden"
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        liveMetrics.status === "ON_TRACK"
                          ? "bg-[var(--accent-success)]"
                          : liveMetrics.status === "WARNING"
                          ? "bg-[var(--accent-warning)]"
                          : "bg-[var(--accent-danger)]"
                      }`}
                      style={{ width: `${Math.min(liveMetrics.pct, 100)}%` }}
                    />
                  </div>
                  {/* Target marker label */}
                  <div className="flex justify-end mt-0.5">
                    <span className="text-[10px] text-[var(--text-muted)]">Target: {targetPercentage}%</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)] italic">No classes conducted yet.</p>
              )}

              {/* Bunk / Recovery advice */}
              {conductedNum > 0 && (
                <div className="pt-1">
                  {liveMetrics.status === "ON_TRACK" ? (
                    <Badge variant="default" className="bg-[var(--accent-success)]/15 text-[var(--accent-success)] border-[var(--accent-success)]/30 text-xs">
                      You can miss {liveMetrics.bunk}{" "}
                      {liveMetrics.bunk === 1 ? "more class" : "more classes"} and stay at or above {targetPercentage}%.
                    </Badge>
                  ) : liveMetrics.status === "WARNING" || liveMetrics.status === "CRITICAL" ? (
                    <Badge variant="default" className="bg-[var(--accent-danger)]/15 text-[var(--accent-danger)] border-[var(--accent-danger)]/30 text-xs">
                      Attend the next {liveMetrics.recovery.classesRequired}{" "}
                      {liveMetrics.recovery.classesRequired === 1 ? "class" : "classes"} to reach {targetPercentage}%.
                    </Badge>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSubmitting || !isValid}
          isLoading={isSubmitting}
        >
          Save Attendance
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
