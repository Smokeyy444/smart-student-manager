import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "success" | "warning" | "danger" | "outline" | "cyber-cyan" | "cyber-magenta";
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  const variantStyles = {
    default: "bg-[var(--brand-primary)]/15 text-[var(--brand-primary)] border-[var(--brand-primary)]/30",
    secondary: "bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)]",
    success: "bg-[var(--accent-success)]/15 text-[var(--accent-success)] border-[var(--accent-success)]/30",
    warning: "bg-[var(--accent-warning)]/15 text-[var(--accent-warning)] border-[var(--accent-warning)]/30",
    danger: "bg-[var(--accent-danger)]/15 text-[var(--accent-danger)] border-[var(--accent-danger)]/30",
    outline: "text-[var(--text-primary)] border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 backdrop-blur-xs",
    "cyber-cyan": "bg-[var(--brand-cyan)]/15 text-[var(--brand-cyan)] border-[var(--brand-cyan)]/35 shadow-[0_0_10px_rgba(0,229,255,0.2)] font-mono",
    "cyber-magenta": "bg-[var(--brand-magenta)]/15 text-[var(--brand-magenta)] border-[var(--brand-magenta)]/35 shadow-[0_0_10px_rgba(217,70,239,0.2)] font-mono",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all select-none",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}
