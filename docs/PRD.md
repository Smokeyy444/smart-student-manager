# Product Requirements Document (PRD)
## Smart Student Manager

---

## 1. Product Overview & Vision

**Smart Student Manager** is an all-in-one academic productivity and student life management web application. College and university students typically juggle multiple disjointed tools: spreadsheets for attendance, university portals for grade cards, calendar apps for deadlines, and notes apps for reminders. 

Smart Student Manager consolidates academic performance metrics (SGPA/CGPA tracking), real-time attendance calculation with "bunk/catch-up" intelligence, and deadline-driven event management into a unified, responsive, student-centric experience.

### 1.1 Core Value Proposition
- **Predictive Academic Insight:** Real-time visibility into required grades and minimum attendance thresholds to prevent academic penalties.
- **Accurate Mathematical Engines:** Unambiguous, edge-case-hardened formulas for weighted SGPA/CGPA and attendance buffers.
- **Actionable Deadlines:** Integrated academic events (exams, assignments, quizzes) with proactive reminders.
- **Configurability:** Decoupled from any single university's rigid rules (supports varied credit systems, 10-point vs. 4.0 scales, custom percentage targets).

---

## 2. Target Audience & User Personas

### Persona A: "The Balanced Engineer" (Aarav, 20)
- **Profile:** 2nd-year B.Tech Computer Science student with strict 75% attendance criteria and competitive CGPA goals.
- **Needs:** Needs to know exactly how many classes he can safely miss for hackathons or sick days without dropping below 75%, and what grade in his 4-credit Data Structures course will push his cumulative CGPA past 8.5.
- **Pain Point:** Spreadsheets get broken on mobile phones; college ERP is clunky and updates only once a month.

### Persona B: "The Deadline Juggler" (Maya, 21)
- **Profile:** 3rd-year Business / Liberal Arts undergraduate with continuous internal assessments, presentations, and group projects.
- **Needs:** An integrated timeline of submission deadlines linked with subject weights, coupled with automated reminders 48h and 12h prior.
- **Pain Point:** Misses project submission cutoffs because exam dates and assignment deadlines are kept in separate messaging groups.

### Persona C: "The Turnaround Candidate" (David, 19)
- **Profile:** 1st-year student recovering from a weak first semester (SGPA 6.2).
- **Needs:** Clear scenario modeling: "What SGPA do I need in Semester 2 and 3 to raise my overall CGPA to a 7.5?"
- **Pain Point:** Lack of clear calculation feedback leads to anxiety and poor study prioritization.

---

## 3. Detailed Feature Specifications

### 3.1 Feature 1: Dashboard (Unified Executive View)
The dashboard provides a real-time summary of academic health upon login.

#### Functional Requirements:
1. **Academic Metric Strip:**
   - Cumulative CGPA (calculated across all completed semesters).
   - Current Semester SGPA (projected or finalized based on recorded subject marks).
   - Overall Aggregate Attendance Percentage across all active subjects.
   - Total Credits registered in active semester.
2. **Attendance Risk Alerts ("Critical Attendance Radar"):**
   - Immediate list of subjects currently at or below the target threshold (e.g., `< 75%`).
   - Quick action: "Attend next $N$ classes to recover" badge.
3. **Upcoming Deadlines & Agenda:**
   - Chronological list of events (tests, assignments, project demos) scheduled in the next 7–14 days.
   - Visual priority indicator (Urgent, High, Medium, Low).
4. **Quick-Action Dial:**
   - "+ Log Today's Attendance" (one-tap increment/decrement).
   - "+ Add Event / Deadline".
   - "+ Quick Grade Entry".
5. **Academic Progress Chart:**
   - Semester-by-semester SGPA vs. CGPA progression trend line.

---

### 3.2 Feature 2: Grades & Results (Academic Record System)
Students track their curriculum structure, semester milestones, course credits, and grade conversions.

#### Functional Requirements:
1. **Semester Management:**
   - Create, edit, and archive semesters (e.g., "Fall 2025", "Semester 3").
   - Designate one semester as "Active / Current".
   - Toggle status: `In-Progress` vs. `Completed`.
2. **Subject & Credit Configuration:**
   - Attributes: Subject Code (optional), Subject Name, Credit Hours (e.g., 1, 2, 3, 4), Subject Category (Core, Elective, Lab, Audit).
   - Audit/Pass-Fail subjects can be excluded from SGPA/CGPA calculations while maintaining attendance tracking.
