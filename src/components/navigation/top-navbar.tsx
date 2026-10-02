"use client";

import * as React from "react";
import Link from "next/link";
import { ThemeToggle } from "../theme/theme-toggle";
import { Dropdown, DropdownItem, DropdownSeparator } from "../ui/dropdown";
import { Bell, User, Settings, LogOut, ChevronDown, GraduationCap } from "lucide-react";
import { logoutUser } from "@/lib/actions/auth";

interface TopNavbarProps {
  user: {
    email: string;
    profile?: {
      fullName: string;
      currentSemester: number;
      university?: string | null;
    } | null;
  };
}

export function TopNavbar({ user }: TopNavbarProps) {
  const fullName = user.profile?.fullName || "Student";
  const currentSemester = user.profile?.currentSemester || 1;
  const initials = fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 backdrop-blur-xs px-4 sm:px-6">
      {/* Left: Active Semester Indicator */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]">
          <GraduationCap className="h-4 w-4 text-[var(--brand-primary)]" />
          <span>Semester {currentSemester}</span>
        </div>
        {user.profile?.university && (
          <span className="hidden md:inline-block text-xs text-[var(--text-muted)] truncate max-w-xs">
            {user.profile.university}
          </span>
        )}
      </div>

      {/* Right: Actions, Theme, and Profile Dropdown */}
      <div className="flex items-center gap-3">
        <ThemeToggle />

        {/* Notifications Icon Placeholder */}
        <button
          type="button"
          aria-label="View notifications"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition-colors cursor-pointer"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[var(--brand-primary)]" />
        </button>

        {/* User Profile Menu */}
        <Dropdown
          trigger={
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg p-1 hover:bg-[var(--bg-surface-elevated)] transition-colors cursor-pointer select-none"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand-primary)] text-white text-xs font-bold">
                {initials}
              </div>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-semibold text-[var(--text-primary)] line-clamp-1 max-w-[120px]">
                  {fullName}
                </span>
                <span className="text-[10px] text-[var(--text-muted)] line-clamp-1 max-w-[120px]">
                  {user.email}
                </span>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            </button>
          }
        >
          <div className="px-3 py-2 border-b border-[var(--border-subtle)]">
            <p className="text-xs font-semibold text-[var(--text-primary)]">{fullName}</p>
            <p className="text-[11px] text-[var(--text-muted)] truncate">{user.email}</p>
          </div>
          <Link href="/profile">
            <DropdownItem>
              <User className="h-4 w-4 text-[var(--text-muted)]" />
              <span>Student Profile</span>
            </DropdownItem>
          </Link>
          <Link href="/settings">
            <DropdownItem>
              <Settings className="h-4 w-4 text-[var(--text-muted)]" />
              <span>Settings & Preferences</span>
            </DropdownItem>
          </Link>
          <DropdownSeparator />
          <form action={logoutUser} className="w-full">
            <DropdownItem danger>
              <LogOut className="h-4 w-4 text-[var(--accent-danger)]" />
              <button type="submit" className="w-full text-left">
                Sign Out
              </button>
            </DropdownItem>
          </form>
        </Dropdown>
      </div>
    </header>
  );
}
