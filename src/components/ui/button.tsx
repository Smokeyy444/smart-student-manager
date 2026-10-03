import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "cyber";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium rounded-lg transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] disabled:opacity-50 disabled:pointer-events-none select-none cursor-pointer";

    const variantStyles = {
      primary:
        "bg-[var(--brand-primary)] text-white dark:text-slate-950 font-semibold hover:bg-[var(--brand-primary-hover)] shadow-xs hover:shadow-[0_0_18px_rgba(0,229,255,0.3)] active:scale-[0.98]",
      secondary:
        "bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] backdrop-blur-md hover:border-[var(--border-luminous)]/40",
      outline:
        "border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] backdrop-blur-md hover:border-[var(--border-luminous)]/40",
      ghost:
        "bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)]",
      danger:
        "bg-[var(--accent-danger)] text-white hover:opacity-90 shadow-xs hover:shadow-[0_0_15px_rgba(244,63,94,0.3)] active:scale-[0.98]",
      cyber:
        "bg-gradient-to-r from-[var(--brand-cyan)] to-[var(--brand-magenta)] text-slate-950 font-bold hover:opacity-95 shadow-[0_0_18px_rgba(0,229,255,0.3)] active:scale-[0.98]",
    };

    const sizeStyles = {
      sm: "h-8 px-3 text-xs gap-1.5",
      md: "h-10 px-4 text-sm gap-2",
      lg: "h-12 px-6 text-base gap-2.5",
      icon: "h-9 w-9 p-0",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      >
        {isLoading && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
