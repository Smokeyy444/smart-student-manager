import { requireAuth } from "@/lib/auth/guards";
import { AppLayout } from "@/components/layout/app-layout";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { getEvents, getUserSemestersAndSubjects } from "@/lib/actions/events";
import { EventsCockpit } from "@/components/events/events-cockpit";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const user = await requireAuth("/login");

  const [initialEvents, semesters] = await Promise.all([
    getEvents(),
    getUserSemestersAndSubjects(),
  ]);

  return (
    <AppLayout user={user}>
      <div className="space-y-6">
        <PageHeader
          title="Events & Academic Tasks"
          description="Manage exam schedules, assignment cutoffs, presentations, and smart reminders."
          badge={<Badge variant="default">Phase 5 Module</Badge>}
        />

        <EventsCockpit
          initialEvents={initialEvents}
          semesters={semesters}
        />
      </div>
    </AppLayout>
  );
}
