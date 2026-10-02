import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "success" | "warning" | "danger" | "outline";
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  const variantStyles = {
    default: "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] border-transparent",
    secondary: "bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)]",
    success: "bg-[var(--accent-success)]/10 text-[var(--accent-success)] border-transparent",
    warning: "bg-[var(--accent-warning)]/10 text-[var(--accent-warning)] border-transparent",
    danger: "bg-[var(--accent-danger)]/10 text-[var(--accent-danger)] border-transparent",
    outline: "text-[var(--text-primary)] border-[var(--border-subtle)]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors select-none",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}
