import { requireAuth } from "@/lib/auth/guards";
import { AppLayout } from "@/components/layout/app-layout";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck } from "lucide-react";

export default async function AttendancePage() {
  const user = await requireAuth("/login");
  const currentSemester = user.profile?.currentSemester || 1;

  return (
    <AppLayout user={user}>
      <div className="space-y-6">
        <PageHeader
          title="Attendance Manager"
          description={`Track subject sessions, bunk buffers, and recovery targets for Semester ${currentSemester}.`}
          badge={<Badge variant="secondary">Phase 4 Module</Badge>}
        />

        <EmptyState
          icon={<ClipboardCheck className="h-8 w-8 text-[var(--brand-primary)]" />}
          title="Attendance Management Scheduled for Phase 4"
          description="The subject attendance grid, real-time bunk simulator pill, recovery calculator, and 1-tap increment controls will be unlocked in Phase 4 after math calculation validation."
        />
      </div>
    </AppLayout>
  );
}
