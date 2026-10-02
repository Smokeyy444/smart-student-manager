"use client";

import * as React from "react";
import { useTheme } from "./theme-provider";
import { Sun, Moon, Laptop } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1">
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-label="Light theme"
        title="Light theme"
        className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${
          theme === "light"
            ? "bg-[var(--brand-primary)] text-white shadow-xs"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        }`}
      >
        <Sun className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setTheme("system")}
        aria-label="System theme"
        title="System theme"
        className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${
          theme === "system"
            ? "bg-[var(--brand-primary)] text-white shadow-xs"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        }`}
      >
        <Laptop className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-label="Dark theme"
        title="Dark theme"
        className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${
          theme === "dark"
            ? "bg-[var(--brand-primary)] text-white shadow-xs"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        }`}
      >
        <Moon className="h-4 w-4" />
      </button>
    </div>
  );
}
