"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  subjectGradeSchema,
  type SubjectGradeInput,
  type GradeEntryMode,
} from "@/lib/validations/academic";
import { saveSubjectGrade, deleteSubjectGrade } from "@/lib/actions/academic";
import {
  resolveGradePoint,
  resolveGradeFromMarks,
  validateMarksAndGrade,
} from "@/lib/calculations/grading-scale";
import type { GradingScaleDefinition } from "@/lib/constants/grading";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Badge } from "../ui/badge";
import { useToast } from "../ui/toast";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Trash2 } from "lucide-react";

interface GradeEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: {
    id: string;
    name: string;
    code?: string | null;
    creditHours: number;
    isAudit: boolean;
    grade?: {
      gradeLetter?: string | null;
      gradePoint?: number | null;
      marksObtained?: number | null;
      maxMarks?: number | null;
    } | null;
  } | null;
  gradingScale: GradingScaleDefinition;
}

export function GradeEntryModal({
  open,
  onOpenChange,
  subject,
  gradingScale,
}: GradeEntryModalProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Determine initial mode based on existing data
  const initialMode: GradeEntryMode = React.useMemo(() => {
    if (!subject?.grade) return "GRADE";
    if (subject.grade.marksObtained !== null && subject.grade.gradeLetter) return "BOTH";
    if (subject.grade.marksObtained !== null) return "MARKS";
    return "GRADE";
  }, [subject]);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SubjectGradeInput>({
    resolver: zodResolver(subjectGradeSchema),
    defaultValues: {
      subjectId: subject?.id || "",
      mode: initialMode,
      gradeLetter: subject?.grade?.gradeLetter || "",
      marksObtained: subject?.grade?.marksObtained !== null && subject?.grade?.marksObtained !== undefined ? subject.grade.marksObtained : undefined,
      maxMarks: subject?.grade?.maxMarks || 100.0,
    },
  });

  const activeMode = useWatch({ control, name: "mode" });
  const watchedGradeLetter = useWatch({ control, name: "gradeLetter" });
  const watchedMarksObtained = useWatch({ control, name: "marksObtained" });
  const rawMaxMarks = useWatch({ control, name: "maxMarks" });
  const watchedMaxMarks: number = typeof rawMaxMarks === "number" && rawMaxMarks > 0 ? rawMaxMarks : 100.0;

  React.useEffect(() => {
    if (open && subject) {
      reset({
        subjectId: subject.id,
        mode: initialMode,
        gradeLetter: subject.grade?.gradeLetter || "",
        marksObtained: subject.grade?.marksObtained !== null && subject.grade?.marksObtained !== undefined ? subject.grade.marksObtained : undefined,
        maxMarks: subject.grade?.maxMarks || 100.0,
      });
    }
  }, [open, subject, initialMode, reset]);

  // Derived calculations for preview
  const livePreview = React.useMemo(() => {
    if (activeMode === "GRADE") {
      const pt = resolveGradePoint(watchedGradeLetter, gradingScale);
      return {
        gradeLetter: watchedGradeLetter,
        gradePoint: pt,
        percentage: null,
        qualityPoints: pt !== null ? (subject?.creditHours || 0) * pt : null,
        conflict: null,
      };
    } else if (activeMode === "MARKS") {
      if (typeof watchedMarksObtained === "number" && !isNaN(watchedMarksObtained)) {
        const mapping = resolveGradeFromMarks(watchedMarksObtained, watchedMaxMarks, gradingScale);
        const percentage = Math.round((watchedMarksObtained / watchedMaxMarks) * 1000) / 10;
        return {
          gradeLetter: mapping?.letter || null,
          gradePoint: mapping?.points ?? null,
          percentage,
          qualityPoints: mapping ? (subject?.creditHours || 0) * mapping.points : null,
          conflict: null,
        };
      }
      return { gradeLetter: null, gradePoint: null, percentage: null, qualityPoints: null, conflict: null };
    } else {
      // BOTH mode: validate consistency
      if (typeof watchedMarksObtained === "number" && !isNaN(watchedMarksObtained)) {
        const check = validateMarksAndGrade(watchedMarksObtained, watchedMaxMarks, watchedGradeLetter, gradingScale);
        const pt = check.expectedGradePoint;
        return {
          gradeLetter: check.expectedGradeLetter,
          gradePoint: pt,
          percentage: check.computedPercentage,
          qualityPoints: pt !== null ? (subject?.creditHours || 0) * pt : null,
          conflict: check.isContradictory ? check.conflictReason : null,
        };
      }
      return { gradeLetter: null, gradePoint: null, percentage: null, qualityPoints: null, conflict: null };
    }
  }, [activeMode, watchedGradeLetter, watchedMarksObtained, watchedMaxMarks, gradingScale, subject?.creditHours]);

  const onSubmit = async (data: SubjectGradeInput) => {
    setServerError(null);
    try {
      const res = await saveSubjectGrade(data);
      if (res.success) {
        toast({
          title: "Grade Saved",
          description: `Result for '${subject?.name}' updated successfully.`,
          type: "success",
        });
        onOpenChange(false);
        router.refresh();
      } else {
        setServerError(res.error || "Failed to record grade.");
      }
    } catch {
      setServerError("An unexpected error occurred while saving grade.");
    }
  };

  const handleDelete = async () => {
    if (!subject) return;
    setIsDeleting(true);
    try {
      const res = await deleteSubjectGrade(subject.id);
      if (res.success) {
        toast({
          title: "Grade Cleared",
          description: `Grade for '${subject.name}' has been cleared.`,
          type: "info",
        });
        onOpenChange(false);
        router.refresh();
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const gradeLetterOptions = [
    { label: "-- Select Grade Letter --", value: "" },
    ...gradingScale.mappings.map((m) => ({
      label: `${m.letter} (${m.points.toFixed(1)} Grade Points) - ${m.description || (m.isPassing ? "Pass" : "Fail")}`,
      value: m.letter,
    })),
  ];

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setServerError(null);
    }
    onOpenChange(newOpen);
  };

  if (!subject) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogHeader>
        <div className="flex items-center justify-between pr-6">
          <DialogTitle>Enter Academic Result</DialogTitle>
          <Badge variant={subject.isAudit ? "secondary" : "default"}>
            {subject.isAudit ? "Audit Course" : `${subject.creditHours} Credits`}
          </Badge>
        </div>
        <DialogDescription>
          Recording grade for <strong>{subject.name}</strong> {subject.code ? `(${subject.code})` : ""} using {gradingScale.name}.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {serverError && (
          <div
            role="alert"
            className="rounded-lg border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10 p-3 text-xs text-[var(--accent-danger)] font-medium"
          >
            {serverError}
          </div>
        )}

        {/* Mode Selector Tabs */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-[var(--text-secondary)]">
            Result Entry Method
          </label>
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-1">
            <button
              type="button"
              onClick={() => setValue("mode", "GRADE")}
              className={`rounded-md py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                activeMode === "GRADE"
                  ? "bg-[var(--bg-surface)] text-[var(--brand-primary)] shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Direct Grade
            </button>
            <button
              type="button"
              onClick={() => setValue("mode", "MARKS")}
              className={`rounded-md py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                activeMode === "MARKS"
                  ? "bg-[var(--bg-surface)] text-[var(--brand-primary)] shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Marks Scored
            </button>
            <button
              type="button"
              onClick={() => setValue("mode", "BOTH")}
              className={`rounded-md py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                activeMode === "BOTH"
                  ? "bg-[var(--bg-surface)] text-[var(--brand-primary)] shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Marks + Grade
            </button>
          </div>
        </div>

        {/* Mode A: Direct Grade */}
        {activeMode === "GRADE" && (
          <div className="space-y-3">
            <Select
              label="Awarded Grade Letter"
              options={gradeLetterOptions}
              error={errors.gradeLetter?.message}
              {...register("gradeLetter")}
            />
          </div>
        )}

        {/* Mode B: Marks Entry */}
        {activeMode === "MARKS" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Marks Obtained"
              type="number"
              step="0.5"
              min={0}
              placeholder="e.g. 84.5"
              error={errors.marksObtained?.message}
              required
              {...register("marksObtained", {
                setValueAs: (v) => (v === "" || isNaN(v) ? undefined : Number(v)),
              })}
            />

            <Input
              label="Maximum Marks"
              type="number"
              step="1"
              min={1}
              placeholder="100"
              error={errors.maxMarks?.message}
              required
              {...register("maxMarks", { valueAsNumber: true })}
            />
          </div>
        )}

        {/* Mode C: Both Marks and Grade */}
        {activeMode === "BOTH" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Marks Obtained"
                type="number"
                step="0.5"
                min={0}
                placeholder="e.g. 84.5"
                error={errors.marksObtained?.message}
                required
                {...register("marksObtained", {
                  setValueAs: (v) => (v === "" || isNaN(v) ? undefined : Number(v)),
                })}
              />

              <Input
                label="Maximum Marks"
                type="number"
                step="1"
                min={1}
                placeholder="100"
                error={errors.maxMarks?.message}
                required
                {...register("maxMarks", { valueAsNumber: true })}
              />
            </div>

            <Select
              label="Selected Grade Letter"
              options={gradeLetterOptions}
              error={errors.gradeLetter?.message}
              {...register("gradeLetter")}
            />
          </div>
        )}

        {/* Live Resolved Preview Card */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Computed Outcome Preview
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div>
              <span className="text-[var(--text-muted)] block">Resolved Grade:</span>
              <span className="font-bold text-sm text-[var(--text-primary)]">
                {livePreview.gradeLetter || "—"}
              </span>
            </div>
            <div>
              <span className="text-[var(--text-muted)] block">Grade Points:</span>
              <span className="font-bold text-sm text-[var(--text-primary)] tabular-nums">
                {livePreview.gradePoint !== null ? livePreview.gradePoint.toFixed(1) : "—"}
              </span>
            </div>
            <div>
              <span className="text-[var(--text-muted)] block">Percentage:</span>
              <span className="font-bold text-sm text-[var(--text-primary)] tabular-nums">
                {livePreview.percentage !== null ? `${livePreview.percentage}%` : "—"}
              </span>
            </div>
            <div>
              <span className="text-[var(--text-muted)] block">Quality Points ($C \times GP$):</span>
              <span className="font-bold text-sm text-[var(--brand-primary)] tabular-nums">
                {livePreview.qualityPoints !== null ? livePreview.qualityPoints.toFixed(1) : "—"}
              </span>
            </div>
          </div>

          {livePreview.conflict ? (
            <div className="flex items-center gap-2 pt-2 text-xs text-[var(--accent-danger)] font-medium border-t border-[var(--border-subtle)] mt-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{livePreview.conflict}</span>
            </div>
          ) : livePreview.gradeLetter ? (
            <div className="flex items-center gap-2 pt-2 text-xs text-[var(--accent-success)] font-medium border-t border-[var(--border-subtle)] mt-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Academic result values are valid and consistent with grading scale.</span>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
          <div>
            {subject.grade && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleDelete}
                isLoading={isDeleting}
                disabled={isSubmitting || isDeleting}
                className="text-[var(--accent-danger)] hover:bg-[var(--accent-danger)]/10"
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Clear Grade
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting || isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={isSubmitting}
              disabled={isSubmitting || isDeleting || !!livePreview.conflict}
            >
              Save Result
            </Button>
          </div>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
