import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] mb-4">
        <FileQuestion className="h-8 w-8" />
      </div>
      <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
        Page Not Found
      </h2>
      <p className="text-sm text-[var(--text-secondary)] max-w-md mb-6">
        The academic resource or route you requested does not exist or has been relocated.
      </p>
      <Link href="/dashboard">
        <Button variant="primary">Return to Dashboard</Button>
      </Link>
    </div>
  );
}
