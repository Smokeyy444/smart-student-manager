import { requireAuth } from "@/lib/auth/guards";
import { AppLayout } from "@/components/layout/app-layout";
import { PageHeader } from "@/components/ui/page-header";
import { ProfileForm } from "./profile-form";
import { Badge } from "@/components/ui/badge";

export default async function ProfilePage() {
  const user = await requireAuth("/login");

  const initialData = {
    fullName: user.profile?.fullName || "",
    studentIdNumber: user.profile?.studentIdNumber || null,
    university: user.profile?.university || null,
    course: user.profile?.course || null,
    branch: user.profile?.branch || null,
    currentSemester: user.profile?.currentSemester || 1,
    avatarUrl: user.profile?.avatarUrl || null,
  };

  return (
    <AppLayout user={user}>
      <div className="space-y-6">
        <PageHeader
          title="Student Profile"
          description="Manage your institutional identity, academic enrollment, and degree specialization."
          badge={<Badge variant="secondary">Verified Account</Badge>}
        />

        <div className="max-w-3xl">
          <ProfileForm initialData={initialData} userEmail={user.email} />
        </div>
      </div>
    </AppLayout>
  );
}
