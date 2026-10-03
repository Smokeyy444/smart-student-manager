import * as React from "react";
import { cn } from "@/lib/utils";
import { Card } from "./card";

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger";
  className?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  badge,
  icon,
  variant = "default",
  className,
}: StatCardProps) {
  const iconVariantStyles = {
    default: "bg-[var(--brand-primary)]/15 text-[var(--brand-primary)] border border-[var(--brand-primary)]/20 shadow-[0_0_15px_rgba(0,229,255,0.15)]",
    success: "bg-[var(--accent-success)]/15 text-[var(--accent-success)] border border-[var(--accent-success)]/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]",
    warning: "bg-[var(--accent-warning)]/15 text-[var(--accent-warning)] border border-[var(--accent-warning)]/20 shadow-[0_0_15px_rgba(245,158,11,0.15)]",
    danger: "bg-[var(--accent-danger)]/15 text-[var(--accent-danger)] border border-[var(--accent-danger)]/20 shadow-[0_0_15px_rgba(244,63,94,0.15)]",
  };

  return (
    <Card className={cn("p-5 relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--border-luminous)] hover:shadow-md group", className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] font-mono">{title}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] tabular-nums font-mono">
              {value}
            </span>
            {badge}
          </div>
          {subtitle && (
            <p className="text-xs text-[var(--text-secondary)] mt-1 font-sans">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl backdrop-blur-md transition-transform duration-200 group-hover:scale-105",
              iconVariantStyles[variant]
            )}
          >
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
