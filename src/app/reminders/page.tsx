import { requireAuth } from "@/lib/auth/guards";
import { AppLayout } from "@/components/layout/app-layout";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { getReminders } from "@/lib/actions/events";
import { ReminderCenter } from "@/components/reminders/reminder-center";

export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  const user = await requireAuth("/login");
  const initialReminders = await getReminders("ALL");

  return (
    <AppLayout user={user}>
      <div className="space-y-6">
        <PageHeader
          title="Reminder Center"
          description="Track due deadline alerts, upcoming notices, and configure notification preferences."
          badge={<Badge variant="default">Phase 5 Module</Badge>}
        />

        <ReminderCenter
          initialReminders={initialReminders}
          browserNotificationsEnabledSetting={
            user.settings?.browserNotificationsEnabled ?? false
          }
        />
      </div>
    </AppLayout>
  );
}
