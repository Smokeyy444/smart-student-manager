export interface EventTypeConfig {
  value: string;
  label: string;
  description: string;
  colorClass: string;
}

export const EVENT_TYPES: Record<string, EventTypeConfig> = {
  EXAM: {
    value: "EXAM",
    label: "Exam",
    description: "Mid-semester exam, end-semester exam, or finals",
    colorClass: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/40",
  },
  TEST: {
    value: "TEST",
    label: "Test / Quiz",
    description: "Internal assessment, weekly quiz, or surprise test",
    colorClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/40",
  },
  ASSIGNMENT: {
    value: "ASSIGNMENT",
    label: "Assignment",
    description: "Homework, problem set, or essay deadline",
    colorClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/40",
  },
  PROJECT: {
    value: "PROJECT",
    label: "Project",
    description: "Code submission, milestone, or group project review",
    colorClass: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900/40",
  },
  PRESENTATION: {
    value: "PRESENTATION",
    label: "Presentation / Viva",
    description: "Oral presentation, project demo, or viva voce",
    colorClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40",
  },
  COLLEGE_EVENT: {
    value: "COLLEGE_EVENT",
    label: "College Event",
    description: "College fest, workshop, guest lecture, or holiday",
    colorClass: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/40",
  },
  COLLEGE: {
    value: "COLLEGE_EVENT",
    label: "College Event",
    description: "College fest, workshop, guest lecture, or holiday",
    colorClass: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/40",
  },
  PERSONAL: {
    value: "PERSONAL",
    label: "Personal Task",
    description: "Study session, revision goal, or personal errand",
    colorClass: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800",
  },
  OTHER: {
    value: "OTHER",
    label: "Other",
    description: "Custom event or general deadline",
    colorClass: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800",
  },
  CUSTOM: {
    value: "OTHER",
    label: "Other",
    description: "Custom event or general deadline",
    colorClass: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800",
  },
};

export const PRIMARY_EVENT_TYPE_OPTIONS = [
  { value: "EXAM", label: "Exam" },
  { value: "TEST", label: "Test / Quiz" },
  { value: "ASSIGNMENT", label: "Assignment" },
  { value: "PROJECT", label: "Project" },
  { value: "PRESENTATION", label: "Presentation / Viva" },
  { value: "COLLEGE_EVENT", label: "College Event" },
  { value: "PERSONAL", label: "Personal Task" },
  { value: "OTHER", label: "Other" },
];

export interface PriorityConfig {
  value: string;
  label: string;
  shortLabel: string;
  badgeClass: string;
  level: number;
}

export const PRIORITIES: Record<string, PriorityConfig> = {
  LOW: {
    value: "LOW",
    label: "Low Priority",
    shortLabel: "Low",
    badgeClass: "bg-slate-100 text-slate-700 dark:bg-slate-800/80 dark:text-slate-300 border-slate-200 dark:border-slate-700",
    level: 1,
  },
  MEDIUM: {
    value: "MEDIUM",
    label: "Medium Priority",
    shortLabel: "Medium",
    badgeClass: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-900/50",
    level: 2,
  },
  HIGH: {
    value: "HIGH",
    label: "High Priority",
    shortLabel: "High",
    badgeClass: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900/50",
    level: 3,
  },
  URGENT: {
    value: "URGENT",
    label: "Urgent Priority",
    shortLabel: "Urgent",
    badgeClass: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-900/50",
    level: 4,
  },
};

export const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low Priority" },
  { value: "MEDIUM", label: "Medium Priority" },
  { value: "HIGH", label: "High Priority" },
  { value: "URGENT", label: "Urgent Priority" },
];

export interface ReminderPreset {
  label: string;
  leadTimeMinutes: number;
  description: string;
}

export const REMINDER_PRESETS: ReminderPreset[] = [
  { label: "At event time", leadTimeMinutes: 0, description: "When the event starts" },
  { label: "10 minutes before", leadTimeMinutes: 10, description: "10m prior" },
  { label: "30 minutes before", leadTimeMinutes: 30, description: "30m prior" },
  { label: "1 hour before", leadTimeMinutes: 60, description: "1 hour prior" },
  { label: "1 day before", leadTimeMinutes: 1440, description: "24 hours prior" },
  { label: "2 days before", leadTimeMinutes: 2880, description: "48 hours prior" },
  { label: "1 week before", leadTimeMinutes: 10080, description: "7 days prior" },
];

export function getLeadTimeLabel(minutes: number): string {
  const match = REMINDER_PRESETS.find((p) => p.leadTimeMinutes === minutes);
  if (match) return match.label;
  if (minutes === 0) return "At event time";
  if (minutes < 60) return `${minutes} minutes before`;
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} ${days === 1 ? "day" : "days"} before`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? "hour" : "hours"} before`;
  }
  return `${minutes} minutes before`;
}
