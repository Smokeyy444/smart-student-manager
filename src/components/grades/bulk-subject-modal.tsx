"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { bulkCreateSubjects } from "@/lib/actions/academic";
import { parseAcademicCsv, type ParsedSubjectRow } from "@/lib/utils/csv-parser";
import type { BulkSubjectRowInput } from "@/lib/validations/academic";

interface BulkSubjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  semesterId: string;
  semesterName: string;
}

interface EditableSubjectRow extends BulkSubjectRowInput {
  id: string; // client-side row key
}

const CATEGORY_OPTIONS = [
  { label: "Core Subject", value: "CORE" },
  { label: "Professional / Open Elective", value: "ELECTIVE" },
  { label: "Laboratory / Practical", value: "LAB" },
  { label: "Audit / Non-Credit Course", value: "AUDIT" },
];

export function BulkSubjectModal({
  open,
  onOpenChange,
  semesterId,
  semesterName,
}: BulkSubjectModalProps) {
  const { toast } = useToast();
  const router = useRouter();

  const [activeTab, setActiveTab] = React.useState<"GRID" | "IMPORT">("GRID");
  const [rows, setRows] = React.useState<EditableSubjectRow[]>([
    { id: "row-1", code: "", name: "", creditHours: 4.0, category: "CORE", isAudit: false },
    { id: "row-2", code: "", name: "", creditHours: 4.0, category: "CORE", isAudit: false },
    { id: "row-3", code: "", name: "", creditHours: 3.0, category: "CORE", isAudit: false },
    { id: "row-4", code: "", name: "", creditHours: 3.0, category: "CORE", isAudit: false },
    { id: "row-5", code: "", name: "", creditHours: 2.0, category: "LAB", isAudit: false },
  ]);

  const [rawPasteText, setRawPasteText] = React.useState("");
  const [parsedPreview, setParsedPreview] = React.useState<ParsedSubjectRow[] | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);


  const addEmptyRow = () => {
    const newId = `row-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    setRows((prev) => [
      ...prev,
      { id: newId, code: "", name: "", creditHours: 3.0, category: "CORE", isAudit: false },
    ]);
  };

  const removeRow = (id: string) => {
    if (rows.length <= 1) {
      setRows([{ id: "row-1", code: "", name: "", creditHours: 3.0, category: "CORE", isAudit: false }]);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, updates: Partial<BulkSubjectRowInput>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, ...updates };
        if (updates.isAudit !== undefined) {
          if (updates.isAudit) {
            updated.category = "AUDIT";
            updated.creditHours = 0;
          } else {
            updated.category = "CORE";
            if (updated.creditHours === 0) updated.creditHours = 3.0;
          }
        }
        return updated;
      })
    );
  };

  // Keyboard navigation & smart paste on the table
  const handleTablePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text");
    if (!text || (!text.includes("\t") && !text.includes("\n") && !text.includes(","))) {
      return; // normal single-input paste
    }

    e.preventDefault();
    const result = parseAcademicCsv(text);
    if (result.allRows.length > 0) {
      const newItems: EditableSubjectRow[] = result.allRows.map((item, idx) => ({
        id: `paste-${Date.now()}-${idx}`,
        ...item.data,
      }));
      setRows(newItems);
      toast({
        title: "Pasted Data Loaded",
        description: `Loaded ${newItems.length} rows into the spreadsheet table.`,
        type: "info",
      });
    }
  };

  // Import Tab: Parse raw text
  const handleParseText = () => {
    if (!rawPasteText.trim()) {
      setParsedPreview(null);
      return;
    }
    const result = parseAcademicCsv(rawPasteText);
    setParsedPreview(result.allRows);
  };

  const handleApplyImportedRows = (onlyValid: boolean = false) => {
    if (!parsedPreview || parsedPreview.length === 0) return;
    const candidates = onlyValid ? parsedPreview.filter((r) => r.isValid) : parsedPreview;
    if (candidates.length === 0) {
      toast({ title: "No Valid Rows", description: "There are no valid rows to import.", type: "warning" });
      return;
    }

    const newRows: EditableSubjectRow[] = candidates.map((item, idx) => ({
      id: `imported-${Date.now()}-${idx}`,
      ...item.data,
    }));

    setRows(newRows);
    setActiveTab("GRID");
    toast({
      title: "Data Imported to Table",
      description: `Loaded ${newRows.length} subjects into the spreadsheet. Review and click 'Save All'.`,
      type: "success",
    });
  };

  // CSV File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRawPasteText(content);
        const result = parseAcademicCsv(content);
        setParsedPreview(result.allRows);
      }
    };
    reader.readAsText(file);
  };

  // Submission
  const handleSaveAll = async () => {
    setServerError(null);

    // Filter out completely blank rows
    const filledRows = rows.filter((r) => r.name.trim().length > 0 || (r.code && r.code.trim().length > 0));

    if (filledRows.length === 0) {
      setServerError("Please enter at least one subject name before saving.");
      return;
    }

    // Client-side validations
    for (let i = 0; i < filledRows.length; i++) {
      const r = filledRows[i];
      if (!r.name.trim()) {
        setServerError(`Row ${i + 1} has a course code but no subject name.`);
        return;
      }
      if (typeof r.creditHours !== "number" || r.creditHours < 0 || isNaN(r.creditHours)) {
        setServerError(`Row ${i + 1} (${r.name}): Credits cannot be negative.`);
        return;
      }
    }

    // Check duplicate codes in submission
    const seenCodes = new Set<string>();
    for (const r of filledRows) {
      if (r.code && r.code.trim().length > 0) {
        const codeUpper = r.code.trim().toUpperCase();
        if (seenCodes.has(codeUpper)) {
          setServerError(`Duplicate course code '${r.code}' found in your list.`);
          return;
        }
        seenCodes.add(codeUpper);
      }
    }

    setIsSubmitting(true);
    try {
      const res = await bulkCreateSubjects({
        semesterId,
        subjects: filledRows.map(({ code, name, creditHours, category, isAudit }) => ({
          code: code ? code.trim() : null,
          name: name.trim(),
          creditHours,
          category,
          isAudit,
        })),
      });

      if (res.success) {
        toast({
          title: "Subjects Created",
          description: `Successfully enrolled ${filledRows.length} subjects in ${semesterName}.`,
          type: "success",
        });
        onOpenChange(false);
        router.refresh();
      } else {
        setServerError(res.error || "Failed to bulk save subjects.");
      }
    } catch {
      setServerError("An unexpected error occurred while saving subjects.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = (newOpen: boolean) => {
    if (!newOpen) {
      setServerError(null);
      setParsedPreview(null);
      setRawPasteText("");
    }
    onOpenChange(newOpen);
  };

  const validSubjectsCount = rows.filter((r) => r.name.trim().length > 0).length;

  return (
    <Dialog open={open} onOpenChange={handleClose} className="max-w-4xl w-[95vw]">
      <DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
          <DialogTitle className="text-lg font-bold">Bulk Add Subjects — {semesterName}</DialogTitle>
          <div className="flex items-center gap-1.5 bg-[var(--bg-surface-elevated)] p-1 rounded-lg border border-[var(--border-subtle)] text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("GRID")}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                activeTab === "GRID"
                  ? "bg-[var(--brand-primary)] text-white shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Spreadsheet Grid
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("IMPORT")}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                activeTab === "IMPORT"
                  ? "bg-[var(--brand-primary)] text-white shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Paste / CSV Import
            </button>
          </div>
        </div>
        <DialogDescription>
          Enter 7–8 courses in one screen. Supports Tab/Enter navigation, copying from Excel/Sheets, and CSV files.
        </DialogDescription>
      </DialogHeader>

      {serverError && (
        <div
          role="alert"
          className="rounded-lg border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10 p-3 text-xs text-[var(--accent-danger)] font-medium"
        >
          {serverError}
        </div>
      )}

      {/* Tab 1: Spreadsheet Table */}
      {activeTab === "GRID" && (
        <div className="space-y-4">
          <div
            className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] max-h-[50vh]"
            onPaste={handleTablePaste}
          >
            {/* Desktop Table View */}
            <table className="w-full text-xs text-left border-collapse min-w-[650px]">
              <thead className="sticky top-0 bg-[var(--bg-surface-elevated)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)] uppercase tracking-wider font-semibold z-10">
                <tr>
                  <th className="py-2.5 px-3 w-12 text-center">#</th>
                  <th className="py-2.5 px-3 w-32">Course Code</th>
                  <th className="py-2.5 px-3">Subject Name *</th>
                  <th className="py-2.5 px-3 w-24">Credits *</th>
                  <th className="py-2.5 px-3 w-36">Category</th>
                  <th className="py-2.5 px-3 w-28 text-center">Audit</th>
                  <th className="py-2.5 px-3 w-12 text-center">Del</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {rows.map((row, idx) => {
                  const isRowEmpty = !row.name.trim() && !row.code?.trim();
                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-[var(--bg-surface-elevated)]/50 transition-colors ${
                        isRowEmpty ? "opacity-75" : ""
                      }`}
                    >
                      <td className="py-2 px-3 text-center text-[var(--text-muted)] font-mono">{idx + 1}</td>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          value={row.code || ""}
                          placeholder="e.g. CS201"
                          onChange={(e) => updateRow(row.id, { code: e.target.value })}
                          className="w-full h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-xs text-[var(--text-primary)] uppercase focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          value={row.name}
                          placeholder="e.g. Data Structures & Algorithms"
                          onChange={(e) => updateRow(row.id, { name: e.target.value })}
                          className={`w-full h-8 px-2 rounded border text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 ${
                            !row.name.trim() && row.code?.trim()
                              ? "border-[var(--accent-danger)] ring-1 ring-[var(--accent-danger)]"
                              : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] focus:ring-[var(--brand-primary)]"
                          }`}
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="30"
                          disabled={row.isAudit}
                          value={row.isAudit ? 0 : (row.creditHours !== undefined ? Number(row.creditHours) : 3.0)}
                          onChange={(e) => updateRow(row.id, { creditHours: parseFloat(e.target.value) || 0 })}
                          className="w-full h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-xs text-center tabular-nums text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] disabled:opacity-50"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <select
                          value={row.category || "CORE"}
                          disabled={row.isAudit}
                          onChange={(e) =>
                            updateRow(row.id, {
                              category: e.target.value as BulkSubjectRowInput["category"],
                            })
                          }
                          className="w-full h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] disabled:opacity-50"
                        >
                          {CATEGORY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={row.isAudit}
                          onChange={(e) => updateRow(row.id, { isAudit: e.target.checked })}
                          className="h-4 w-4 rounded border-[var(--border-subtle)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] cursor-pointer"
                        />
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent-danger)] hover:bg-[var(--accent-danger)]/10 transition-colors"
                          title="Remove row"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-secondary)]">
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addEmptyRow}>
                + Add Another Row
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRows((prev) => prev.filter((r) => r.name.trim() || r.code?.trim()))}
              >
                Clear Blank Rows
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-[var(--text-primary)]">
                {validSubjectsCount} {validSubjectsCount === 1 ? "subject" : "subjects"} ready to save
              </span>
              <span className="text-[var(--text-muted)]">
                ({rows.reduce((sum, r) => sum + (r.isAudit ? 0 : Number(r.creditHours) || 0), 0).toFixed(1)} Credits)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Paste / CSV Import */}
      {activeTab === "IMPORT" && (
        <div className="space-y-4 text-xs">
          <div className="bg-[var(--bg-surface-elevated)] p-3 rounded-lg border border-[var(--border-subtle)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--text-primary)]">Direct Copy/Paste or File Upload</span>
              <label className="cursor-pointer text-xs font-medium text-[var(--brand-primary)] hover:underline">
                <span>Upload .CSV File</span>
                <input type="file" accept=".csv,.tsv,.txt" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
            <p className="text-[var(--text-secondary)] leading-relaxed">
              Copy rows from Excel or Google Sheets and paste below. Expected columns:
              <br />
              <code className="bg-[var(--bg-surface)] px-1.5 py-0.5 rounded text-[var(--brand-primary)] font-mono text-[11px]">
                [Code] [Subject Name] [Credits] [Category] [Audit]
              </code>
            </p>
          </div>

          <textarea
            rows={5}
            value={rawPasteText}
            placeholder={`CSE214\tData Structures\t4\tCore\nCSE215\tDatabase Management\t4\tCore\nCSE216\tOperating Systems\t3.5\tCore\nPE101\tPhysical Education\t0\tAudit\ttrue`}
            onChange={(e) => {
              setRawPasteText(e.target.value);
              handleParseText();
            }}
            className="w-full p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
          />

          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" size="sm" onClick={handleParseText}>
              Parse & Preview Rows
            </Button>
            {parsedPreview && (
              <div className="flex items-center gap-2">
                <span className="font-medium text-[var(--text-primary)]">
                  {parsedPreview.length} detected ({parsedPreview.filter((r) => r.isValid).length} valid)
                </span>
                <Button type="button" size="sm" onClick={() => handleApplyImportedRows(false)}>
                  Load All into Spreadsheet
                </Button>
                {parsedPreview.some((r) => !r.isValid) && (
                  <Button type="button" variant="outline" size="sm" onClick={() => handleApplyImportedRows(true)}>
                    Import Only Valid Rows
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Validation Preview Table */}
          {parsedPreview && parsedPreview.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--border-subtle)]">
              <table className="w-full text-xs text-left">
                <thead className="sticky top-0 bg-[var(--bg-surface-elevated)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)] font-semibold">
                  <tr>
                    <th className="py-2 px-3 w-12 text-center">Row</th>
                    <th className="py-2 px-3 w-24">Code</th>
                    <th className="py-2 px-3">Name</th>
                    <th className="py-2 px-3 w-16 text-center">Credits</th>
                    <th className="py-2 px-3 w-20">Category</th>
                    <th className="py-2 px-3 w-28 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {parsedPreview.map((item) => (
                    <tr
                      key={item.rowNumber}
                      className={item.isValid ? "bg-[var(--bg-surface)]" : "bg-[var(--accent-danger)]/5"}
                    >
                      <td className="py-1.5 px-3 text-center font-mono text-[var(--text-muted)]">{item.rowNumber}</td>
                      <td className="py-1.5 px-3 font-mono">{item.data.code || "—"}</td>
                      <td className="py-1.5 px-3 font-medium">
                        {item.data.name || <span className="text-[var(--accent-danger)] italic">Missing Name</span>}
                        {item.errors.length > 0 && (
                          <div className="text-[11px] text-[var(--accent-danger)] mt-0.5">
                            {item.errors.map((err, eIdx) => (
                              <div key={eIdx}>
                                &bull; {err.problem} <em>({err.correctionNeeded})</em>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-center tabular-nums">{String(item.data.creditHours ?? "")}</td>
                      <td className="py-1.5 px-3">
                        <Badge variant={item.data.isAudit ? "secondary" : "default"}>{item.data.category || "CORE"}</Badge>
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        {item.isValid ? (
                          <span className="text-[var(--accent-success)] font-medium">&#10003; Valid</span>
                        ) : (
                          <span className="text-[var(--accent-danger)] font-medium">&#9888; Has Issues</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <DialogFooter className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--border-subtle)]">
        <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <div className="flex items-center gap-2">
          {activeTab === "IMPORT" && (
            <Button type="button" variant="outline" size="sm" onClick={() => setActiveTab("GRID")}>
              Back to Table
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={handleSaveAll}
            disabled={isSubmitting || validSubjectsCount === 0}
            className="min-w-[140px]"
          >
            {isSubmitting ? "Saving All..." : `Save All ${validSubjectsCount > 0 ? `(${validSubjectsCount})` : ""}`}
          </Button>
        </div>
      </DialogFooter>
    </Dialog>
  );
}
