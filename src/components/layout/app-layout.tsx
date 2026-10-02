import * as React from "react";
import { Sidebar } from "../navigation/sidebar";
import { TopNavbar } from "../navigation/top-navbar";
import { MobileNav } from "../navigation/mobile-nav";

interface AppLayoutProps {
  user: {
    email: string;
    profile?: {
      fullName: string;
      currentSemester: number;
      university?: string | null;
    } | null;
  };
  children: React.ReactNode;
}

export function AppLayout({ user, children }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen bg-[var(--bg-app)]">
      {/* Desktop Persistent Sidebar */}
      <Sidebar />

      {/* Main Content Viewport */}
      <div className="flex flex-1 flex-col min-w-0 pb-16 lg:pb-0">
        <TopNavbar user={user} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Responsive Navigation */}
      <MobileNav userFullName={user.profile?.fullName} />
    </div>
  );
}
