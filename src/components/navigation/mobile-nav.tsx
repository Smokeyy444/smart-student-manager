"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ClipboardCheck,
  GraduationCap,
  CalendarDays,
  Menu,
  X,
  User,
  Settings,
  LogOut,
} from "lucide-react";
import { logoutUser } from "@/lib/actions/auth";

export function MobileNav({ userFullName }: { userFullName?: string }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <>
      {/* Mobile Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 backdrop-blur-md px-2">
        <Link
          href="/dashboard"
          className={cn(
            "flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
            pathname === "/dashboard"
              ? "text-[var(--brand-primary)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          )}
        >
          <LayoutDashboard className="h-5 w-5" />
          <span>Home</span>
        </Link>
        <Link
          href="/attendance"
          className={cn(
            "flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
            pathname === "/attendance"
              ? "text-[var(--brand-primary)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          )}
        >
          <ClipboardCheck className="h-5 w-5" />
          <span>Attendance</span>
        </Link>
        <Link
          href="/grades"
          className={cn(
            "flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
            pathname === "/grades"
              ? "text-[var(--brand-primary)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          )}
        >
          <GraduationCap className="h-5 w-5" />
          <span>Grades</span>
        </Link>
        <Link
          href="/events"
          className={cn(
            "flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
            pathname === "/events"
              ? "text-[var(--brand-primary)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          )}
        >
          <CalendarDays className="h-5 w-5" />
          <span>Events</span>
        </Link>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          aria-label="Open more menu"
        >
          <Menu className="h-5 w-5" />
          <span>More</span>
        </button>
      </nav>

      {/* Drawer Overlay */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative ml-auto flex h-full w-4/5 max-w-xs flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xl animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
              <div>
                <p className="font-semibold text-sm text-[var(--text-primary)]">
                  {userFullName || "Student"}
                </p>
                <p className="text-xs text-[var(--text-muted)]">Academic Portal</p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 py-4 space-y-2">
              <Link
                href="/profile"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
              >
                <User className="h-4 w-4" />
                Profile & Bio
              </Link>
              <Link
                href="/settings"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
              >
                <Settings className="h-4 w-4" />
                Preferences
              </Link>
            </div>

            <div className="pt-4 border-t border-[var(--border-subtle)]">
              <form action={logoutUser}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[var(--accent-danger)] hover:bg-[var(--accent-danger)]/10"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
