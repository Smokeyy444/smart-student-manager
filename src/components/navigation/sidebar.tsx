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
  Bell,
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
  { name: "Reminders", href: "/reminders", icon: Bell },
];

const secondaryNavItems: NavItem[] = [
  { name: "Profile", href: "/profile", icon: User },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-64 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] backdrop-blur-xl shrink-0 h-screen sticky top-0 z-30">
      {/* Brand Header */}
      <div className="flex h-16 items-center gap-3 px-6 border-b border-[var(--border-subtle)]">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--brand-cyan)] to-[var(--brand-primary)] text-slate-950 font-bold shadow-[0_0_20px_rgba(0,229,255,0.35)]">
          <BookOpen className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <span className="font-extrabold text-sm tracking-tight cyber-gradient-text">
            Smart Student
          </span>
          <span className="text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-wider">
            Academic Suite
          </span>
        </div>
      </div>

      {/* Main Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <div>
          <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2 font-mono">
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
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium transition-all duration-200",
                    isActive
                      ? "bg-gradient-to-r from-[var(--brand-primary)]/15 via-[var(--brand-primary)]/5 to-transparent text-[var(--brand-primary)] border-l-2 border-[var(--brand-primary)] font-semibold shadow-[inset_0_0_15px_rgba(0,229,255,0.06)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
                  )}
                >
                  <Icon className={cn("h-4 w-4 transition-colors", isActive ? "text-[var(--brand-primary)] drop-shadow-[0_0_8px_rgba(0,229,255,0.5)]" : "text-[var(--text-muted)]")} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        <div>
          <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2 font-mono">
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
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium transition-all duration-200",
                    isActive
                      ? "bg-gradient-to-r from-[var(--brand-primary)]/15 via-[var(--brand-primary)]/5 to-transparent text-[var(--brand-primary)] border-l-2 border-[var(--brand-primary)] font-semibold shadow-[inset_0_0_15px_rgba(0,229,255,0.06)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
                  )}
                >
                  <Icon className={cn("h-4 w-4 transition-colors", isActive ? "text-[var(--brand-primary)] drop-shadow-[0_0_8px_rgba(0,229,255,0.5)]" : "text-[var(--text-muted)]")} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Sidebar Footer info */}
      <div className="p-4 border-t border-[var(--border-subtle)]">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/60 p-3 text-xs backdrop-blur-md">
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold text-xs text-[var(--text-primary)]">Command Center</span>
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent-success)] shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
          </div>
          <p className="text-[10px] text-[var(--text-muted)] font-mono">
            All Modules Active • Live Sync
          </p>
        </div>
      </div>
    </aside>
  );
}
