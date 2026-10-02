import { requireAuth } from "@/lib/auth/guards";
import { AppLayout } from "@/components/layout/app-layout";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { CalendarDays } from "lucide-react";

export default async function EventsPage() {
  const user = await requireAuth("/login");

  return (
    <AppLayout user={user}>
      <div className="space-y-6">
        <PageHeader
          title="Events & Task Manager"
          description="Track upcoming exams, tests, assignment deadlines, and reminders."
          badge={<Badge variant="secondary">Phase 5 Module</Badge>}
        />

        <EmptyState
          icon={<CalendarDays className="h-8 w-8 text-[var(--brand-primary)]" />}
          title="Event & Deadline Manager Scheduled for Phase 5"
          description="Interactive academic calendar, assignment priority filters, and multi-stage proactive notifications will be unlocked in Phase 5."
        />
      </div>
    </AppLayout>
  );
}
