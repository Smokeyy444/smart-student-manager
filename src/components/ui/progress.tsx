import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number; // 0 to 100
  max?: number;
  variant?: "default" | "success" | "warning" | "danger";
  size?: "sm" | "md" | "lg";
}

export function Progress({
  className,
  value,
  max = 100,
  variant = "default",
  size = "md",
  ...props
}: ProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  const heightStyles = {
    sm: "h-1.5",
    md: "h-2.5",
    lg: "h-4",
  };

  const variantStyles = {
    default: "bg-[var(--brand-primary)]",
    success: "bg-[var(--accent-success)]",
    warning: "bg-[var(--accent-warning)]",
    danger: "bg-[var(--accent-danger)]",
  };

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn(
        "w-full overflow-hidden rounded-full bg-[var(--border-subtle)]",
        heightStyles[size],
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "h-full transition-all duration-300 ease-in-out rounded-full",
          variantStyles[variant]
        )}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
