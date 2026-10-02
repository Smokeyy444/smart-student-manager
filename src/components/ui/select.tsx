import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  label: string;
  value: string | number;
}

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options?: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, options, children, required, ...props }, ref) => {
    const generatedId = React.useId();
    const selectId = id || generatedId;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-xs font-medium text-[var(--text-secondary)]"
          >
            {label}
            {required && <span className="text-[var(--accent-danger)] ml-0.5">*</span>}
          </label>
        )}
        <div className="relative">
          <select
            id={selectId}
            ref={ref}
            required={required}
            className={cn(
              "flex h-10 w-full appearance-none rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 pr-8 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--brand-primary)] focus:outline-hidden focus:ring-1 focus:ring-[var(--brand-primary)] disabled:cursor-not-allowed disabled:opacity-50",
              error && "border-[var(--accent-danger)]",
              className
            )}
            {...props}
          >
            {options
              ? options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-[var(--text-muted)]" />
        </div>
        {error && <p className="text-xs text-[var(--accent-danger)]">{error}</p>}
      </div>
    );
  }
);

Select.displayName = "Select";
