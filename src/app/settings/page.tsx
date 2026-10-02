import { requireAuth } from "@/lib/auth/guards";
import { AppLayout } from "@/components/layout/app-layout";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsForm } from "./settings-form";
import { Badge } from "@/components/ui/badge";

export default async function SettingsPage() {
  const user = await requireAuth("/login");

  const initialSettings = {
    defaultAttendanceTarget: user.settings?.defaultAttendanceTarget ?? 75.0,
    defaultGradingScaleId: user.settings?.defaultGradingScaleId || "standard-10-point",
    themePreference: (user.settings?.themePreference as "light" | "dark" | "system") ?? "system",
    inAppNotificationsEnabled: user.settings?.inAppNotificationsEnabled ?? true,
    browserNotificationsEnabled: user.settings?.browserNotificationsEnabled ?? false,
  };

  return (
    <AppLayout user={user}>
      <div className="space-y-6">
        <PageHeader
          title="Settings & Preferences"
          description="Customize your academic calculation baselines, grading rubric, and UI appearance."
          badge={<Badge variant="secondary">Global Settings</Badge>}
        />

        <div className="max-w-3xl">
          <SettingsForm initialSettings={initialSettings} />
        </div>
      </div>
    </AppLayout>
  );
}
