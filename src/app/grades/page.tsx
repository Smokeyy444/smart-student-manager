import { requireAuth } from "@/lib/auth/guards";
import { AppLayout } from "@/components/layout/app-layout";
import { getStudentAcademicData } from "@/lib/actions/academic";
import { GradesView } from "@/components/grades/grades-view";
import { redirect } from "next/navigation";

export default async function GradesPage() {
  const user = await requireAuth("/login");

  const academicData = await getStudentAcademicData();
  if (!academicData) {
    redirect("/login");
  }

  return (
    <AppLayout user={user}>
      <GradesView initialData={academicData} />
    </AppLayout>
  );
}
