# Implementation & Development Plan
## Smart Student Manager

---

## 1. Phased Development Roadmap

We adopt a **strict, test-driven, layered implementation approach**. High-risk domain calculations (attendance formulas and SGPA/CGPA algorithms) are implemented and unit-tested in pure TypeScript before UI components are assembled.

```mermaid
gantt
    title Smart Student Manager - Implementation Phases
    dateFormat  X
    axisFormat  Phase %s

    section Core Architecture
    Phase 0: Scaffolding & Design System      :active, p0, 0, 1
    Phase 1: Auth, Schema & Student Profile   :p1, 1, 2
    Phase 2: Math Calculation Engines & Tests :p2, 2, 3

    section Feature Modules
    Phase 3: Grades & Academic Results Engine :p3, 3, 4
    Phase 4: Attendance Manager & Simulator   :p4, 4, 5
    Phase 5: Events & Reminder Notification   :p5, 5, 6

    section Integration & Delivery
    Phase 6: Executive Dashboard & Analytics  :p6, 6, 7
    Phase 7: End-to-End Polish & QA           :p7, 7, 8
```

---

## 2. Phase-by-Phase Deliverables & Milestones

### Phase 0: Project Scaffolding & Design System Foundation
- **Goal:** Set up the unified Next.js + TypeScript environment with Prisma ORM, styling tokens, and reusable UI primitives.
- **Deliverables:**
  - Initialized Next.js project with TypeScript, ESLint, and Tailwind CSS / CSS variables.
  - Configured design system tokens (colors, dark/light themes, typography).
  - Built core UI primitives (`Button`, `Card`, `Badge`, `Modal`, `Input`, `StatCard`).
  - Set up Prisma with SQLite for instant local zero-dependency development.

### Phase 1: Authentication, Data Tenancy & Student Profile
- **Goal:** Enable secure user accounts and student profile customization.
- **Deliverables:**
  - User registration, login, session management (HTTP-only secure cookies / NextAuth).
  - Protected route middleware.
  - Student Profile setup screen (College name, Degree, Major, Roll Number, Avatar).
  - User settings store (Default attendance target, active grading scale).

### Phase 2: Domain Calculation Engines (Pure Business Logic + 100% Unit Tests)
- **Goal:** Bulletproof mathematical engines decoupled from UI components.
- **Deliverables:**
  - `lib/calculations/attendance.ts`:
    - Attendance percentage with $C = 0$ protection.
    - Bunk buffer formula ($M$).
    - Recovery catch-up formula ($R$).
  - `lib/calculations/gpa.ts`:
    - Semester SGPA weighted formula.
    - Cumulative CGPA across multiple semesters.
    - Audit course filtering.
  - `lib/calculations/grading-scales.ts`:
    - Configurable scales (10-Point standard, 4.0-Point US standard, percentage ranges).
  - Comprehensive unit test suite with 100% branch coverage verifying edge cases.

### Phase 3: Grades & Academic Results Module
- **Goal:** Full semester and subject grade management with real-time GPA projections.
- **Deliverables:**
  - Semester management (Create, edit, toggle active status, mark completed).
  - Subject registry (Course code, name, credit hours, category).
  - Grade entry table with instant SGPA and CGPA recalculation.
  - "What-If" scenario simulator drawer.

### Phase 4: Attendance Manager & Bunk Simulator
- **Goal:** Interactive subject-wise attendance tracking with real-time feedback.
- **Deliverables:**
  - Subject attendance card grid with color-coded circular gauges.
  - One-tap quick increment buttons (`+ Attended`, `+ Missed`) with optimistic UI updates.
  - Live "Bunk Simulator" and "Recovery Simulator" badges on every subject card.
  - Manual adjustment modal with reason notes and session history logs.

### Phase 5: Event & Reminder Subsystem
- **Goal:** Time-sensitive academic task manager with in-app proactive alerts.
- **Deliverables:**
  - Event CRUD operations (Exams, assignments, presentations, college events).
  - Priority flags (`URGENT`, `HIGH`, `MEDIUM`, `LOW`) and status toggles.
  - Reminder scheduler creating time-based triggers (e.g. 24h and 2h before deadline).
  - Notification center bell dropdown in navigation bar with dismiss and snooze options.

