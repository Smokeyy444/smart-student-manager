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
import {
  processSmartImportImages,
  saveSmartImport,
} from "@/lib/ai/smart-import";
import type {
  ImportDocumentType,
  SmartImportReviewPayload,
  ReviewAttendanceItem,
  ReviewGradeItem,
  ReviewDetailedMarksItem,
  MatchedSubjectInfo,
} from "@/lib/ai/extraction-schemas";
import {
  Sparkles,
  Upload,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  X,
  Plus,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

interface SemesterOption {
  id: string;
  name: string;
  semesterNumber: number;
}

interface SmartImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultImportType?: ImportDocumentType;
  selectedSemesterId?: string;
  semesters: SemesterOption[];
  onFallbackToCsv?: () => void;
}

export function SmartImportModal(props: SmartImportModalProps) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      className="max-w-4xl w-[95vw] max-h-[92vh] overflow-y-auto"
    >
      {props.open && <SmartImportModalContent {...props} />}
    </Dialog>
  );
}

function SmartImportModalContent({
  onOpenChange,
  defaultImportType = "AUTO_DETECT",
  selectedSemesterId,
  semesters,
  onFallbackToCsv,
}: SmartImportModalProps) {
  const { toast } = useToast();
  const router = useRouter();

  // Wizard state: "UPLOAD" | "ANALYZING" | "REVIEW" | "SUMMARY"
  const [step, setStep] = React.useState<"UPLOAD" | "ANALYZING" | "REVIEW" | "SUMMARY">("UPLOAD");

  // Step 1: Upload state
  const [targetSemesterId, setTargetSemesterId] = React.useState<string>(() => {
    return selectedSemesterId || semesters[0]?.id || "";
  });
  const [importType, setImportType] = React.useState<ImportDocumentType>(defaultImportType);
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);
  const [filePreviews, setFilePreviews] = React.useState<string[]>([]);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Step 3: Review state
  const [reviewPayload, setReviewPayload] = React.useState<SmartImportReviewPayload | null>(null);
  const [activeTab, setActiveTab] = React.useState<"ATTENDANCE" | "GRADES" | "MARKS">("ATTENDANCE");
  const [attendanceRows, setAttendanceRows] = React.useState<ReviewAttendanceItem[]>([]);
  const [gradeRows, setGradeRows] = React.useState<ReviewGradeItem[]>([]);
  const [detailedMarksRows, setDetailedMarksRows] = React.useState<ReviewDetailedMarksItem[]>([]);
  const [existingSubjects, setExistingSubjects] = React.useState<MatchedSubjectInfo[]>([]);

  // Step 4: Summary state
  const [summaryData, setSummaryData] = React.useState<{
    importedCount: number;
    skippedCount: number;
    createdSubjectsCount: number;
  } | null>(null);

  const [isSaving, setIsSaving] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Helper to validate image format by MIME or file extension
  const isValidImageType = (file: File) => {
    const allowedMime = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    const mime = file.type?.toLowerCase();
    if (mime && allowedMime.includes(mime)) return true;
    const ext = file.name.split(".").pop()?.toLowerCase();
    return ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "webp";
  };

  // Format file size nicely for previews
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Handle file selection (supports adding multiple files at once or cumulatively)
  const handleFilesAdded = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrorMessage(null);

    const newFiles: File[] = [];
    const newPreviews: string[] = [];
    let limitReached = false;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (selectedFiles.length + newFiles.length >= 5) {
        limitReached = true;
        break;
      }

      if (!isValidImageType(file)) {
        toast({
          title: "Unsupported Format",
          description: `${file.name} is not a supported format. Please use PNG, JPEG, or WEBP.`,
          type: "error",
        });
        continue;
      }

      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: `${file.name} exceeds the 10 MB limit.`,
          type: "error",
        });
        continue;
      }

      newFiles.push(file);
      newPreviews.push(URL.createObjectURL(file));
    }

    if (limitReached) {
      toast({
        title: "Maximum 5 Images",
        description: "You can upload at most 5 screenshots per Smart Import session.",
        type: "warning",
      });
    }

    if (newFiles.length > 0) {
      setSelectedFiles((prev) => [...prev, ...newFiles]);
      setFilePreviews((prev) => [...prev, ...newPreviews]);
    }
  };

  const removeFile = (index: number) => {
    if (filePreviews[index]) {
      URL.revokeObjectURL(filePreviews[index]);
    }
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setFilePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFilesAdded(e.dataTransfer.files);
  };

  // Step 1 -> Step 2 -> Step 3: Trigger Extraction
  const handleStartExtraction = async () => {
    if (selectedFiles.length === 0) {
      setErrorMessage("Please upload at least one screenshot or photo.");
      return;
    }
    if (!targetSemesterId) {
      setErrorMessage("Please select a target semester.");
      return;
    }

    setErrorMessage(null);
    setStep("ANALYZING");

    try {
      const formData = new FormData();
      formData.append("semesterId", targetSemesterId);
      formData.append("documentType", importType);
      for (const file of selectedFiles) {
        formData.append("images", file);
      }

      const res = await processSmartImportImages(formData);

      if (!res.success || !res.payload) {
        setErrorMessage(
          res.error || "AI service is temporarily unavailable. Please try again later or use CSV / Manual Import."
        );
        setStep("UPLOAD");
        return;
      }

      const payload = res.payload;
      setReviewPayload(payload);
      setAttendanceRows(payload.attendanceItems);
      setGradeRows(payload.gradeItems);
      setDetailedMarksRows(payload.detailedMarksItems);
      setExistingSubjects(payload.existingSubjects);

      // Set active tab based on detected type
      if (
        importType === "GRADES" ||
        payload.documentType === "GRADES" ||
        (payload.gradeItems.length > 0 && payload.attendanceItems.length === 0)
      ) {
        setActiveTab("GRADES");
      } else if (
        importType === "ATTENDANCE" ||
        payload.documentType === "ATTENDANCE" ||
        (payload.attendanceItems.length > 0 && payload.gradeItems.length === 0)
      ) {
        setActiveTab("ATTENDANCE");
      } else if (payload.detailedMarksItems.length > 0) {
        setActiveTab("MARKS");
      } else if (payload.gradeItems.length > 0) {
        setActiveTab("GRADES");
      } else {
        setActiveTab("ATTENDANCE");
      }

      setStep("REVIEW");
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "AI service is temporarily unavailable.";
      let message = raw;
      if (
        raw.includes("503") ||
        raw.includes("UNAVAILABLE") ||
        raw.includes("high demand") ||
        raw.includes("overloaded")
      ) {
        message = "AI service is temporarily unavailable. Please try again later or use CSV / Manual Import.";
      }
      console.error("Error during smart extraction:", message);
      setErrorMessage(message);
      setStep("UPLOAD");
    }
  };

  // Step 3: Row editing & validation handlers
  const handleAttendanceChange = <K extends keyof ReviewAttendanceItem>(
    id: string,
    field: K,
    value: ReviewAttendanceItem[K]
  ) => {
    setAttendanceRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const updated = { ...row, [field]: value };

        // Recalculate percentage if attended or conducted changed
        if (field === "attended" || field === "conducted") {
          const att = typeof updated.attended === "number" ? updated.attended : null;
          const cond = typeof updated.conducted === "number" ? updated.conducted : null;

          if (att !== null && cond !== null) {
            if (cond < 0 || att < 0) {
              updated.isValid = false;
              updated.validationError = "Values must be non-negative.";
            } else if (att > cond) {
              updated.isValid = false;
              updated.validationError = `Attended (${att}) cannot exceed conducted (${cond}).`;
            } else {
              const calcPct = cond === 0 ? 100.0 : Math.round((att / cond) * 1000) / 10;
              updated.calculatedPercentage = calcPct;
              updated.isValid = true;
              updated.validationError = null;

              if (updated.extractedPercentage !== null) {
                const diff = Math.abs(calcPct - updated.extractedPercentage);
                if (diff > 0.1) {
                  updated.percentageWarning = `Imported percentage (${updated.extractedPercentage}%) differs from calculated percentage (${calcPct}%). The app will use ${calcPct}% based on ${att}/${cond}.`;
                } else {
                  updated.percentageWarning = null;
                }
              }
            }
          }
        }

        return updated;
      })
    );
  };

  const handleGradeChange = <K extends keyof ReviewGradeItem>(
    id: string,
    field: K,
    value: ReviewGradeItem[K]
  ) => {
    setGradeRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const updated = { ...row, [field]: value };

        // If grade or marks changed, check contradiction
        if (field === "grade" || field === "marksObtained") {
          const marks = typeof updated.marksObtained === "number" ? updated.marksObtained : null;
          const letter = updated.grade ? updated.grade.trim().toUpperCase() : null;

          // Simple live conflict check if both are present
          if (marks !== null && letter) {
            const maxM = updated.maxMarks || 100;
            const pct = (marks / maxM) * 100;
            if ((pct >= 80 && (letter === "F" || letter === "D")) || (pct < 40 && letter === "A+")) {
              updated.isContradictory = true;
              updated.contradictionReason = `Marks (${marks}/${maxM} = ${pct}%) appear to contradict grade '${letter}'. Please verify.`;
              updated.isValid = false;
            } else {
              updated.isContradictory = false;
              updated.contradictionReason = null;
              updated.isValid = true;
            }
          } else {
            updated.isContradictory = false;
            updated.contradictionReason = null;
            updated.isValid = !!letter || marks !== null;
          }
        }

        return updated;
      })
    );
  };

  const handleSubjectSelection = (
    rowId: string,
    type: "ATTENDANCE" | "GRADES" | "MARKS",
    subjectId: string
  ) => {
    if (subjectId === "CREATE_NEW") {
      if (type === "ATTENDANCE") {
        setAttendanceRows((prev) =>
          prev.map((r) =>
            r.id === rowId
              ? {
                  ...r,
                  matchedSubjectId: null,
                  matchStatus: "CREATE_NEW",
                  createNewSubjectName: r.subjectName || r.subjectCode || "New Course",
                }
              : r
          )
        );
      } else if (type === "GRADES") {
        setGradeRows((prev) =>
          prev.map((r) =>
            r.id === rowId
              ? {
                  ...r,
                  matchedSubjectId: null,
                  matchStatus: "CREATE_NEW",
                  createNewSubjectName: r.subjectName || r.subjectCode || "New Course",
                }
              : r
          )
        );
      } else {
        setDetailedMarksRows((prev) =>
          prev.map((r) =>
            r.id === rowId
              ? {
                  ...r,
                  matchedSubjectId: null,
                  matchStatus: "CREATE_NEW",
                  createNewSubjectName: r.subjectName || r.subjectCode || "New Course",
                }
              : r
          )
        );
      }
      return;
    }

    const matched = existingSubjects.find((s) => s.id === subjectId);
    if (!matched) return;

    if (type === "ATTENDANCE") {
      setAttendanceRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                matchedSubjectId: matched.id,
                matchStatus: "EXACT_CODE",
                hasDuplicate: matched.hasExistingAttendance,
                duplicateAction: matched.hasExistingAttendance ? "REPLACE" : "KEEP_EXISTING",
              }
            : r
        )
      );
    } else if (type === "GRADES") {
      setGradeRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                matchedSubjectId: matched.id,
                matchStatus: "EXACT_CODE",
                hasDuplicate: matched.hasExistingGrade,
                duplicateAction: matched.hasExistingGrade ? "REPLACE" : "KEEP_EXISTING",
              }
            : r
        )
      );
    } else {
      setDetailedMarksRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                matchedSubjectId: matched.id,
                matchStatus: "EXACT_CODE",
                hasDuplicate: matched.hasExistingGrade,
                duplicateAction: matched.hasExistingGrade ? "REPLACE" : "KEEP_EXISTING",
              }
            : r
        )
      );
    }
  };

  // Select all valid
  const handleSelectAllValid = () => {
    setAttendanceRows((prev) => prev.map((r) => ({ ...r, selected: r.isValid })));
    setGradeRows((prev) =>
      prev.map((r) => ({ ...r, selected: r.isValid && !r.isContradictory }))
    );
    setDetailedMarksRows((prev) => prev.map((r) => ({ ...r, selected: r.isValid })));
  };

  // Step 3 -> Step 4: Commit import
  const handleConfirmImport = async () => {
    setIsSaving(true);
    setErrorMessage(null);

    try {
      // Build attendance items payload
      const attendanceItemsToSave = attendanceRows
        .filter((r) => r.selected && r.isValid)
        .map((r) => ({
          matchedSubjectId: r.matchedSubjectId,
          createNew: r.matchStatus === "CREATE_NEW" || !r.matchedSubjectId,
          newSubjectCode: r.subjectCode,
          newSubjectName: r.createNewSubjectName || r.subjectName || "New Course",
          newSubjectCredits: 3.0,
          attended: r.attended || 0,
          conducted: r.conducted || 0,
          action: r.duplicateAction,
        }));

      // Build grade items payload from grades rows AND detailed marks rows
      const gradeItemsToSave = [
        ...gradeRows
          .filter((r) => r.selected && r.isValid && !r.isContradictory)
          .map((r) => ({
            matchedSubjectId: r.matchedSubjectId,
            createNew: r.matchStatus === "CREATE_NEW" || !r.matchedSubjectId,
            newSubjectCode: r.subjectCode,
            newSubjectName: r.createNewSubjectName || r.subjectName || "New Course",
            newSubjectCredits: r.credits || 3.0,
            gradeLetter: r.grade,
            gradePoint: r.gradePoint,
            marksObtained: r.marksObtained,
            maxMarks: r.maxMarks || 100.0,
            action: r.duplicateAction,
          })),
        ...detailedMarksRows
          .filter((r) => r.selected && r.isValid)
          .map((r) => ({
            matchedSubjectId: r.matchedSubjectId,
            createNew: r.matchStatus === "CREATE_NEW" || !r.matchedSubjectId,
            newSubjectCode: r.subjectCode,
            newSubjectName: r.createNewSubjectName || r.subjectName || "New Course",
            newSubjectCredits: 3.0,
            gradeLetter: r.finalGrade,
            gradePoint: null,
            marksObtained: r.finalMarksObtained,
            maxMarks: r.finalMaxMarks || 100.0,
            action: r.duplicateAction,
          })),
      ];

      if (attendanceItemsToSave.length === 0 && gradeItemsToSave.length === 0) {
        setErrorMessage("No valid records selected to import.");
        setIsSaving(false);
        return;
      }

      const res = await saveSmartImport({
        semesterId: targetSemesterId,
        attendanceItems: attendanceItemsToSave,
        gradeItems: gradeItemsToSave,
      });

      if (!res.success) {
        setErrorMessage(res.error || "Failed to commit import.");
        setIsSaving(false);
        return;
      }

      setSummaryData({
        importedCount: res.importedCount || 0,
        skippedCount: res.skippedCount || 0,
        createdSubjectsCount: res.createdSubjectsCount || 0,
      });

      setStep("SUMMARY");
      router.refresh();
      toast({
        title: "Smart Import Complete",
        description: `Successfully imported ${res.importedCount || 0} records.`,
        type: "success",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save academic records.";
      console.error("Error saving smart import:", message);
      setErrorMessage(message);
    } finally {
      setIsSaving(false);
    }
  };

  const totalDetected =
    attendanceRows.length + gradeRows.length + detailedMarksRows.length;
  const selectedCount =
    attendanceRows.filter((r) => r.selected).length +
    gradeRows.filter((r) => r.selected).length +
    detailedMarksRows.filter((r) => r.selected).length;

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <DialogTitle>Smart Import — AI Image Data Extraction</DialogTitle>
            <DialogDescription>
              Upload university screenshots of attendance or grades to automatically extract
              structured academic data.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* STEP 1: UPLOAD & CONFIGURATION                                      */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {step === "UPLOAD" && (
        <div className="space-y-5 py-2">
          {errorMessage && (
            <div className="flex items-start gap-3 rounded-lg border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10 p-3 text-sm text-[var(--accent-danger)]">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">{errorMessage}</p>
                {onFallbackToCsv && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      onFallbackToCsv();
                    }}
                    className="text-xs underline font-medium hover:opacity-80"
                  >
                    Switch to manual CSV / TSV Import instead →
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Target Semester */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">
                Target Semester
              </label>
              <select
                value={targetSemesterId}
                onChange={(e) => setTargetSemesterId(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--brand-primary)]"
                id="smart-import-semester-select"
              >
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (Semester {s.semesterNumber})
                  </option>
                ))}
              </select>
            </div>

            {/* Extraction Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">
                Extraction Type
              </label>
              <select
                value={importType}
                onChange={(e) => setImportType(e.target.value as ImportDocumentType)}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--brand-primary)]"
                id="smart-import-type-select"
              >
                <option value="AUTO_DETECT">✨ Auto Detect (Recommended)</option>
                <option value="ATTENDANCE">📅 Attendance Page</option>
                <option value="GRADES">📊 Grades / Result Page</option>
                <option value="DETAILED_MARKS">📝 Assessment / Marks Breakdown</option>
              </select>
            </div>
          </div>

          {/* Drag and Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all ${
              isDragOver
                ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/5"
                : "border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 hover:bg-[var(--bg-surface)]"
            }`}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] mb-3">
              <Upload className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Drag & drop screenshots or click to browse
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Supports PNG, JPEG, and WEBP up to 10 MB each (Max 5 screenshots)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/jpg,image/webp,.png,.jpg,.jpeg,.webp"
              onChange={(e) => {
                handleFilesAdded(e.target.files);
                e.target.value = "";
              }}
              className="hidden"
              id="smart-import-file-input"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-[var(--brand-primary)]/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              {selectedFiles.length > 0 ? "Select Additional Images" : "Choose Images"}
            </button>
          </div>

          {/* Thumbnails preview gallery */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--text-primary)]">
                    {selectedFiles.length} {selectedFiles.length === 1 ? "image" : "images"} selected
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {selectedFiles.length}/5 maximum
                  </Badge>
                </div>
                {selectedFiles.length < 5 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-[var(--brand-primary)] font-medium hover:underline inline-flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add more images
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {selectedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="group relative rounded-lg border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-surface)] shadow-2xs"
                  >
                    <div className="aspect-video w-full bg-slate-900/5 dark:bg-white/5 flex items-center justify-center overflow-hidden relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={filePreviews[idx]}
                        alt={`Screenshot ${idx + 1}`}
                        className="object-cover h-full w-full"
                      />
                      <span className="absolute top-1 left-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">
                        Image {idx + 1}
                      </span>
                    </div>
                    <div className="p-1.5 flex items-center justify-between text-xs">
                      <div className="truncate max-w-[85px]">
                        <span className="truncate block text-[var(--text-secondary)] text-[10px] font-medium" title={file.name}>
                          {file.name}
                        </span>
                        <span className="text-[9px] text-[var(--text-muted)]">
                          {formatFileSize(file.size)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        className="text-[var(--text-muted)] hover:text-[var(--accent-danger)] p-0.5"
                        title={`Remove Image ${idx + 1}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Privacy Callout */}
          <div className="flex items-start gap-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-xs text-[var(--text-secondary)]">
            <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--accent-success)] mt-0.5" />
            <p>
              <strong>Privacy Protection:</strong> Uploaded images are analyzed in memory for academic data extraction and are never permanently stored.
            </p>
          </div>

          <DialogFooter className="flex items-center justify-between">
            {onFallbackToCsv ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onFallbackToCsv();
                }}
              >
                Use CSV / TSV instead
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={selectedFiles.length === 0 || !targetSemesterId}
                onClick={handleStartExtraction}
                id="smart-import-analyze-btn"
                className="gap-1.5"
              >
                <Sparkles className="h-4 w-4" />
                {selectedFiles.length > 1
                  ? `Analyze ${selectedFiles.length} Images with AI`
                  : "Analyze with AI"}
              </Button>
            </div>
          </DialogFooter>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* STEP 2: ANALYZING STATE                                             */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {step === "ANALYZING" && (
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] animate-pulse">
            <Sparkles className="h-8 w-8 animate-spin" style={{ animationDuration: "3s" }} />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-[var(--text-primary)]">
              Extracting Structured Academic Data...
            </h3>
            <p className="text-xs text-[var(--text-secondary)] max-w-md">
              Gemini AI is scanning {selectedFiles.length} screenshot{selectedFiles.length > 1 ? "s" : ""} from top to bottom for complete attendance tables, course codes, and grades.
            </p>
          </div>
          <div className="flex flex-col items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span>This usually takes 3 to 8 seconds...</span>
            </div>
            <span className="text-[11px] text-[var(--text-muted)]/80">
              If the AI service is experiencing high demand, Smart Import retries automatically.
            </span>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* STEP 3: REVIEW & EDIT SCREEN                                        */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {step === "REVIEW" && (
        <div className="space-y-4 py-1">
          {errorMessage && (
            <div className="flex items-center gap-2 rounded-lg border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10 p-2.5 text-xs text-[var(--accent-danger)]">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Completeness Warning Banner */}
          {reviewPayload?.isPotentiallyIncomplete && (
            <div className="flex items-start gap-2.5 rounded-xl border border-[var(--accent-warning)]/40 bg-[var(--accent-warning)]/10 p-3 text-xs text-[var(--accent-warning)]">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold text-sm">Extraction Warning: Potential Incomplete Extraction</p>
                <p>
                  {reviewPayload.completenessWarning ||
                    `Only ${totalDetected} subject(s) detected — please review your screenshot(s) because some rows may have been missed.`}
                </p>
              </div>
            </div>
          )}

          {/* Review Header Banner */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--bg-surface)] p-3 border border-[var(--border-subtle)]">
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-[var(--text-primary)]">
                  {totalDetected} subject{totalDetected === 1 ? "" : "s"} detected
                </span>
                {reviewPayload?.totalImagesProcessed && reviewPayload.totalImagesProcessed > 1 && (
                  <Badge variant="outline" className="text-xs">
                    {reviewPayload.totalImagesProcessed} images processed
                  </Badge>
                )}
                {reviewPayload?.detectedSemester && (
                  <Badge variant="outline" className="text-xs">
                    Semester: {reviewPayload.detectedSemester}
                  </Badge>
                )}
                <Badge variant="success" className="text-xs">
                  {selectedCount} Selected
                </Badge>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Review and edit extracted values before saving. Attendance percentages are verified against attended/conducted counts.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSelectAllValid}
                className="text-xs h-7"
              >
                Select All Valid
              </Button>
            </div>
          </div>

          {/* Navigation Tabs (if multiple categories present) */}
          <div className="flex border-b border-[var(--border-subtle)] space-x-4">
            {attendanceRows.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("ATTENDANCE")}
                className={`pb-2 text-xs font-semibold transition-colors border-b-2 ${
                  activeTab === "ATTENDANCE"
                    ? "border-[var(--brand-primary)] text-[var(--brand-primary)]"
                    : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Attendance ({attendanceRows.length})
              </button>
            )}
            {gradeRows.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("GRADES")}
                className={`pb-2 text-xs font-semibold transition-colors border-b-2 ${
                  activeTab === "GRADES"
                    ? "border-[var(--brand-primary)] text-[var(--brand-primary)]"
                    : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Grades ({gradeRows.length})
              </button>
            )}
            {detailedMarksRows.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("MARKS")}
                className={`pb-2 text-xs font-semibold transition-colors border-b-2 ${
                  activeTab === "MARKS"
                    ? "border-[var(--brand-primary)] text-[var(--brand-primary)]"
                    : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Detailed Marks ({detailedMarksRows.length})
              </button>
            )}
          </div>

          {/* TAB CONTENT: ATTENDANCE */}
          {activeTab === "ATTENDANCE" && attendanceRows.length > 0 && (
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {attendanceRows.map((row) => (
                <div
                  key={row.id}
                  className={`rounded-xl border p-3.5 space-y-3 transition-colors ${
                    !row.isValid
                      ? "border-[var(--accent-danger)]/40 bg-[var(--accent-danger)]/5"
                      : row.confidence === "LOW"
                      ? "border-[var(--accent-warning)]/40 bg-[var(--accent-warning)]/5"
                      : "border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={(e) =>
                          handleAttendanceChange(row.id, "selected", e.target.checked)
                        }
                        className="rounded border-[var(--border-subtle)] text-[var(--brand-primary)]"
                      />
                      <span className="font-bold text-sm text-[var(--text-primary)]">
                        {row.subjectCode || "—"}: {row.subjectName || "Unassigned Course"}
                      </span>
                      {row.sourceImageIndex && (
                        <Badge variant="outline" className="text-[10px] text-[var(--text-muted)]">
                          Image {row.sourceImageIndex}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Confidence Badge */}
                      <Badge
                        variant={
                          row.confidence === "HIGH"
                            ? "success"
                            : row.confidence === "MEDIUM"
                            ? "warning"
                            : "danger"
                        }
                        className="text-[10px]"
                      >
                        {row.confidence === "LOW" ? "LOW — please verify" : row.confidence}
                      </Badge>

                      {/* Duplicate Warning */}
                      {row.hasDuplicate && (
                        <Badge variant="outline" className="text-[10px] text-[var(--accent-warning)] border-[var(--accent-warning)]/30">
                          Existing record found
                        </Badge>
                      )}

                      {/* Needs Mapping Notice */}
                      {row.matchStatus === "NEEDS_REVIEW" && !row.hasDuplicate && (
                        <Badge variant="outline" className="text-[10px] text-[var(--accent-warning)] border-[var(--accent-warning)]/30">
                          Needs subject mapping
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Subject Assignment Selector */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-[var(--text-secondary)]">
                        Match to Course:
                      </label>
                      <select
                        value={
                          row.matchStatus === "CREATE_NEW"
                            ? "CREATE_NEW"
                            : row.matchedSubjectId || "CREATE_NEW"
                        }
                        onChange={(e) =>
                          handleSubjectSelection(row.id, "ATTENDANCE", e.target.value)
                        }
                        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
                      >
                        <option value="CREATE_NEW">
                          + Create New Course ({row.subjectCode || row.subjectName || "New"})
                        </option>
                        {existingSubjects.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.code ? `[${s.code}] ` : ""}
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Attended & Conducted Inputs */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-[var(--text-secondary)]">
                          Attended
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={row.attended ?? ""}
                          onChange={(e) =>
                            handleAttendanceChange(
                              row.id,
                              "attended",
                              e.target.value === "" ? null : parseInt(e.target.value, 10)
                            )
                          }
                          className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-[var(--text-secondary)]">
                          Conducted
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={row.conducted ?? ""}
                          onChange={(e) =>
                            handleAttendanceChange(
                              row.id,
                              "conducted",
                              e.target.value === "" ? null : parseInt(e.target.value, 10)
                            )
                          }
                          className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
                        />
                      </div>
                    </div>

                    {/* Calculated Percentage & Action */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-medium text-[var(--text-secondary)]">
                          Attendance:
                        </span>
                        <span className="font-bold text-[var(--text-primary)]">
                          {row.calculatedPercentage !== null
                            ? `${row.calculatedPercentage.toFixed(1)}% (${row.attended ?? 0}/${row.conducted ?? 0})`
                            : "—"}
                        </span>
                      </div>
                      {row.hasDuplicate ? (
                        <select
                          value={row.duplicateAction}
                          onChange={(e) =>
                            handleAttendanceChange(
                              row.id,
                              "duplicateAction",
                              e.target.value as "REPLACE" | "KEEP_EXISTING"
                            )
                          }
                          className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
                        >
                          <option value="REPLACE">Replace Existing</option>
                          <option value="KEEP_EXISTING">Keep Existing (Skip)</option>
                        </select>
                      ) : (
                        <span className="text-[11px] text-[var(--accent-success)] font-medium">
                          ✓ New Record
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Percentage Discrepancy Warning */}
                  {row.percentageWarning && (
                    <div className="flex items-start gap-1.5 text-[11px] text-[var(--accent-warning)] bg-[var(--accent-warning)]/10 p-2 rounded-md">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>{row.percentageWarning}</span>
                    </div>
                  )}

                  {/* Validation Error */}
                  {row.validationError && (
                    <div className="flex items-start gap-1.5 text-[11px] text-[var(--accent-danger)] bg-[var(--accent-danger)]/10 p-2 rounded-md">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>{row.validationError}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* TAB CONTENT: GRADES */}
          {activeTab === "GRADES" && gradeRows.length > 0 && (
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {gradeRows.map((row) => (
                <div
                  key={row.id}
                  className={`rounded-xl border p-3.5 space-y-3 transition-colors ${
                    row.isContradictory
                      ? "border-[var(--accent-danger)] bg-[var(--accent-danger)]/5"
                      : row.confidence === "LOW"
                      ? "border-[var(--accent-warning)]/40 bg-[var(--accent-warning)]/5"
                      : "border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        disabled={row.isContradictory}
                        onChange={(e) =>
                          handleGradeChange(row.id, "selected", e.target.checked)
                        }
                        className="rounded border-[var(--border-subtle)] text-[var(--brand-primary)]"
                      />
                      <span className="font-bold text-sm text-[var(--text-primary)]">
                        {row.subjectCode || "—"}: {row.subjectName || "Unassigned Course"}
                      </span>
                      {row.sourceImageIndex && (
                        <Badge variant="outline" className="text-[10px] text-[var(--text-muted)]">
                          Image {row.sourceImageIndex}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant={
                          row.confidence === "HIGH"
                            ? "success"
                            : row.confidence === "MEDIUM"
                            ? "warning"
                            : "danger"
                        }
                        className="text-[10px]"
                      >
                        {row.confidence === "LOW" ? "LOW — please verify" : row.confidence}
                      </Badge>
                      {row.hasDuplicate && (
                        <Badge variant="outline" className="text-[10px] text-[var(--accent-warning)] border-[var(--accent-warning)]/30">
                          Existing record found
                        </Badge>
                      )}
                      {row.matchStatus === "NEEDS_REVIEW" && !row.hasDuplicate && (
                        <Badge variant="outline" className="text-[10px] text-[var(--accent-warning)] border-[var(--accent-warning)]/30">
                          Needs subject mapping
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-center">
                    {/* Course match */}
                    <div className="space-y-1 sm:col-span-1">
                      <label className="text-[11px] font-medium text-[var(--text-secondary)]">
                        Match to Course:
                      </label>
                      <select
                        value={
                          row.matchStatus === "CREATE_NEW"
                            ? "CREATE_NEW"
                            : row.matchedSubjectId || "CREATE_NEW"
                        }
                        onChange={(e) =>
                          handleSubjectSelection(row.id, "GRADES", e.target.value)
                        }
                        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
                      >
                        <option value="CREATE_NEW">
                          + Create New ({row.subjectCode || row.subjectName || "New"})
                        </option>
                        {existingSubjects.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.code ? `[${s.code}] ` : ""}
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Grade letter & credits */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-[var(--text-secondary)]">
                          Grade Letter
                        </label>
                        <input
                          type="text"
                          value={row.grade || ""}
                          placeholder="e.g. A+"
                          onChange={(e) =>
                            handleGradeChange(row.id, "grade", e.target.value.toUpperCase())
                          }
                          className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)] font-bold uppercase"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-[var(--text-secondary)]">
                          Credits
                        </label>
                        <input
                          type="number"
                          step={0.5}
                          value={row.credits ?? ""}
                          placeholder="3.0"
                          onChange={(e) =>
                            handleGradeChange(
                              row.id,
                              "credits",
                              e.target.value === "" ? null : parseFloat(e.target.value)
                            )
                          }
                          className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
                        />
                      </div>
                    </div>

                    {/* Marks obtained & max marks */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-[var(--text-secondary)]">
                          Marks
                        </label>
                        <input
                          type="number"
                          value={row.marksObtained ?? ""}
                          placeholder="Optional"
                          onChange={(e) =>
                            handleGradeChange(
                              row.id,
                              "marksObtained",
                              e.target.value === "" ? null : parseFloat(e.target.value)
                            )
                          }
                          className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-[var(--text-secondary)]">
                          Max Marks
                        </label>
                        <input
                          type="number"
                          value={row.maxMarks || 100}
                          onChange={(e) =>
                            handleGradeChange(
                              row.id,
                              "maxMarks",
                              e.target.value === "" ? 100 : parseFloat(e.target.value)
                            )
                          }
                          className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
                        />
                      </div>
                    </div>

                    {/* Duplicate Action */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-[var(--text-secondary)]">
                        Action
                      </label>
                      {row.hasDuplicate ? (
                        <select
                          value={row.duplicateAction}
                          onChange={(e) =>
                            handleGradeChange(
                              row.id,
                              "duplicateAction",
                              e.target.value as "REPLACE" | "KEEP_EXISTING"
                            )
                          }
                          className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
                        >
                          <option value="REPLACE">Replace Existing</option>
                          <option value="KEEP_EXISTING">Keep Existing (Skip)</option>
                        </select>
                      ) : (
                        <span className="text-[11px] text-[var(--accent-success)] font-medium block pt-1">
                          ✓ New Result
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Contradiction Warning (blocks import until resolved) */}
                  {row.isContradictory && (
                    <div className="flex items-start gap-2 rounded-md border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10 p-2 text-xs text-[var(--accent-danger)]">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <strong className="block font-semibold">Contradiction Detected</strong>
                        <p>{row.contradictionReason}</p>
                        <p className="mt-1 text-[11px] opacity-90">
                          Please edit the grade letter or marks above to resolve the conflict before
                          importing.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* TAB CONTENT: DETAILED MARKS */}
          {activeTab === "MARKS" && detailedMarksRows.length > 0 && (
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {detailedMarksRows.map((row) => (
                <div
                  key={row.id}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={(e) =>
                          setDetailedMarksRows((prev) =>
                            prev.map((r) =>
                              r.id === row.id ? { ...r, selected: e.target.checked } : r
                            )
                          )
                        }
                        className="rounded border-[var(--border-subtle)] text-[var(--brand-primary)]"
                      />
                      <span className="font-bold text-sm text-[var(--text-primary)]">
                        {row.subjectCode || "—"}: {row.subjectName || "Unassigned Course"}
                      </span>
                      {row.sourceImageIndex && (
                        <Badge variant="outline" className="text-[10px] text-[var(--text-muted)]">
                          Image {row.sourceImageIndex}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {row.components.length} Components
                      </Badge>
                      {row.finalGrade && (
                        <Badge variant="default" className="text-[10px]">
                          Grade: {row.finalGrade}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Components Breakdown Table */}
                  <div className="rounded-lg border border-[var(--border-subtle)] overflow-hidden text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-slate-900/5 dark:bg-white/5 border-b border-[var(--border-subtle)] text-[var(--text-secondary)] font-medium">
                        <tr>
                          <th className="p-2">Assessment Component</th>
                          <th className="p-2 text-right">Marks</th>
                          <th className="p-2 text-right">Max</th>
                          <th className="p-2 text-right">Weightage</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {row.components.map((comp, cIdx) => (
                          <tr key={cIdx} className="hover:bg-slate-900/5 dark:hover:bg-white/5">
                            <td className="p-2 font-medium text-[var(--text-primary)]">
                              {comp.componentName}
                            </td>
                            <td className="p-2 text-right">
                              {comp.marksObtained !== null && comp.marksObtained !== undefined
                                ? comp.marksObtained
                                : "—"}
                            </td>
                            <td className="p-2 text-right">
                              {comp.maxMarks !== null && comp.maxMarks !== undefined
                                ? comp.maxMarks
                                : "—"}
                            </td>
                            <td className="p-2 text-right text-[var(--text-muted)]">
                              {comp.weightageEarned !== null && comp.weightageEarned !== undefined
                                ? `${comp.weightageEarned}%`
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary row */}
                  <div className="flex items-center justify-between text-xs bg-slate-900/5 dark:bg-white/5 p-2 rounded-md">
                    <span className="font-semibold text-[var(--text-secondary)]">
                      Total Calculated Marks:
                    </span>
                    <span className="font-bold text-[var(--text-primary)]">
                      {row.finalMarksObtained ?? row.computedTotalMarks ?? "—"} /{" "}
                      {row.finalMaxMarks ?? row.computedMaxMarks ?? 100}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStep("UPLOAD")}
              disabled={isSaving}
            >
              Back to Upload
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleConfirmImport}
                disabled={isSaving || selectedCount === 0}
                className="gap-1.5"
                id="smart-import-confirm-btn"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Import Selected ({selectedCount})
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* STEP 4: SUMMARY & SUCCESS                                           */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {step === "SUMMARY" && summaryData && (
        <div className="py-6 text-center space-y-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-success)]/10 text-[var(--accent-success)] mx-auto">
            <CheckCircle2 className="h-8 w-8" />
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-bold text-[var(--text-primary)]">
              Smart Import Complete
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Your academic data has been successfully recorded in your curriculum.
            </p>
          </div>

          {/* Stats Badges */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 min-w-[120px]">
              <span className="block text-2xl font-bold text-[var(--accent-success)]">
                {summaryData.importedCount}
              </span>
              <span className="text-[11px] text-[var(--text-secondary)]">Records Saved</span>
            </div>

            {summaryData.skippedCount > 0 && (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 min-w-[120px]">
                <span className="block text-2xl font-bold text-[var(--text-muted)]">
                  {summaryData.skippedCount}
                </span>
                <span className="text-[11px] text-[var(--text-secondary)]">Skipped</span>
              </div>
            )}

            {summaryData.createdSubjectsCount > 0 && (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 min-w-[120px]">
                <span className="block text-2xl font-bold text-[var(--brand-primary)]">
                  {summaryData.createdSubjectsCount}
                </span>
                <span className="text-[11px] text-[var(--text-secondary)]">Courses Created</span>
              </div>
            )}
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Link href="/grades" onClick={() => onOpenChange(false)}>
              <Button variant="secondary" size="sm" className="gap-1.5">
                <ExternalLink className="h-4 w-4" />
                View Grades
              </Button>
            </Link>
            <Link href="/attendance" onClick={() => onOpenChange(false)}>
              <Button variant="secondary" size="sm" className="gap-1.5">
                <ExternalLink className="h-4 w-4" />
                View Attendance
              </Button>
            </Link>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
