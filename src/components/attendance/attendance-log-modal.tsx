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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import {
  getAttendanceLogs,
  createAttendanceLog,
  updateAttendanceLog,
  deleteAttendanceLog,
  type AttendanceLogEntry,
} from "@/lib/actions/attendance";
import { Calendar, Plus, Edit2, Trash2, X } from "lucide-react";

interface AttendanceLogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  subjectName: string;
  subjectCode?: string | null;
}

type FormMode = "idle" | "add" | "edit";

const STATUS_LABELS = {
  PRESENT: "Present",
  ABSENT: "Absent",
  CANCELLED: "Cancelled",
} as const;

const STATUS_COLORS = {
  PRESENT: "bg-[var(--accent-success)]/15 text-[var(--accent-success)] border-[var(--accent-success)]/30",
  ABSENT: "bg-[var(--accent-danger)]/15 text-[var(--accent-danger)] border-[var(--accent-danger)]/30",
  CANCELLED: "bg-[var(--text-muted)]/15 text-[var(--text-muted)] border-[var(--text-muted)]/30",
};

export function AttendanceLogModal({
  open,
  onOpenChange,
  subjectId,
  subjectName,
  subjectCode,
}: AttendanceLogModalProps) {
  const { toast } = useToast();
  const router = useRouter();

  const [logs, setLogs] = React.useState<AttendanceLogEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [formMode, setFormMode] = React.useState<FormMode>("idle");
  const [editingLog, setEditingLog] = React.useState<AttendanceLogEntry | null>(null);
  const [deleteLogId, setDeleteLogId] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Form state
  const [formDate, setFormDate] = React.useState(new Date().toISOString().split("T")[0]);
  const [formStatus, setFormStatus] = React.useState<"PRESENT" | "ABSENT" | "CANCELLED">("PRESENT");
  const [formNotes, setFormNotes] = React.useState("");

  const loadLogs = React.useCallback(async () => {
    if (!open) return;
    setIsLoading(true);
    try {
      const res = await getAttendanceLogs(subjectId);
      if (res.success && res.logs) {
        setLogs(res.logs);
      }
    } finally {
      setIsLoading(false);
    }
  }, [subjectId, open]);

  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setFormMode("idle");
      setEditingLog(null);
      setFormError(null);
    }
  }

  React.useEffect(() => {
    let active = true;
    if (open) {
      (async () => {
        setIsLoading(true);
        try {
          const res = await getAttendanceLogs(subjectId);
          if (active && res.success && res.logs) {
            setLogs(res.logs);
          }
        } finally {
          if (active) setIsLoading(false);
        }
      })();
    }
    return () => {
      active = false;
    };
  }, [open, subjectId]);

  const openAddForm = () => {
    setFormMode("add");
    setEditingLog(null);
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormStatus("PRESENT");
    setFormNotes("");
    setFormError(null);
  };

  const openEditForm = (log: AttendanceLogEntry) => {
    setFormMode("edit");
    setEditingLog(log);
    setFormDate(log.sessionDate.split("T")[0]);
    setFormStatus(log.status);
    setFormNotes(log.notes ?? "");
    setFormError(null);
  };

  const cancelForm = () => {
    setFormMode("idle");
    setEditingLog(null);
    setFormError(null);
  };

  const handleSubmit = async () => {
    setFormError(null);
    setIsSubmitting(true);

    try {
      let res;
      if (formMode === "add") {
        res = await createAttendanceLog({
          subjectId,
          sessionDate: formDate,
          status: formStatus,
          notes: formNotes || null,
        });
      } else if (formMode === "edit" && editingLog) {
        res = await updateAttendanceLog({
          logId: editingLog.id,
          sessionDate: formDate,
          status: formStatus,
          notes: formNotes || null,
        });
      } else {
        return;
      }

      if (res.success) {
        toast({
          title: formMode === "add" ? "Log Entry Added" : "Log Entry Updated",
          description: `${STATUS_LABELS[formStatus]} on ${formDate} saved.`,
          type: "success",
        });
        setFormMode("idle");
        setEditingLog(null);
        await loadLogs();
        router.refresh();
      } else {
        setFormError(res.error || "Failed to save log entry.");
      }
    } catch {
      setFormError("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteLogId) return;
    setIsSubmitting(true);
    try {
      const res = await deleteAttendanceLog(deleteLogId);
      if (res.success) {
        toast({
          title: "Log Entry Deleted",
          description: "Attendance log entry removed and aggregate updated.",
          type: "success",
        });
        setDeleteLogId(null);
        await loadLogs();
        router.refresh();
      } else {
        toast({
          title: "Error",
          description: res.error || "Failed to delete log entry.",
          type: "error",
        });
        setDeleteLogId(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  // Aggregate counts derived from logs for display
  const aggFromLogs = React.useMemo(() => {
    let attended = 0;
    let conducted = 0;
    let cancelled = 0;
    for (const l of logs) {
      if (l.status === "PRESENT") { attended++; conducted++; }
      else if (l.status === "ABSENT") { conducted++; }
      else if (l.status === "CANCELLED") { cancelled++; }
    }
    return { attended, conducted, cancelled };
  }, [logs]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange} className="max-w-2xl w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[var(--brand-primary)]" />
            Attendance History — {subjectName}
          </DialogTitle>
          <DialogDescription>
            {subjectCode && <span className="font-mono text-xs mr-2">{subjectCode}</span>}
            Date-stamped log of individual sessions. Aggregate counts update automatically.
            CANCELLED sessions do not affect attendance calculations.
          </DialogDescription>
        </DialogHeader>

        {/* Summary strip */}
        <div className="flex flex-wrap gap-2 mb-3">
          <Badge variant="default" className="bg-[var(--accent-success)]/15 text-[var(--accent-success)] border-[var(--accent-success)]/30">
            {aggFromLogs.attended} Present
          </Badge>
          <Badge variant="default" className="bg-[var(--accent-danger)]/15 text-[var(--accent-danger)] border-[var(--accent-danger)]/30">
            {aggFromLogs.conducted - aggFromLogs.attended} Absent
          </Badge>
          <Badge variant="secondary">
            {aggFromLogs.cancelled} Cancelled (not counted)
          </Badge>
          <Badge variant="default" className="bg-[var(--brand-primary)]/15 text-[var(--brand-primary)] border-[var(--brand-primary)]/30">
            {aggFromLogs.conducted} Total Conducted
          </Badge>
        </div>

        {/* Add / Edit form */}
        {formMode !== "idle" && (
          <div className="rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/5 p-4 mb-3 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {formMode === "add" ? "Add Session" : "Edit Session"}
              </h3>
              <button
                onClick={cancelForm}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                aria-label="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError && (
              <div role="alert" className="rounded-lg border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10 p-2.5 text-xs text-[var(--accent-danger)] font-medium">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label htmlFor="log-date" className="text-xs font-semibold text-[var(--text-secondary)]">
                  Date
                </label>
                <input
                  id="log-date"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="log-status" className="text-xs font-semibold text-[var(--text-secondary)]">
                  Status
                </label>
                <select
                  id="log-status"
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as "PRESENT" | "ABSENT" | "CANCELLED")}
                  className="w-full h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                >
                  <option value="PRESENT">Present</option>
                  <option value="ABSENT">Absent</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="log-notes" className="text-xs font-semibold text-[var(--text-secondary)]">
                  Notes (optional)
                </label>
                <input
                  id="log-notes"
                  type="text"
                  placeholder="e.g. Holiday declared"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  maxLength={500}
                  className="w-full h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={cancelForm} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSubmit} isLoading={isSubmitting}>
                {formMode === "add" ? "Add Entry" : "Save Changes"}
              </Button>
            </div>
          </div>
        )}

        {/* Log list */}
        <div className="overflow-y-auto max-h-[40vh] rounded-lg border border-[var(--border-subtle)]">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-[var(--text-muted)]">
              Loading history…
            </div>
          ) : logs.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--text-muted)]">
              <Calendar className="h-6 w-6 mx-auto mb-2 opacity-30" />
              No sessions logged yet. Use &ldquo;Add Session&rdquo; to start tracking individual classes.
            </div>
          ) : (
            <table className="w-full text-xs border-collapse" aria-label="Attendance log">
              <thead className="sticky top-0 bg-[var(--bg-surface-elevated)] border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="text-left py-2.5 px-3 text-[var(--text-secondary)] font-semibold uppercase tracking-wider">Date</th>
                  <th className="text-left py-2.5 px-3 text-[var(--text-secondary)] font-semibold uppercase tracking-wider">Status</th>
                  <th className="text-left py-2.5 px-3 text-[var(--text-secondary)] font-semibold uppercase tracking-wider">Notes</th>
                  <th className="py-2.5 px-3 w-16 text-right text-[var(--text-secondary)] font-semibold uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[var(--bg-surface-elevated)]/50 transition-colors">
                    <td className="py-2 px-3 font-medium text-[var(--text-primary)] whitespace-nowrap">
                      {formatDate(log.sessionDate)}
                    </td>
                    <td className="py-2 px-3">
                      <Badge variant="default" className={`text-[10px] ${STATUS_COLORS[log.status]}`}>
                        {STATUS_LABELS[log.status]}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-[var(--text-muted)] max-w-[180px] truncate">
                      {log.notes || "—"}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditForm(log)}
                          className="p-1 rounded hover:bg-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--brand-primary)] transition-colors"
                          aria-label={`Edit log entry for ${formatDate(log.sessionDate)}`}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteLogId(log.id)}
                          className="p-1 rounded hover:bg-[var(--accent-danger)]/10 text-[var(--text-muted)] hover:text-[var(--accent-danger)] transition-colors"
                          aria-label={`Delete log entry for ${formatDate(log.sessionDate)}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter className="justify-between">
          <Button
            variant="secondary"
            size="sm"
            onClick={openAddForm}
            disabled={formMode !== "idle"}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Session
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteLogId}
        onOpenChange={(open) => { if (!open) setDeleteLogId(null); }}
        title="Delete Log Entry"
        description="This will permanently remove this attendance log entry and recalculate your aggregate counts. This action cannot be undone."
        confirmText="Delete Entry"
        cancelText="Keep Entry"
        variant="danger"
        isLoading={isSubmitting}
        onConfirm={handleDelete}
      />
    </>
  );
}
