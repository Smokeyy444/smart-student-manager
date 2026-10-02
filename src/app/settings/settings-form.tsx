"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { userSettingsSchema, type UserSettingsInput } from "@/lib/validations/settings";
import { updateUserSettings } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useTheme } from "@/components/theme/theme-provider";
import { SYSTEM_GRADING_SCALES } from "@/lib/constants/grading";
import { useRouter } from "next/navigation";

interface SettingsFormProps {
  initialSettings: {
    defaultAttendanceTarget: number;
    defaultGradingScaleId: string | null;
    themePreference: "light" | "dark" | "system";
    inAppNotificationsEnabled: boolean;
    browserNotificationsEnabled: boolean;
  };
}

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const { setTheme } = useTheme();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UserSettingsInput>({
    resolver: zodResolver(userSettingsSchema),
    defaultValues: {
      defaultAttendanceTarget: initialSettings.defaultAttendanceTarget ?? 75.0,
      defaultGradingScaleId: initialSettings.defaultGradingScaleId || "standard-10-point",
      themePreference: initialSettings.themePreference ?? "system",
      inAppNotificationsEnabled: initialSettings.inAppNotificationsEnabled ?? true,
      browserNotificationsEnabled: initialSettings.browserNotificationsEnabled ?? false,
    },
  });

  const selectedTheme = useWatch({ control, name: "themePreference" }) || "system";

  const onSubmit = async (data: UserSettingsInput) => {
    setServerError(null);
    try {
      const result = await updateUserSettings(data);
      if (result.success) {
        if (data.themePreference) {
          setTheme(data.themePreference);
        }
        toast({
          title: "Settings Saved",
          description: "Your academic preferences and thresholds have been updated.",
          type: "success",
        });
        router.refresh();
      } else {
        setServerError(result.error || "Failed to update settings.");
      }
    } catch {
      setServerError("An unexpected error occurred while saving settings.");
    }
  };

  const gradingScaleOptions = SYSTEM_GRADING_SCALES.map((scale) => ({
    label: `${scale.name} (${scale.scaleType})`,
    value: scale.id,
  }));

  const themeOptions = [
    { label: "Sync with System", value: "system" },
    { label: "Light Mode", value: "light" },
    { label: "Deep Dark Mode", value: "dark" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Academic & Platform Preferences</CardTitle>
        <CardDescription>
          Configure default attendance thresholds, active GPA grading scale, and notifications.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
          {serverError && (
            <div
              role="alert"
              className="rounded-lg border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10 p-3 text-xs text-[var(--accent-danger)] font-medium"
            >
              {serverError}
            </div>
          )}

          {/* Section: Academic Thresholds */}
          <div className="space-y-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Academic Thresholds & Grading
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Default Attendance Target (%)"
                type="number"
                step="0.1"
                min="50.0"
                max="99.9"
                placeholder="75.0"
                helperText="Used as the baseline target for bunk buffer and recovery calculations (standard: 75%)."
                error={errors.defaultAttendanceTarget?.message}
                {...register("defaultAttendanceTarget", { valueAsNumber: true })}
              />

              <Select
                label="Active Academic Grading Scale"
                options={gradingScaleOptions}
                error={errors.defaultGradingScaleId?.message}
                {...register("defaultGradingScaleId")}
              />
            </div>
          </div>

          {/* Section: Appearance */}
          <div className="space-y-4 pt-2 border-t border-[var(--border-subtle)]">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Appearance & Theme
            </h4>

            <div className="max-w-xs">
              <Select
                label="Theme Preference"
                options={themeOptions}
                error={errors.themePreference?.message}
                {...register("themePreference")}
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Current active theme selection: <span className="font-semibold">{selectedTheme}</span>
              </p>
            </div>
          </div>

          {/* Section: Notifications */}
          <div className="space-y-4 pt-2 border-t border-[var(--border-subtle)]">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Notification Channels
            </h4>

            <div className="space-y-3">
              <Checkbox
                label="In-App Deadline Alerts"
                description="Receive non-intrusive toast notifications and navbar alerts before exams and assignments."
                {...register("inAppNotificationsEnabled")}
              />

              <Checkbox
                label="Browser Push Notifications"
                description="Receive browser notifications even when the Smart Student Manager tab is minimized."
                {...register("browserNotificationsEnabled")}
              />
            </div>
          </div>

          <CardFooter className="px-0 pb-0 justify-end">
            <Button
              type="submit"
              isLoading={isSubmitting}
              disabled={isSubmitting || !isDirty}
            >
              Save Preferences
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
}
