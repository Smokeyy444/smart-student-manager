"use client";

import * as React from "react";
import { simulateWhatIfSGPA } from "@/lib/calculations/gpa";
import type { GradingScaleDefinition } from "@/lib/constants/grading";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Sparkles, RotateCcw, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface SubjectItem {
  id: string;
  name: string;
  code?: string | null;
  creditHours: number;
  isAudit: boolean;
  grade?: {
    gradeLetter?: string | null;
    gradePoint?: number | null;
  } | null;
}

interface WhatIfSimulatorProps {
  subjects: SubjectItem[];
  gradingScale: GradingScaleDefinition;
  semesterName: string;
}

export function WhatIfSimulator({
  subjects,
  gradingScale,
  semesterName,
}: WhatIfSimulatorProps) {
  // Filter only credit-bearing subjects (audit courses don't impact SGPA)
  const creditBearingSubjects = React.useMemo(
    () => subjects.filter((s) => !s.isAudit && s.creditHours > 0),
    [subjects]
  );

  // Hypothetical grades state: Map<subjectId, newGradeLetter>
  const [hypotheticalGrades, setHypotheticalGrades] = React.useState<Record<string, string>>({});

  const handleGradeChange = (subjectId: string, gradeLetter: string) => {
    setHypotheticalGrades((prev) => ({
      ...prev,
      [subjectId]: gradeLetter,
    }));
  };

  const handleReset = () => {
    setHypotheticalGrades({});
  };

  // Convert subjects to domain calculation format
  const calculationSubjects = React.useMemo(() => {
    return creditBearingSubjects.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code || undefined,
      creditHours: s.creditHours,
      isAudit: false,
      gradeLetter: s.grade?.gradeLetter || null,
      gradePoint: s.grade?.gradePoint !== null && s.grade?.gradePoint !== undefined ? s.grade.gradePoint : null,
    }));
  }, [creditBearingSubjects]);

  // Modifications array
  const modifications = React.useMemo(() => {
    return Object.entries(hypotheticalGrades).map(([subjectId, letter]) => ({
      subjectId,
      newGradeLetter: letter,
    }));
  }, [hypotheticalGrades]);

  // Run pure simulator
  const prediction = React.useMemo(() => {
    return simulateWhatIfSGPA(calculationSubjects, modifications, gradingScale);
  }, [calculationSubjects, modifications, gradingScale]);

  const hasModifications = Object.keys(hypotheticalGrades).length > 0;

  if (creditBearingSubjects.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center text-xs text-[var(--text-muted)]">
          Enroll credit-bearing subjects in {semesterName} to unlock the What-If GPA Simulator.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-[var(--brand-primary)]/30 bg-[var(--bg-surface)] overflow-hidden shadow-xs">
      <CardHeader className="bg-[var(--brand-primary)]/5 pb-4 border-b border-[var(--border-subtle)]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--brand-primary)] text-white shadow-2xs">
                <Sparkles className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">What-If GPA Simulator</CardTitle>
              <Badge variant="default">Pure Simulation</Badge>
            </div>
            <CardDescription className="text-xs">
              Simulate hypothetical grades in <strong>{semesterName}</strong> to predict final SGPA without altering your actual records.
            </CardDescription>
          </div>

          {hasModifications && (
            <Button variant="ghost" size="sm" onClick={handleReset} className="self-start sm:self-auto">
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Reset All
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-5">
        {/* Simulation Output KPI Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4">
          <div>
            <span className="text-[11px] font-medium text-[var(--text-muted)] block uppercase tracking-wider">
              Current Baseline SGPA
            </span>
            <span className="text-xl font-bold text-[var(--text-primary)] tabular-nums">
              {prediction.baselineSGPA !== null ? prediction.baselineSGPA.toFixed(2) : "N/A"}
            </span>
            <span className="text-[10px] text-[var(--text-muted)] block">From recorded grades</span>
          </div>

          <div>
            <span className="text-[11px] font-medium text-[var(--text-muted)] block uppercase tracking-wider">
              Projected Final SGPA
            </span>
            <span className="text-xl font-bold text-[var(--brand-primary)] tabular-nums">
              {prediction.predictedSGPA !== null ? prediction.predictedSGPA.toFixed(2) : "N/A"}
            </span>
            <span className="text-[10px] text-[var(--text-muted)] block">
              Across {prediction.totalCredits} enrolled credits
            </span>
          </div>

          <div>
            <span className="text-[11px] font-medium text-[var(--text-muted)] block uppercase tracking-wider">
              Projected Delta
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              {prediction.delta !== null && prediction.delta > 0 && (
                <Badge variant="success" className="gap-1 text-xs">
                  <TrendingUp className="h-3.5 w-3.5" />
                  +{prediction.delta.toFixed(2)}
                </Badge>
              )}
              {prediction.delta !== null && prediction.delta < 0 && (
                <Badge variant="danger" className="gap-1 text-xs">
                  <TrendingDown className="h-3.5 w-3.5" />
                  {prediction.delta.toFixed(2)}
                </Badge>
              )}
              {(prediction.delta === 0 || prediction.delta === null) && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Minus className="h-3.5 w-3.5" />
                  0.00
                </Badge>
              )}
            </div>
            <span className="text-[10px] text-[var(--text-muted)] block mt-0.5">
              {hasModifications ? "Based on simulated changes" : "Change a grade below to simulate"}
            </span>
          </div>
        </div>

        {/* Interactive Subject Simulation Grid */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Adjust Hypothetical Grades:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {creditBearingSubjects.map((sub) => {
              const currentGrade = sub.grade?.gradeLetter || "Not Graded";
              const selectedSim = hypotheticalGrades[sub.id] || sub.grade?.gradeLetter || "";

              return (
                <div
                  key={sub.id}
                  className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-xs"
                >
                  <div className="space-y-0.5 pr-2">
                    <p className="font-semibold text-sm text-[var(--text-primary)] line-clamp-1">
                      {sub.name}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {sub.code ? `${sub.code} • ` : ""}
                      {sub.creditHours} Credits • Current:{" "}
                      <span className="font-semibold text-[var(--text-secondary)]">{currentGrade}</span>
                    </p>
                  </div>

                  <div className="w-28 shrink-0">
                    <select
                      value={selectedSim}
                      onChange={(e) => handleGradeChange(sub.id, e.target.value)}
                      aria-label={`Simulate grade for ${sub.name}`}
                      className="w-full h-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-2 text-xs font-semibold text-[var(--text-primary)] focus:outline-hidden focus:ring-1 focus:ring-[var(--brand-primary)]"
                    >
                      <option value="">(Select)</option>
                      {gradingScale.mappings.map((m) => (
                        <option key={m.letter} value={m.letter}>
                          {m.letter} ({m.points.toFixed(0)} pts)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