### Phase 6: Executive Dashboard & Analytics Integration
- **Goal:** Synthesize all student data into a unified, actionable cockpit.
- **Deliverables:**
  - Top KPI strip (CGPA, SGPA, Overall Attendance %, Active Deadlines).
  - "Critical Attendance Radar" card listing subjects below threshold with 1-tap catch-up math.
  - Upcoming 7-day deadlines timeline.
  - Semester-by-semester SGPA vs CGPA progression chart.
  - Quick-action modal triggers.

### Phase 7: Polish, Accessibility & End-to-End Validation
- **Goal:** Ensure production readiness, responsiveness, and zero edge-case crashes.
- **Deliverables:**
  - Responsive verification across mobile, tablet, and desktop viewports.
  - Accessibility audit (contrast ratios, focus traps, aria labels).
  - Empty states, loading skeletons, and destructive action confirmation dialogs.
  - Local database seeding script with realistic dummy data for immediate demoing.

---

## 3. Testing Strategy

### 3.1 Unit Testing (Calculation Engine)
- Framework: **Vitest**
- Target: 100% test coverage on `lib/calculations/*`.
- Test Suites:
  - `attendance.test.ts`:
    - Zero conducted classes ($C=0, A=0$).
    - 100% attendance ($C=10, A=10$).
    - Exactly at target ($75\%$).
    - Borderline recovery ($74.9\%$).
    - High deficit ($30\%$).
    - Large numbers ($C=200, A=180$).
  - `gpa.test.ts`:
    - Perfect 10.0 / 4.0 GPAs.
    - Zero credit audit courses.
    - Failed subjects (0 quality points).
    - Multi-semester cumulative balance.

### 3.2 Integration Testing (API Routes)
- Verification of Zod schema enforcement, authentication guards, and cascading deletions.

### 3.3 Visual & Responsive Testing
- Validation across viewport sizes (375px mobile, 768px tablet, 1280px desktop).

---

## 4. Future Scalability Considerations

1. **Native Background Web Push:** Integrate VAPID push protocol with Service Worker to notify students even when the browser tab is closed.
2. **Calendar Feed Export (.ics):** Enable students to subscribe to their academic exam and assignment schedule directly from Google Calendar or Apple Calendar.
3. **Printable Transcript / Grade Card Export:** Client-side PDF rendering of semester mark sheets.
4. **Weekly Class Timetable:** Period-by-period daily lecture timetable linked to automated 1-tap attendance marking.
5. **Multi-Tenancy Cloud Migration:** Seamless migration from local SQLite to PostgreSQL (Supabase / Neon / AWS RDS) by changing the Prisma datasource provider.

---

## 5. Risks, Ambiguities & Key Architectural Decisions

| Item | Risk / Ambiguity | Proposed Resolution | Status |
|---|---|---|---|
| **1. Tech Stack** | Choosing between Next.js full-stack vs Vite + Express. | Recommend **Next.js (App Router) + TypeScript + Prisma** for single-repo simplicity, type sharing, and ease of AI pair-programming. | **Ready for confirmation** |
| **2. Local Database** | SQLite vs PostgreSQL for local development. | Use **SQLite** via Prisma for zero-install local development; effortlessly switched to PostgreSQL via `.env` for production. | **Ready for confirmation** |
| **3. Auth Strategy** | Full OAuth vs Credentials. | Start with **Credentials Auth (Email + Password)** with session cookies, with optional Google OAuth hook. | **Ready for confirmation** |
| **4. Default Grading System** | University grading systems vary globally. | Ship with **Configurable Grading Scales** (pre-seeding Standard 10-Point and 4.0-Point scales, editable in Settings). | **Designed & Documented** |
| **5. Notification Limits** | Students expecting background notifications without native app. | Clearly separate **Phase 1 (In-App Action Center)** from **Phase 2 (Browser Push API)** so expectations are realistic. | **Documented in PRD & Architecture** |
