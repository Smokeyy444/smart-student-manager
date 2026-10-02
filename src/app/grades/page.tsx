import { requireAuth } from "@/lib/auth/guards";
import { AppLayout } from "@/components/layout/app-layout";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { GraduationCap } from "lucide-react";

export default async function GradesPage() {
  const user = await requireAuth("/login");

  return (
    <AppLayout user={user}>
      <div className="space-y-6">
        <PageHeader
          title="Grades & Academic Results"
          description="Manage credit hours, subject grades, and project your semester SGPA and cumulative CGPA."
          badge={<Badge variant="secondary">Phase 3 Module</Badge>}
        />

        <EmptyState
          icon={<GraduationCap className="h-8 w-8 text-[var(--brand-primary)]" />}
          title="Grade Engine Scheduled for Phase 3"
          description="The multi-semester grade table, credit weighted SGPA calculator, CGPA rollups, and What-If scenario simulator will be unlocked in Phase 3."
        />
      </div>
    </AppLayout>
  );
}
