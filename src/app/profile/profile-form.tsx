"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { studentProfileSchema, type StudentProfileInput } from "@/lib/validations/profile";
import { updateStudentProfile } from "@/lib/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";

interface ProfileFormProps {
  initialData: {
    fullName: string;
    studentIdNumber: string | null;
    university: string | null;
    course: string | null;
    branch: string | null;
    currentSemester: number;
    avatarUrl: string | null;
  };
  userEmail: string;
}

export function ProfileForm({ initialData, userEmail }: ProfileFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<StudentProfileInput>({
    resolver: zodResolver(studentProfileSchema),
    defaultValues: {
      fullName: initialData.fullName || "",
      studentIdNumber: initialData.studentIdNumber || "",
      university: initialData.university || "",
      course: initialData.course || "",
      branch: initialData.branch || "",
      currentSemester: initialData.currentSemester || 1,
      avatarUrl: initialData.avatarUrl || "",
    },
  });

  const onSubmit = async (data: StudentProfileInput) => {
    setServerError(null);
    try {
      const result = await updateStudentProfile(data);
      if (result.success) {
        toast({
          title: "Profile Updated",
          description: "Your student academic information has been saved successfully.",
          type: "success",
        });
        router.refresh();
      } else {
        setServerError(result.error || "Failed to update profile.");
      }
    } catch {
      setServerError("An unexpected error occurred while saving your profile.");
    }
  };

  const semesterOptions = Array.from({ length: 12 }, (_, i) => ({
    label: `Semester ${i + 1}`,
    value: i + 1,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Academic & Personal Details</CardTitle>
        <CardDescription>
          Keep your academic identification updated for reports, transcript projections, and semester tracking.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {serverError && (
            <div
              role="alert"
              className="rounded-lg border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10 p-3 text-xs text-[var(--accent-danger)] font-medium"
            >
              {serverError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Full Name"
              type="text"
              placeholder="Jane Doe"
              error={errors.fullName?.message}
              required
              {...register("fullName")}
            />

            <Input
              label="Email Address (Account ID)"
              type="email"
              value={userEmail}
              disabled
              helperText="Account email cannot be modified from student profile."
            />

            <Input
              label="Student ID / Roll Number"
              type="text"
              placeholder="e.g. 21BCE10452"
              error={errors.studentIdNumber?.message}
              {...register("studentIdNumber")}
            />

            <Select
              label="Current Active Semester"
              options={semesterOptions}
              error={errors.currentSemester?.message}
              {...register("currentSemester", { valueAsNumber: true })}
            />

            <Input
              label="College / University"
              type="text"
              placeholder="e.g. Stanford University / MIT"
              error={errors.university?.message}
              {...register("university")}
            />

            <Input
              label="Degree / Course"
              type="text"
              placeholder="e.g. B.Tech / B.S. Computer Science"
              error={errors.course?.message}
              {...register("course")}
            />

            <Input
              label="Branch / Major"
              type="text"
              placeholder="e.g. Information Technology"
              error={errors.branch?.message}
              {...register("branch")}
            />

            <Input
              label="Avatar URL (Optional)"
              type="url"
              placeholder="https://example.com/avatar.jpg"
              error={errors.avatarUrl?.message}
              {...register("avatarUrl")}
            />
          </div>

          <CardFooter className="px-0 pb-0 justify-end">
            <Button
              type="submit"
              isLoading={isSubmitting}
              disabled={isSubmitting || !isDirty}
            >
              Save Profile Changes
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
}
