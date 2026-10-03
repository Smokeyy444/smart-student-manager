"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { subjectSchema, type SubjectInput } from "@/lib/validations/academic";
import { createSubject, updateSubject } from "@/lib/actions/academic";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { Badge } from "../ui/badge";
import { useToast } from "../ui/toast";
import { useRouter } from "next/navigation";

interface SubjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  semesterId: string;
  semesterName: string;
  subjectToEdit?: {
    id: string;
    name: string;
    code?: string | null;
    creditHours: number;
    category: "CORE" | "ELECTIVE" | "LAB" | "AUDIT";
    isAudit: boolean;
    customAttendanceTarget?: number | null;
  } | null;
}

export function SubjectModal({
  open,
  onOpenChange,
  semesterId,
  semesterName,
  subjectToEdit,
}: SubjectModalProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const isEditing = !!subjectToEdit;

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SubjectInput>({
    resolver: zodResolver(subjectSchema),
    defaultValues: {
      semesterId,
      name: subjectToEdit?.name || "",
      code: subjectToEdit?.code || "",
      creditHours: subjectToEdit?.creditHours !== undefined ? subjectToEdit.creditHours : 3.0,
      category: subjectToEdit?.category || "CORE",
      isAudit: subjectToEdit?.isAudit || false,
      customAttendanceTarget: subjectToEdit?.customAttendanceTarget || undefined,
    },
  });

  const isAuditWatched = useWatch({ control, name: "isAudit" });
  const creditHoursWatched = useWatch({ control, name: "creditHours" });

  React.useEffect(() => {
    if (open) {
      reset({
        semesterId,
        name: subjectToEdit?.name || "",
        code: subjectToEdit?.code || "",
        creditHours: subjectToEdit?.creditHours !== undefined ? subjectToEdit.creditHours : 3.0,
        category: subjectToEdit?.category || "CORE",
        isAudit: subjectToEdit?.isAudit || false,
        customAttendanceTarget: subjectToEdit?.customAttendanceTarget || undefined,
      });
    }
  }, [open, semesterId, subjectToEdit, reset]);

  // If user toggles Audit, automatically suggest 0 credits or notify
  const handleAuditToggle = (checked: boolean) => {
    setValue("isAudit", checked);
    if (checked) {
      setValue("category", "AUDIT");
      if (creditHoursWatched !== 0) {
        setValue("creditHours", 0);
      }
    } else {
      if (creditHoursWatched === 0) {
        setValue("creditHours", 3.0);
      }
      setValue("category", "CORE");
    }
  };

  const onSubmit = async (data: SubjectInput) => {
    setServerError(null);
    try {
      const res = isEditing
        ? await updateSubject(subjectToEdit!.id, data)
        : await createSubject(data);

      if (res.success) {
        toast({
          title: isEditing ? "Subject Updated" : "Subject Enrolled",
          description: `'${data.name}' has been saved to ${semesterName}.`,
          type: "success",
        });
        onOpenChange(false);
        router.refresh();
      } else {
        setServerError(res.error || "Failed to save subject.");
      }
    } catch {
      setServerError("An unexpected error occurred while saving subject.");
    }
  };

  const categoryOptions = [
    { label: "Core Curriculum", value: "CORE" },
    { label: "Professional / Open Elective", value: "ELECTIVE" },
    { label: "Laboratory / Practical", value: "LAB" },
    { label: "Audit / Non-Credit Course", value: "AUDIT" },
  ];

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setServerError(null);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogHeader>
        <div className="flex items-center justify-between pr-6">
          <DialogTitle>{isEditing ? "Edit Subject" : "Add Subject"}</DialogTitle>
          <Badge variant={isAuditWatched || creditHoursWatched === 0 ? "secondary" : "default"}>
            {isAuditWatched || creditHoursWatched === 0
              ? "Non-Credit / Audit Course"
              : "Credit-Bearing (Counted in SGPA)"}
          </Badge>
        </div>
        <DialogDescription>
          Enrolling course in <strong>{semesterName}</strong>.
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Input
              label="Subject / Course Name"
              placeholder="e.g. Operating Systems"
              error={errors.name?.message}
              required
              {...register("name")}
            />
          </div>

          <div>
            <Input
              label="Course Code"
              placeholder="e.g. CS301"
              error={errors.code?.message}
              {...register("code")}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Credit Hours"
            type="number"
            step="0.5"
            min={0}
            max={30}
            helperText={
              isAuditWatched
                ? "Audit courses typically carry 0 credit hours."
                : "Standard lecture courses carry 3.0 or 4.0 credits."
            }
            error={errors.creditHours?.message}
            required
            {...register("creditHours", { valueAsNumber: true })}
          />

          <Select
            label="Subject Category"
            options={categoryOptions}
            error={errors.category?.message}
            {...register("category")}
          />
        </div>

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 space-y-2">
          <Checkbox
            label="Mark as Audit / Non-Credit Course"
            description="Audit courses appear on your grade sheet and attendance tracker, but are excluded from SGPA and CGPA calculation formulas."
            checked={isAuditWatched}
            onChange={(e) => handleAuditToggle(e.target.checked)}
          />
        </div>

        <Input
          label="Custom Attendance Target Override (% - Optional)"
          type="number"
          step="0.5"
          min={50}
          max={99.9}
          placeholder="Leave blank to use global default (75%)"
          helperText="Override the default attendance target specifically for this subject (e.g. 80%)."
          error={errors.customAttendanceTarget?.message}
          {...register("customAttendanceTarget", {
            setValueAs: (v) => (v === "" || isNaN(v) ? null : Number(v)),
          })}
        />

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting}>
            {isEditing ? "Save Changes" : "Enroll Subject"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
