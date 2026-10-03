import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth/guards";
import { AppLayout } from "@/components/layout/app-layout";
import { getAttendancePageData } from "@/lib/actions/attendance";
import { AttendanceView } from "@/components/attendance/attendance-view";
import { EmptyState } from "@/components/ui/empty-state";
import { ClipboardCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Attendance — Smart Student Manager",
  description:
    "Track subject-wise attendance, monitor bunk budgets, and calculate recovery classes.",
};

export default async function AttendancePage() {
  const user = await requireAuth("/login");
  const data = await getAttendancePageData();

  return (
    <AppLayout user={user}>
      {data ? (
        <AttendanceView initialData={data} />
      ) : (
        <EmptyState
          icon={<ClipboardCheck className="h-8 w-8 text-[var(--brand-primary)]" />}
          title="Attendance Unavailable"
          description="An error occurred loading your attendance data. Please refresh the page or try again later."
        />
      )}
    </AppLayout>
  );
}