3. **Grading System Engine (Configurable):**
   - Decoupled from hardcoded scales. Supports:
     - **10-Point Scale** (Common in Indian/Asian institutions: S/O=10, A=9, B=8, C=7, D=6, E/P=5, F=0).
     - **4.0 Scale** (US/International: A=4.0, A-=3.7, B+=3.3, B=3.0, etc.).
     - **Percentage to Grade Point Mapping:** Customizable ranges (e.g., $90-100\% \to 10$).
4. **Calculations:**
   - Real-time SGPA calculation per semester:
     $$\text{SGPA} = \frac{\sum (\text{Subject Credit} \times \text{Grade Point})}{\sum \text{Subject Credit}}$$
   - Cumulative CGPA calculation:
     $$\text{CGPA} = \frac{\sum_{\text{all semesters}} (\text{Semester SGPA} \times \text{Semester Credits})}{\sum_{\text{all semesters}} \text{Semester Credits}} = \frac{\sum_{\text{all subjects}} (\text{Credit}_i \times \text{GradePoint}_i)}{\sum_{\text{all subjects}} \text{Credit}_i}$$
5. **Audit & Simulation ("What-If" Analysis):**
   - Allow students to enter provisional marks to project their upcoming SGPA/CGPA.
   - Historical transcript view with exportable summary (CSV/JSON/Printable).

---

### 3.3 Feature 3: Attendance Manager & Bunk Simulator
Monitors daily/weekly lecture attendance with exact mathematical recovery projections.

#### Functional Requirements:
1. **Subject-Wise Tracking:**
   - Each subject maintains:
     - `Classes Conducted` ($C$)
     - `Classes Attended` ($A$) where $0 \le A \le C$.
     - `Target Percentage` ($T$, defaults to global setting e.g., 75%, but can be overridden per subject).
2. **Attendance Percentage:**
   - If $C = 0$: Show "No classes conducted yet" (Neutral / 100% safe state, not an error or divide-by-zero).
   - If $C > 0$: 
     $$\text{Attendance } \% = \left(\frac{A}{C}\right) \times 100$$
3. **Bunk Simulator (Safe Skips):**
   - When $\frac{A}{C} \ge \frac{T}{100}$:
     Calculates maximum future classes $M$ that can be missed consecutively before falling below $T\%$:
     $$M = \left\lfloor \frac{A - (T/100) \cdot C}{T/100} \right\rfloor = \left\lfloor \frac{100 \cdot A - T \cdot C}{T} \right\rfloor$$
4. **Recovery Simulator (Classes to Catch Up):**
   - When $\frac{A}{C} < \frac{T}{100}$:
     Calculates minimum consecutive future classes $R$ that must be attended to reach $T\%$:
     $$R = \left\lceil \frac{(T/100) \cdot C - A}{1 - (T/100)} \right\rceil = \left\lceil \frac{T \cdot C - 100 \cdot A}{100 - T} \right\rceil$$
5. **Quick-Tap Attendance Incrementors:**
   - `+ Attended` (increments both $A$ and $C$ by 1).
   - `+ Missed` (increments $C$ by 1, keeps $A$ unchanged).
   - `Cancel Class` / `Undo` (decrement last entry in case of accidental click).
6. **Detailed Log vs. Aggregate Counter:**
   - Fast mode: Direct adjustment of $A$ and $C$ counters.
   - Optional Date-stamped Attendance Log (e.g., "Present on Oct 2, 2026, 10:00 AM") for students who want historical auditing.

---

### 3.4 Feature 4: Event Manager (Academic Calendar & Tasks)
Organizes time-sensitive college obligations.

#### Functional Requirements:
1. **Event Types:**
   - `EXAM` (Mid-term, End-term, Finals)
   - `TEST` (Unit test, surprise test, weekly quiz)
   - `ASSIGNMENT` (Homework, problem sets)
   - `PROJECT` (Milestone, code submission, thesis review)
   - `PRESENTATION` (Viva, slide deck delivery)
   - `COLLEGE` (Fest, holiday, workshop, registration)
   - `CUSTOM` (General task)
2. **Event Schema:**
   - Title (required, e.g., "Operating Systems Assignment 2")
   - Associated Subject (optional foreign key to `subjects`)
   - Event Type (enum)
   - Start Date & Time
   - Due/End Date & Time
   - Priority (`LOW`, `MEDIUM`, `HIGH`, `URGENT`)
   - Description / Notes / Submission links
   - Completion Status (`PENDING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`)
