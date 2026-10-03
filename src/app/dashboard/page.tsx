import { requireAuth } from "@/lib/auth/guards";
import { AppLayout } from "@/components/layout/app-layout";
import { getDashboardData } from "@/lib/actions/dashboard";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export const metadata = {
  title: "Dashboard Command Center | Smart Student Manager",
  description: "Live academic overview, attendance tracking radar, and deadline alert center.",
};

export default async function DashboardPage() {
  const user = await requireAuth("/login");
  const dashboardData = await getDashboardData();

  if (!dashboardData) {
    return (
      <AppLayout user={user}>
        <div className="p-8 text-center text-sm text-[var(--text-muted)] font-mono">
          Initializing command center...
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout user={user}>
      <DashboardView data={dashboardData} user={user} />
    </AppLayout>
  );
}
