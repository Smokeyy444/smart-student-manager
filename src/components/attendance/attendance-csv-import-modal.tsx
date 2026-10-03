"use client";

import * as React from "react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { bulkUpdateAttendance } from "@/lib/actions/academic";
import { parseAttendanceCsv, type ParsedAttendanceRow } from "@/lib/utils/attendance-csv";
import { Upload, FileText, AlertTriangle, CheckCircle2 } from "lucide-react";

interface SubjectItem {
  id: string;
  name: string;
  code?: string | null;
}

interface AttendanceCsvImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  semesterName: string;
  subjects: SubjectItem[];
}

export function AttendanceCsvImportModal({
  open,
  onOpenChange,
  semesterName,
  subjects,
}: AttendanceCsvImportModalProps) {
  const { toast } = useToast();
  const router = useRouter();

  const [rawText, setRawText] = React.useState("");
  const [parseResult, setParseResult] = React.useState<ReturnType<typeof parseAttendanceCsv> | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [matchWarnings, setMatchWarnings] = React.useState<string[]>([]);

  const handleParse = React.useCallback((text: string) => {
    if (!text.trim()) {
      setParseResult(null);
      setMatchWarnings([]);
      return;
    }
    const result = parseAttendanceCsv(text);
    setParseResult(result);

    // Check if valid rows can be matched to known subjects
    const warnings: string[] = [];
    for (const row of result.validRows) {
      const matched = findSubjectMatch(row, subjects);
      if (!matched) {
        warnings.push(
          `Row ${row.rowNumber}: "${row.subjectName}" could not be matched to a subject in ${semesterName}.`
        );
      }
    }
    setMatchWarnings(warnings);
  }, [subjects, semesterName]);

  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setRawText("");
      setParseResult(null);
      setServerError(null);
      setMatchWarnings([]);
    }
  }

  const handleTextChange = (text: string) => {
    setRawText(text);
    handleParse(text);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setRawText(text);
      handleParse(text);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleSave = async () => {
    if (!parseResult || parseResult.validRows.length === 0) {
      setServerError("No valid rows to import.");
      return;
    }

    setServerError(null);
    const records: { subjectId: string; classesAttended: number; classesConducted: number }[] = [];

    for (const row of parseResult.validRows) {
      const matched = findSubjectMatch(row, subjects);
      if (!matched) continue;
      records.push({
        subjectId: matched.id,
        classesAttended: row.classesAttended,
        classesConducted: row.classesConducted,
      });
    }

    if (records.length === 0) {
      setServerError("No valid rows could be matched to subjects in this semester.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await bulkUpdateAttendance({ records });
      if (res.success) {
        toast({
          title: "Attendance Imported",
          description: `${records.length} subjects updated in ${semesterName}.`,
          type: "success",
        });
        onOpenChange(false);
        router.refresh();
      } else {
        setServerError(res.error || "Import failed.");
      }
    } catch {
      setServerError("An unexpected error occurred during import.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const matchableCount = parseResult
    ? parseResult.validRows.filter((r) => !!findSubjectMatch(r, subjects)).length
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-3xl w-[95vw]">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-[var(--brand-primary)]" />
          Import Attendance from CSV / Spreadsheet
        </DialogTitle>
        <DialogDescription>
          Paste from Excel or Google Sheets, or upload a CSV file. Expected columns:{" "}
          <code className="text-xs font-mono">subjectCode, subjectName, attended, conducted</code>
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {/* File upload */}
        <div className="flex items-center gap-3">
          <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)] transition-colors">
            <Upload className="h-3.5 w-3.5" />
            Upload CSV File
            <input type="file" accept=".csv,.tsv,.txt" onChange={handleFileUpload} className="hidden" />
          </label>
          <span className="text-xs text-[var(--text-muted)]">or paste below</span>
        </div>

        {/* Text area */}
        <div className="space-y-1.5">
          <label htmlFor="attendance-csv-input" className="text-xs font-semibold text-[var(--text-secondary)]">
            CSV / Pasted Data
          </label>
          <textarea
            id="attendance-csv-input"
            value={rawText}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder={"subjectCode,subjectName,attended,conducted\nCSE202,Data Structures,35,42\nCSE205,Computer Networks,32,38"}
            rows={6}
            className="w-full px-3 py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] resize-none"
          />
        </div>

        {/* Parse summary */}
        {parseResult && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <Badge variant="secondary">{parseResult.totalRows} rows detected</Badge>
              <Badge
                variant="default"
                className="bg-[var(--accent-success)]/15 text-[var(--accent-success)] border-[var(--accent-success)]/30"
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {parseResult.validRows.length} valid
              </Badge>
              {parseResult.invalidRows.length > 0 && (
                <Badge
                  variant="default"
                  className="bg-[var(--accent-danger)]/15 text-[var(--accent-danger)] border-[var(--accent-danger)]/30"
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {parseResult.invalidRows.length} invalid
                </Badge>
              )}
              {matchableCount > 0 && (
                <Badge variant="default" className="bg-[var(--brand-primary)]/15 text-[var(--brand-primary)] border-[var(--brand-primary)]/30">
                  {matchableCount} will be imported
                </Badge>
              )}
            </div>

            {/* Error rows */}
            {parseResult.invalidRows.length > 0 && (
              <div className="rounded-lg border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/5 p-3 space-y-2">
                <p className="text-xs font-semibold text-[var(--accent-danger)]">
                  Invalid rows (will be skipped):
                </p>
                {parseResult.invalidRows.slice(0, 5).map((row) => (
                  <div key={row.rowNumber} className="text-xs text-[var(--text-secondary)]">
                    <span className="font-mono font-bold text-[var(--accent-danger)]">Row {row.rowNumber}:</span>{" "}
                    {row.errors.map((e) => `${e.field}: ${e.problem}`).join("; ")}
                  </div>
                ))}
                {parseResult.invalidRows.length > 5 && (
                  <p className="text-xs text-[var(--text-muted)]">
                    …and {parseResult.invalidRows.length - 5} more invalid rows.
                  </p>
                )}
              </div>
            )}

            {/* Match warnings */}
            {matchWarnings.length > 0 && (
              <div className="rounded-lg border border-[var(--accent-warning)]/30 bg-[var(--accent-warning)]/5 p-3 space-y-1">
                <p className="text-xs font-semibold text-[var(--accent-warning)]">
                  Unmatched subjects (will be skipped):
                </p>
                {matchWarnings.slice(0, 4).map((w, i) => (
                  <p key={i} className="text-xs text-[var(--text-secondary)]">{w}</p>
                ))}
                {matchWarnings.length > 4 && (
                  <p className="text-xs text-[var(--text-muted)]">…and {matchWarnings.length - 4} more.</p>
                )}
              </div>
            )}

            {/* Preview table */}
            {parseResult.validRows.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] max-h-[220px]">
                <table className="w-full text-xs border-collapse min-w-[500px]">
                  <thead className="sticky top-0 bg-[var(--bg-surface-elevated)] border-b border-[var(--border-subtle)]">
                    <tr>
                      <th className="text-left py-2 px-3 text-[var(--text-secondary)] font-semibold uppercase tracking-wider">Row</th>
                      <th className="text-left py-2 px-3 text-[var(--text-secondary)] font-semibold uppercase tracking-wider">Code</th>
                      <th className="text-left py-2 px-3 text-[var(--text-secondary)] font-semibold uppercase tracking-wider">Subject</th>
                      <th className="py-2 px-3 text-center text-[var(--text-secondary)] font-semibold uppercase tracking-wider">Attended</th>
                      <th className="py-2 px-3 text-center text-[var(--text-secondary)] font-semibold uppercase tracking-wider">Conducted</th>
                      <th className="py-2 px-3 text-center text-[var(--text-secondary)] font-semibold uppercase tracking-wider">Match</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {parseResult.validRows.map((row) => {
                      const matched = findSubjectMatch(row, subjects);
                      return (
                        <tr key={row.rowNumber} className="hover:bg-[var(--bg-surface-elevated)]/50">
                          <td className="py-2 px-3 text-[var(--text-muted)] tabular-nums">{row.rowNumber}</td>
                          <td className="py-2 px-3 font-mono text-[var(--text-secondary)]">{row.subjectCode || "—"}</td>
                          <td className="py-2 px-3 text-[var(--text-primary)] font-medium max-w-[180px] truncate">{row.subjectName}</td>
                          <td className="py-2 px-3 text-center tabular-nums text-[var(--text-primary)]">{row.classesAttended}</td>
                          <td className="py-2 px-3 text-center tabular-nums text-[var(--text-primary)]">{row.classesConducted}</td>
                          <td className="py-2 px-3 text-center">
                            {matched ? (
                              <Badge variant="default" className="bg-[var(--accent-success)]/15 text-[var(--accent-success)] border-[var(--accent-success)]/30 text-[10px]">
                                ✓ Matched
                              </Badge>
                            ) : (
                              <Badge variant="default" className="bg-[var(--accent-warning)]/15 text-[var(--accent-warning)] border-[var(--accent-warning)]/30 text-[10px]">
                                No match
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {serverError && (
          <div role="alert" className="rounded-lg border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10 p-3 text-xs text-[var(--accent-danger)] font-medium">
            {serverError}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSubmitting || matchableCount === 0}
          isLoading={isSubmitting}
        >
          Import {matchableCount > 0 ? `${matchableCount} Subjects` : ""}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ─── Helper: match parsed row to a subject ────────────────────────────────────

function findSubjectMatch(row: ParsedAttendanceRow, subjects: SubjectItem[]): SubjectItem | null {
  // 1. Exact code match (case-insensitive)
  if (row.subjectCode) {
    const byCode = subjects.find(
      (s) => s.code && s.code.toLowerCase() === row.subjectCode.toLowerCase()
    );
    if (byCode) return byCode;
  }

  // 2. Exact name match (case-insensitive)
  const byName = subjects.find(
    (s) => s.name.toLowerCase() === row.subjectName.toLowerCase()
  );
  if (byName) return byName;

  // 3. Partial name match (name contains row name or vice versa)
  const byPartial = subjects.find(
    (s) =>
      s.name.toLowerCase().includes(row.subjectName.toLowerCase()) ||
      row.subjectName.toLowerCase().includes(s.name.toLowerCase())
  );
  return byPartial ?? null;
}
