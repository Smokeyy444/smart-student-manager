"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { AttendanceAggregateModal } from "./attendance-aggregate-modal";
import { AttendanceLogModal } from "./attendance-log-modal";
import { quickUpdateAttendance, resetAttendance } from "@/lib/actions/attendance";
import {
  calculateAttendancePercentage,
  calculateAttendanceStatus,
  calculateBunkBuffer,
  calculateRecoveryClasses,
} from "@/lib/calculations/attendance";
import {
  CheckCircle2,
  XCircle,
  Edit2,
  RotateCcw,
  Calendar,
  MoreVertical,
} from "lucide-react";

interface AttendanceSubjectCardProps {
  subjectId: string;
  subjectName: string;
  subjectCode?: string | null;
  creditHours: number;
  category: string;
  isAudit: boolean;
  classesAttended: number;
  classesConducted: number;
  targetPercentage: number;
}

export function AttendanceSubjectCard({
  subjectId,
  subjectName,
  subjectCode,
  creditHours,
  category,
  isAudit,
  classesAttended,
  classesConducted,
  targetPercentage,
}: AttendanceSubjectCardProps) {
  const { toast } = useToast();
  const router = useRouter();

  // Modal states
  const [aggregateModalOpen, setAggregateModalOpen] = React.useState(false);
  const [logModalOpen, setLogModalOpen] = React.useState(false);
  const [resetDialogOpen, setResetDialogOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isResetting, setIsResetting] = React.useState(false);

  const menuRef = React.useRef<HTMLDivElement>(null);

  // Close menu on outside click
  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  // ─── Calculated metrics ────────────────────────────────────────────────────

  const notStarted = classesConducted === 0;
  const pct = notStarted ? 0 : calculateAttendancePercentage(classesAttended, classesConducted);
  const status = notStarted
    ? "NEUTRAL"
    : calculateAttendanceStatus(pct, targetPercentage, classesConducted);
  const bunkBuffer = notStarted ? null : calculateBunkBuffer(classesAttended, classesConducted, targetPercentage);
  const recoveryInfo = notStarted ? null : calculateRecoveryClasses(classesAttended, classesConducted, targetPercentage);

  // ─── Status style helpers ──────────────────────────────────────────────────

  const statusColors = {
    ON_TRACK: {
      bg: "bg-[var(--accent-success)]/10",
      border: "border-[var(--accent-success)]/30",
      text: "text-[var(--accent-success)]",
      progress: "bg-[var(--accent-success)]",
      ring: "stroke-[var(--accent-success)]",
    },
    WARNING: {
      bg: "bg-[var(--accent-warning)]/10",
      border: "border-[var(--accent-warning)]/30",
      text: "text-[var(--accent-warning)]",
      progress: "bg-[var(--accent-warning)]",
      ring: "stroke-[var(--accent-warning)]",
    },
    CRITICAL: {
      bg: "bg-[var(--accent-danger)]/10",
      border: "border-[var(--accent-danger)]/30",
      text: "text-[var(--accent-danger)]",
      progress: "bg-[var(--accent-danger)]",
      ring: "stroke-[var(--accent-danger)]",
    },
    NEUTRAL: {
      bg: "bg-[var(--border-subtle)]/30",
      border: "border-[var(--border-subtle)]",
      text: "text-[var(--text-muted)]",
      progress: "bg-[var(--border-subtle)]",
      ring: "stroke-[var(--border-subtle)]",
    },
  };
  const sc = statusColors[status];

  // ─── SVG circular progress ─────────────────────────────────────────────────

  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const progressOffset = notStarted ? circumference : circumference - (pct / 100) * circumference;

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleQuick = async (action: "PRESENT" | "ABSENT") => {
    setIsLoading(true);
    try {
      const res = await quickUpdateAttendance({ subjectId, action });
      if (res.success) {
        toast({
          title: action === "PRESENT" ? "Marked Present" : "Marked Absent",
          description: `${subjectName}: quick update saved.`,
          type: "success",
        });
        router.refresh();
      } else {
        toast({ title: "Error", description: res.error || "Failed to update.", type: "error" });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      const res = await resetAttendance({ subjectId });
      if (res.success) {
        toast({
          title: "Attendance Reset",
          description: `${subjectName}: all attendance data cleared.`,
          type: "success",
        });
        setResetDialogOpen(false);
        router.refresh();
      } else {
        toast({ title: "Error", description: res.error || "Failed to reset.", type: "error" });
      }
    } finally {
      setIsResetting(false);
    }
  };

  const categoryLabel: Record<string, string> = {
    CORE: "Core",
    ELECTIVE: "Elective",
    LAB: "Lab",
    AUDIT: "Audit",
  };

  return (
    <>
      <div
        className={`rounded-xl border p-5 bg-[var(--bg-surface)] transition-all hover:shadow-md hover:shadow-black/5 ${sc.border} relative overflow-hidden`}
      >
        {/* Status accent strip */}
        <div
          className={`absolute inset-y-0 left-0 w-1 rounded-l-xl ${sc.progress}`}
          aria-hidden="true"
        />

        <div className="pl-3">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                {subjectCode && (
                  <span className="font-mono text-[10px] text-[var(--text-muted)] bg-[var(--border-subtle)] px-1.5 py-0.5 rounded">
                    {subjectCode}
                  </span>
                )}
                <Badge variant="secondary" className="text-[10px]">
                  {categoryLabel[category] ?? category}
                </Badge>
                {isAudit && (
                  <Badge variant="secondary" className="text-[10px]">
                    Audit
                  </Badge>
                )}
              </div>
              <h3 className="mt-1 text-sm font-semibold text-[var(--text-primary)] leading-snug line-clamp-2">
                {subjectName}
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {creditHours} cr • Target: {targetPercentage}%
              </p>
            </div>

            {/* Circular progress */}
            <div className="flex-shrink-0">
              <div className="relative h-[68px] w-[68px] flex items-center justify-center">
                <svg
                  className="rotate-[-90deg]"
                  width="68"
                  height="68"
                  viewBox="0 0 68 68"
                  aria-hidden="true"
                >
                  {/* Background ring */}
                  <circle
                    cx="34"
                    cy="34"
                    r={radius}
                    fill="none"
                    stroke="var(--border-subtle)"
                    strokeWidth="5"
                  />
                  {/* Progress ring */}
                  <circle
                    cx="34"
                    cy="34"
                    r={radius}
                    fill="none"
                    className={sc.ring}
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={progressOffset}
                    style={{ transition: "stroke-dashoffset 0.5s ease" }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  {notStarted ? (
                    <span className="text-[10px] text-[var(--text-muted)] font-medium">–</span>
                  ) : (
                    <>
                      <span className={`text-[13px] font-bold tabular-nums leading-none ${sc.text}`}>
                        {pct.toFixed(0)}%
                      </span>
                      <span className="text-[9px] text-[var(--text-muted)] leading-none mt-0.5">
                        {classesAttended}/{classesConducted}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Status / advice strip */}
          <div className={`mt-3 rounded-lg px-3 py-2 ${sc.bg} border ${sc.border}`}>
            {notStarted ? (
              <p className="text-xs text-[var(--text-muted)]">
                No classes recorded yet. Use quick buttons below to start tracking.
              </p>
            ) : status === "ON_TRACK" ? (
              <p className="text-xs text-[var(--accent-success)] font-medium">
                ✓ On track — can miss{" "}
                <span className="font-bold">
                  {bunkBuffer} more {bunkBuffer === 1 ? "class" : "classes"}
                </span>{" "}
                before falling below {targetPercentage}%
              </p>
            ) : (
              <p className={`text-xs font-medium ${sc.text}`}>
                {status === "CRITICAL" ? "✗ Critical" : "⚠ Warning"} — need{" "}
                <span className="font-bold">
                  {recoveryInfo?.classesRequired}{" "}
                  {recoveryInfo?.classesRequired === 1 ? "class" : "more classes"}
                </span>{" "}
                in a row to reach {targetPercentage}%
              </p>
            )}
          </div>

          {/* Quick action buttons */}
          {!isAudit && (
            <div className="mt-3 flex items-center gap-2">
              <button
                id={`present-btn-${subjectId}`}
                onClick={() => handleQuick("PRESENT")}
                disabled={isLoading}
                aria-label={`Mark present in ${subjectName}`}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold border border-[var(--accent-success)]/30 bg-[var(--accent-success)]/10 text-[var(--accent-success)] hover:bg-[var(--accent-success)]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                + Present
              </button>
              <button
                id={`absent-btn-${subjectId}`}
                onClick={() => handleQuick("ABSENT")}
                disabled={isLoading}
                aria-label={`Mark absent in ${subjectName}`}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10 text-[var(--accent-danger)] hover:bg-[var(--accent-danger)]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <XCircle className="h-3.5 w-3.5 flex-shrink-0" />
                + Absent
              </button>

              {/* Actions menu */}
              <div className="relative" ref={menuRef}>
                <button
                  id={`actions-menu-btn-${subjectId}`}
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label={`More actions for ${subjectName}`}
                  className="flex items-center justify-center h-8 w-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)] transition-all"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>

                {menuOpen && (
                  <div className="absolute right-0 bottom-10 z-20 min-w-[180px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xl py-1">
                    <button
                      onClick={() => { setMenuOpen(false); setAggregateModalOpen(true); }}
                      className="flex items-center gap-2.5 w-full px-3.5 py-2 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition-colors"
                    >
                      <Edit2 className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                      Edit Aggregate
                    </button>
                    <button
                      onClick={() => { setMenuOpen(false); setLogModalOpen(true); }}
                      className="flex items-center gap-2.5 w-full px-3.5 py-2 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition-colors"
                    >
                      <Calendar className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                      View Log
                    </button>
                    <div className="my-1 border-t border-[var(--border-subtle)]" />
                    <button
                      onClick={() => { setMenuOpen(false); setResetDialogOpen(true); }}
                      className="flex items-center gap-2.5 w-full px-3.5 py-2 text-xs text-[var(--accent-danger)] hover:bg-[var(--accent-danger)]/10 transition-colors"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reset Attendance
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Audit: only show edit and log buttons */}
          {isAudit && (
            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAggregateModalOpen(true)}
                className="flex-1 gap-1.5 text-xs"
              >
                <Edit2 className="h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLogModalOpen(true)}
                className="flex-1 gap-1.5 text-xs"
              >
                <Calendar className="h-3.5 w-3.5" />
                Log
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setResetDialogOpen(true)}
                className="text-[var(--accent-danger)] hover:bg-[var(--accent-danger)]/10 text-xs px-2"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <AttendanceAggregateModal
        open={aggregateModalOpen}
        onOpenChange={setAggregateModalOpen}
        subjectId={subjectId}
        subjectName={subjectName}
        subjectCode={subjectCode}
        currentAttended={classesAttended}
        currentConducted={classesConducted}
        targetPercentage={targetPercentage}
      />
      <AttendanceLogModal
        open={logModalOpen}
        onOpenChange={setLogModalOpen}
        subjectId={subjectId}
        subjectName={subjectName}
        subjectCode={subjectCode}
      />
      <ConfirmDialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        title={`Reset Attendance — ${subjectName}`}
        description="This will permanently clear all attendance records and logs for this subject, resetting the count to 0/0. This action cannot be undone."
        confirmText="Reset Everything"
        cancelText="Cancel"
        variant="danger"
        isLoading={isResetting}
        onConfirm={handleReset}
      />
    </>
  );
}
