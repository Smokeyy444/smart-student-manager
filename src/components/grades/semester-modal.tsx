"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { semesterSchema, type SemesterInput } from "@/lib/validations/academic";
import { createSemester, updateSemester } from "@/lib/actions/academic";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { useToast } from "../ui/toast";
import { useRouter } from "next/navigation";

interface SemesterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  semesterToEdit?: {
    id: string;
    name: string;
    semesterNumber: number;
    status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
    startDate?: Date | null;
    endDate?: Date | null;
  } | null;
  suggestedSemesterNumber?: number;
  onCreatedAndSetupSubjects?: (semesterId: string, semesterName: string) => void;
}

export function SemesterModal({
  open,
  onOpenChange,
  semesterToEdit,
  suggestedSemesterNumber = 1,
  onCreatedAndSetupSubjects,
}: SemesterModalProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [chainBulkSetup, setChainBulkSetup] = React.useState(false);

  const isEditing = !!semesterToEdit;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SemesterInput>({
    resolver: zodResolver(semesterSchema),
    defaultValues: {
      name: semesterToEdit?.name || `Semester ${suggestedSemesterNumber}`,
      semesterNumber: semesterToEdit?.semesterNumber || suggestedSemesterNumber,
      status: semesterToEdit?.status || "ACTIVE",
      startDate: semesterToEdit?.startDate
        ? new Date(semesterToEdit.startDate).toISOString().split("T")[0]
        : "",
      endDate: semesterToEdit?.endDate
        ? new Date(semesterToEdit.endDate).toISOString().split("T")[0]
        : "",
    },
  });

  React.useEffect(() => {
    if (open) {
      reset({
        name: semesterToEdit?.name || `Semester ${suggestedSemesterNumber}`,
        semesterNumber: semesterToEdit?.semesterNumber || suggestedSemesterNumber,
        status: semesterToEdit?.status || "ACTIVE",
        startDate: semesterToEdit?.startDate
          ? new Date(semesterToEdit.startDate).toISOString().split("T")[0]
          : "",
        endDate: semesterToEdit?.endDate
          ? new Date(semesterToEdit.endDate).toISOString().split("T")[0]
          : "",
      });
    }
  }, [open, semesterToEdit, suggestedSemesterNumber, reset]);

  const onSubmit = async (data: SemesterInput) => {
    setServerError(null);
    try {
      const res = isEditing
        ? await updateSemester(semesterToEdit!.id, data)
        : await createSemester(data);

      if (res.success) {
        toast({
          title: isEditing ? "Semester Updated" : "Semester Created",
          description: `Semester ${data.semesterNumber} has been saved successfully.`,
          type: "success",
        });
        onOpenChange(false);
        router.refresh();

        if (chainBulkSetup && !isEditing && res.data && onCreatedAndSetupSubjects) {
          const semId = (res.data as { id: string }).id;
          onCreatedAndSetupSubjects(semId, data.name);
        }
      } else {
        setServerError(res.error || "Failed to save semester.");
      }
    } catch {
      setServerError("An unexpected error occurred while saving semester.");
    }
  };

  const statusOptions = [
    { label: "Active (Current Semester in progress)", value: "ACTIVE" },
    { label: "Completed (Final grades recorded)", value: "COMPLETED" },
    { label: "Archived (Historical reference)", value: "ARCHIVED" },
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
        <DialogTitle>{isEditing ? "Edit Academic Semester" : "Create New Semester"}</DialogTitle>
        <DialogDescription>
          Organize your curriculum, credit load, and grade history by academic period.
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Semester Name"
            placeholder="e.g. Semester 3 (Fall 2025)"
            error={errors.name?.message}
            required
            {...register("name")}
          />

          <Input
            label="Semester Number"
            type="number"
            min={1}
            max={20}
            error={errors.semesterNumber?.message}
            required
            {...register("semesterNumber", { valueAsNumber: true })}
          />
        </div>

        <Select
          label="Academic Status"
          options={statusOptions}
          error={errors.status?.message}
          {...register("status")}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Start Date (Optional)"
            type="date"
            error={errors.startDate?.message}
            {...register("startDate")}
          />

          <Input
            label="End Date (Optional)"
            type="date"
            error={errors.endDate?.message}
            {...register("endDate")}
          />
        </div>

        <DialogFooter className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            {!isEditing && onCreatedAndSetupSubjects && (
              <Button
                type="submit"
                variant="outline"
                onClick={() => setChainBulkSetup(true)}
                disabled={isSubmitting}
              >
                Create & Bulk Add Subjects
              </Button>
            )}
            <Button
              type="submit"
              onClick={() => setChainBulkSetup(false)}
              isLoading={isSubmitting}
              disabled={isSubmitting}
            >
              {isEditing ? "Save Changes" : "Create Semester"}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
