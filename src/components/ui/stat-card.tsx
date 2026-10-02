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
    default: "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]",
    success: "bg-[var(--accent-success)]/10 text-[var(--accent-success)]",
    warning: "bg-[var(--accent-warning)]/10 text-[var(--accent-warning)]",
    danger: "bg-[var(--accent-danger)]/10 text-[var(--accent-danger)]",
  };

  return (
    <Card className={cn("p-5 relative overflow-hidden transition-all hover:border-[var(--border-subtle)] hover:shadow-xs", className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-[var(--text-secondary)]">{title}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-[var(--text-primary)] tabular-nums">
              {value}
            </span>
            {badge}
          </div>
          {subtitle && (
            <p className="text-xs text-[var(--text-muted)] mt-1">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
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
