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
  User,
  Settings,
  BookOpen,
} from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const mainNavItems: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Attendance", href: "/attendance", icon: ClipboardCheck },
  { name: "Grades & CGPA", href: "/grades", icon: GraduationCap },
  { name: "Events & Tasks", href: "/events", icon: CalendarDays },
];

const secondaryNavItems: NavItem[] = [
  { name: "Profile", href: "/profile", icon: User },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-64 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0 h-screen sticky top-0">
      {/* Brand Header */}
      <div className="flex h-16 items-center gap-2.5 px-6 border-b border-[var(--border-subtle)]">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-primary)] text-white shadow-xs">
          <BookOpen className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-sm tracking-tight text-[var(--text-primary)]">
            Smart Student
          </span>
          <span className="text-[10px] text-[var(--text-muted)] font-medium">
            Academic Suite
          </span>
        </div>
      </div>

      {/* Main Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <div>
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
            Academic Core
          </p>
          <nav className="space-y-1">
            {mainNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] font-semibold"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
                  )}
                >
                  <Icon className={cn("h-4 w-4", isActive && "text-[var(--brand-primary)]")} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        <div>
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
            Configuration
          </p>
          <nav className="space-y-1">
            {secondaryNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] font-semibold"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
                  )}
                >
                  <Icon className={cn("h-4 w-4", isActive && "text-[var(--brand-primary)]")} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Sidebar Footer info */}
      <div className="p-4 border-t border-[var(--border-subtle)]">
        <div className="rounded-lg bg-[var(--bg-surface-elevated)] p-3 text-xs">
          <p className="font-medium text-[var(--text-primary)]">Phase 1 Active</p>
          <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
            Student Profile & Multi-tenant DB
          </p>
        </div>
      </div>
    </aside>
  );
}
