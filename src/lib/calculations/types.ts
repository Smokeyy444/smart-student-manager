/**
 * Domain Calculation Types for Smart Student Manager
 * Pure domain interfaces and types with zero UI or database dependencies.
 */

export type AttendanceStatusType = "ON_TRACK" | "WARNING" | "CRITICAL" | "NEUTRAL";

export type SessionAttendanceStatus = "PRESENT" | "ABSENT" | "CANCELLED";

export interface AttendanceInput {
  classesAttended: number;
  classesConducted: number;
  targetPercentage?: number; // Defaults to 75.0 if not specified
}

export interface AttendanceMetrics {
  classesAttended: number;
  classesConducted: number;
  targetPercentage: number;
  percentage: number; // Rounded for presentation
  rawPercentage: number; // Full precision float
  status: AttendanceStatusType;
  isTargetMet: boolean;
  bunkBuffer: number; // Max classes that can be safely missed
  recoveryClasses: number; // Min consecutive classes needed to reach target
  isRecoveryPossible: boolean; // False if target is 100% and a class was already missed
}

export interface AttendanceSimulationResult {
  previousAttended: number;
  previousConducted: number;
  previousPercentage: number;
  simulatedAttended: number;
  simulatedConducted: number;
  simulatedPercentage: number;
  percentageChange: number;
  newStatus: AttendanceStatusType;
}

export interface AttendanceLogEntry {
  sessionDate: Date | string;
  status: SessionAttendanceStatus;
  notes?: string;
}

export interface SubjectCreditGrade {
  id?: string;
  name?: string;
  code?: string;
  creditHours: number;
  isAudit?: boolean;
  gradeLetter?: string | null;
  gradePoint?: number | null;
  marksObtained?: number | null;
  maxMarks?: number | null;
}

export interface SemesterCalculationInput {
  id?: string;
  semesterNumber: number;
  name?: string;
  subjects: SubjectCreditGrade[];
  isCompleted?: boolean;
}

export interface SGPACalculationResult {
  sgpa: number | null; // null if 0 credit hours enrolled
  totalEnrolledCredits: number;
  totalCreditBearingCredits: number;
  totalQualityPoints: number;
  earnedCredits: number; // Credits with passing grades
  subjectCount: number;
  auditSubjectCount: number;
}

export interface CGPACalculationResult {
  cgpa: number | null; // null if no credit-bearing courses completed
  totalCredits: number;
  totalQualityPoints: number;
  semesterBreakdown: Array<{
    semesterNumber: number;
    sgpa: number | null;
    creditHours: number;
    qualityPoints: number;
  }>;
}

export interface WhatIfGradeModification {
  subjectId?: string; // Target specific subject or match by code/index
  code?: string;
  subjectIndex?: number;
  newGradeLetter?: string;
  newGradePoint?: number;
  newMarksObtained?: number;
}

export interface WhatIfSGPAPrediction {
  baselineSGPA: number | null;
  predictedSGPA: number | null;
  delta: number | null;
  totalCredits: number;
}
