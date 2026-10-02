"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  type?: ToastType;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  showToast: (toast: Omit<ToastItem, "id">) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const dismissToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = React.useCallback(
    ({ title, description, type = "info", duration = 4000 }: Omit<ToastItem, "id">) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: ToastItem = { id, title, description, type, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          dismissToast(id);
        }, duration);
      }
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex max-w-md flex-col gap-2 pointer-events-none"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-lg border p-4 shadow-lg transition-all animate-in fade-in slide-in-from-bottom-5",
              "bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-subtle)]",
              toast.type === "success" && "border-l-4 border-l-[var(--accent-success)]",
              toast.type === "error" && "border-l-4 border-l-[var(--accent-danger)]",
              toast.type === "warning" && "border-l-4 border-l-[var(--accent-warning)]",
              toast.type === "info" && "border-l-4 border-l-[var(--brand-primary)]"
            )}
          >
            <div className="shrink-0 mt-0.5">
              {toast.type === "success" && (
                <CheckCircle2 className="h-5 w-5 text-[var(--accent-success)]" />
              )}
              {toast.type === "error" && (
                <AlertCircle className="h-5 w-5 text-[var(--accent-danger)]" />
              )}
              {toast.type === "warning" && (
                <AlertTriangle className="h-5 w-5 text-[var(--accent-warning)]" />
              )}
              {toast.type === "info" && (
                <Info className="h-5 w-5 text-[var(--brand-primary)]" />
              )}
            </div>

            <div className="flex-1">
              <div className="font-semibold text-sm">{toast.title}</div>
              {toast.description && (
                <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {toast.description}
                </div>
              )}
            </div>

            <button
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss toast"
              className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-sm p-0.5"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return {
    toast: context.showToast,
    dismiss: context.dismissToast,
  };
}