3. **Views:**
   - Agenda / List View with quick status checkboxes.
   - Weekly & Monthly Calendar Grid.
   - Filter by Subject, Event Type, or Priority.

---

### 3.5 Feature 5: Reminder Subsystem
Proactively alerts students about pending deadlines.

#### Functional Requirements:
1. **Reminder Triggers:**
   - Multiple reminders per event (e.g., "2 days before", "3 hours before", "At event time", or custom datetime).
2. **Notification Channels (Phased Realism):**
   - **Phase 1 (In-App Action Center):** Persistent notification badge in navigation bar, "Due Soon" dashboard banners, and dismissed/completed status tracking.
   - **Phase 2 (Browser Notifications):** HTML5 Notification API + Web Service Worker when the tab is open or background worker is active.
   - **Phase 3 (Push / Email / Calendar Sync):** Web Push protocol (VAPID) / iCal subscription feed export (.ics).
3. **Status Workflow:**
   - Reminders progress: `SCHEDULED` $\to$ `TRIGGERED` $\to$ `READ` / `DISMISSED`.

---

### 3.6 Feature 6: Student Profile
Maintains identity and academic context.

#### Functional Requirements:
1. **Fields:**
   - Full Name
   - Student ID / Enrollment / Roll Number
   - College / University Name
   - Degree / Program (e.g., B.Tech, B.Sc, B.Com, M.S.)
   - Branch / Specialization (e.g., Computer Science & Engineering)
   - Current Year & Current Semester
   - Academic Year (e.g., 2024–2028)
   - Avatar / Profile Image URL
2. **Privacy:**
   - All profile data is strictly user-scoped; student records are isolated per authenticated user.

---

### 3.7 Feature 7: Settings & Customization
Configures application behavior and personal thresholds.

#### Functional Requirements:
1. **Academic Settings:**
   - Default Minimum Attendance Target ($T\%$, standard default: 75%).
   - Active Grading Scale selection (10-point standard, 10-point absolute, 4.0 US standard, or Custom schema).
2. **Display & Theme:**
   - Dark Mode / Light Mode / System default (with high-contrast accessible tokens).
   - Date and time formatting (12-hour vs 24-hour, DD/MM/YYYY vs MM/DD/YYYY).
3. **Notification Preferences:**
   - Enable/disable in-app sound cues or toast alerts.
   - Lead time presets for event reminders (e.g., default: 24h before).
4. **Data Management:**
   - Export student data (JSON backup of semesters, attendance, and events).
   - Reset/Wipe data with confirmation dialogs.

---

## 4. Non-Functional Requirements (NFRs)

| Category | Requirement | Standard / Target |
|---|---|---|
| **Performance** | Initial page load (LCP) | $< 1.5$ seconds on 4G connections |
| **Responsiveness** | Interaction to Next Paint (INP) | $< 100$ ms for counter increments and tab shifts |
| **Availability** | Offline resilience | PWA-ready cache for reading attendance & schedule offline |
| **Security** | Authentication & Isolation | Secure HTTP-only cookies / JWT with strict Row Level Security |
| **Accessibility** | Usability & Inclusivity | WCAG 2.1 AA compliance (contrast ratios $\ge 4.5:1$, keyboard navigability) |
| **Extensibility** | Codebase design | Isolated business logic modules for all calculation formulas |
| **Data Integrity** | Foreign key cascades | Deleting a semester gracefully prompts subject reassignment or cascading deletion |

---

## 5. Scope Boundary (Phasing)

- **In Scope (MVP / Phase 1):**
  - Full Auth (Sign up, Log in, Session management, Reset password).
  - Profile setup with University/Degree details.
  - Multi-semester Grade Manager with configurable grading scales & dynamic SGPA/CGPA calculation.
  - Subject Attendance Manager with one-tap increments, zero-case protection, and bunk/catch-up formulas.
  - Event & Task Manager with priority, subject tags, and in-app Notification/Reminder Center.
  - Responsive Dashboard summarizing all metrics.
  - Light/Dark theme.
- **Future Scope (Phase 2+):**
  - Native Web Push Notifications via VAPID / Service Workers when browser is closed.
  - ICS calendar subscription feed for Google Calendar / Apple Calendar.
  - PDF/Printable Grade Card & Transcript generator.
  - Class timetable grid with period-by-period daily schedule.
