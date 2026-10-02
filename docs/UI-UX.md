# UI / UX Design Specifications & Component Hierarchy
## Smart Student Manager

---

## 1. Visual Design Philosophy & Aesthetics

The design direction for **Smart Student Manager** is **clean, modern, student-focused, highly legible, and lightweight**. 

### 1.1 Guiding Aesthetic Principles:
- **Calm, High-Information Hierarchy:** Academic life is stressful; the app interface should reduce cognitive load through clean card layouts, purposeful whitespace, and subdued slate tones instead of overwhelming neon accents.
- **Immediate Contextual Feedback:** Attendance status uses semantic colors (Emerald green for $\ge 75\%$, Amber for $70-75\%$, Rose red for $< 70\%$) so students grasp their standing in under 2 seconds.
- **Micro-Interactions over Heavy Animations:** Smooth, performant CSS transforms ($150\text{ms}-200\text{ms}$) on button clicks and card hovers. No distracting or slow 3D transitions.
- **Deep Dark Mode & Crisp Light Mode:** Full contrast compliance (WCAG 2.1 AA) in both dark and light modes.

---

## 2. Design System Tokens & Foundations

### 2.1 Color Palette

| Token | Light Mode Value | Dark Mode Value | Semantic Role |
|---|---|---|---|
| `--bg-app` | `#F8FAFC` (Slate 50) | `#0B0F17` (Deep Obsidian) | Main application canvas |
| `--bg-surface` | `#FFFFFF` (White) | `#141A23` (Slate Charcoal) | Cards, modals, sidebars |
| `--bg-surface-elevated` | `#F1F5F9` (Slate 100) | `#1E2633` (Slate 800) | Dropdowns, table headers |
| `--border-subtle` | `#E2E8F0` (Slate 200) | `#242E3D` (Slate 750) | Card borders, dividers |
| `--text-primary` | `#0F172A` (Slate 900) | `#F8FAFC` (Slate 50) | Primary headers and metrics |
| `--text-secondary` | `#475569` (Slate 600) | `#94A3B8` (Slate 400) | Labels, supporting copy |
| `--text-muted` | `#94A3B8` (Slate 400) | `#64748B` (Slate 500) | Footers, placeholders |
| `--brand-primary` | `#3B82F6` (Indigo/Blue 500) | `#60A5FA` (Blue 400) | Primary actions, links |
| `--accent-success` | `#10B981` (Emerald 500) | `#34D399` (Emerald 400) | Safe attendance ($\ge 75\%$), high SGPA |
| `--accent-warning` | `#F59E0B` (Amber 500) | `#FBBF24` (Amber 400) | Attendance warning ($70-74\%$) |
| `--accent-danger` | `#EF4444` (Rose 500) | `#F87171` (Rose 400) | Critical attendance ($< 70\%$), deadlines today |

### 2.2 Typography
- **Primary Typeface:** `Inter`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `sans-serif`.
- **Numeric Font:** `Inter` with tabular figures (`font-variant-numeric: tabular-nums;`) for aligned grade points and attendance counters.
- **Scale:**
  - `Display / KPI`: $32\text{px} - 36\text{px}$, Font Weight 700 (Bold)
  - `Section Header (H1/H2)`: $20\text{px} - 24\text{px}$, Font Weight 600 (Semibold)
  - `Card Header (H3)`: $16\text{px} - 18\text{px}$, Font Weight 600
  - `Body`: $14\text{px} - 15\text{px}$, Font Weight 400 / 500
  - `Caption / Badge`: $12\text{px} - 13\text{px}$, Font Weight 500 / 600

---

## 3. Navigation Architecture

```
Desktop Navigation:
+------------------------------------------------------------------------------------------+
|  LOGO  Smart Student Manager           [Search]    [Semester: Sem 3 v]  (Bell: 2)  [Avatar]  |
+--------------------+---------------------------------------------------------------------+
| [Dashboard]        |                                                                     |
| [Attendance]       |                                                                     |
| [Grades & CGPA]    |                     PRIMARY CONTENT VIEW AREA                       |
| [Events & Tasks]   |                                                                     |
| [Schedule]         |                                                                     |
| -----------------  |                                                                     |
| [Settings]         |                                                                     |
| [Profile]          |                                                                     |
+--------------------+---------------------------------------------------------------------+

Mobile Navigation (<= 768px):
+------------------------------------------------------------------------------------------+
|  LOGO  Smart Student           [Sem 3 v]                             (Bell: 2)  [Avatar]  |
+------------------------------------------------------------------------------------------+
|                                                                                          |
|                                PRIMARY SCROLLABLE VIEW                                   |
|                                                                                          |
+------------------------------------------------------------------------------------------+
|   [Home]         [Attendance]         [Grades]         [Events]         [More]           |
+------------------------------------------------------------------------------------------+
```

---

## 4. Complete Screen Specifications

### 4.1 Screen 1: Dashboard (`/dashboard`)
The central executive hub for daily academic checks.
- **Top Metric Row (4 KPI Cards):**
  1. **Overall CGPA:** Value (e.g. `8.74`), badge ("Rank top 10%"), mini trend indicator.
  2. **Active Semester SGPA:** Value (e.g. `8.90`), total enrolled credits (e.g. `22 Credits`).
  3. **Overall Attendance:** Percentage circle gauge (e.g. `82.4%`), badge ("Safe - 7.4% above target").
  4. **Active Deadlines:** Counter (e.g. `3 Upcoming`), badge ("Next: Tomorrow at 2 PM").
- **Middle Section (2 Columns):**
  - **Left (Critical Attendance Radar):** Highlights any subject falling near or below target threshold with 1-tap catch-up math (e.g., *"Operating Systems: 68.2% — Attend next 3 classes to recover"*).
  - **Right (Upcoming Events & Tasks):** Chronological timeline of assignments and exams with priority tags (`HIGH`, `URGENT`) and inline completion checkmark.
- **Bottom Section:**
  - **Academic Progression Chart:** Line chart visualizing semester-by-semester SGPA vs CGPA trajectory.
  - **Quick Action Bar:** Floating/pinned buttons for `+ Log Attendance`, `+ Add Event`, `+ Grade Entry`.

---

### 4.2 Screen 2: Attendance Manager (`/attendance`)
The dedicated attendance command center with integrated bunk intelligence.
- **Header Summary Strip:**
  - Global Attendance Average: `81.6%` (Total attended / Total conducted).
  - Configured Target Slider or quick input (Default: `75%`).
- **Subject Attendance Card Grid:**
  Each subject is rendered as an interactive card featuring:
  - **Subject Title & Code:** e.g. `CS301 - Operating Systems` (4 Credits).
  - **Circular or Linear Progress Gauge:** Color-coded (Emerald $\ge 75\%$, Amber $70-75\%$, Rose $< 70\%$).
  - **Counters:** Attended: `22` / Conducted: `28` (`78.6%`).
  - **Bunk / Catch-Up Simulator Pill:**
    - *If $\ge 75\%$*: 🟢 *"You can safely miss 2 more classes."*
    - *If $< 75\%$*: 🔴 *"You must attend the next 4 classes consecutively."*
  - **Quick-Tap Actions:**
    - `[+ Attended]` button (green accent, increments both $A$ and $C$).
    - `[+ Missed]` button (amber/red accent, increments $C$ only).
    - `[Undo / Edit]` button (opens manual adjustment modal with note logging).

---

### 4.3 Screen 3: Grades & Results (`/grades`)
Manages curriculum structure, semester milestones, and GPA calculations.
- **Top Summary Banner:**
  - Cumulative CGPA Card (`8.74 / 10.0`).
  - Total Credits Earned: `64 / 160`.
  - Active Grading Scale Selector (e.g. `Standard 10-Point Scale [Change]`).
- **Semester Accordion / Tabs:**
  - Tab list: `Semester 1` (Done), `Semester 2` (Done), `Semester 3` (Active - In Progress), `+ Add Semester`.
- **Subject Grade Sheet Table:**
  - Columns: `Course Code`, `Course Name`, `Category` (Core/Elective/Lab/Audit), `Credits`, `Grade Letter`, `Grade Point`, `Quality Points` ($C \times GP$), `Actions`.
  - Inline Grade Picker dropdown: `[O (10)]`, `[A+ (9)]`, `[A (8)]`, `[B (7)]`, `[F (0)]`, `[Audit / Pass]`.
  - Automatic live calculation of Semester SGPA in footer row.
- **"What-If" GPA Calculator Drawer:**
  - Allows students to simulate: *"If I score an A in Cloud Computing instead of B, what will my final CGPA be?"*

---

### 4.4 Screen 4: Event & Task Manager (`/events`)
Organizes deadlines, tests, presentations, and submissions.
- **View Toggle:** `[List View]` | `[Monthly Calendar]` | `[Weekly Timeline]`.
- **Filter Bar:** Filter by Event Type (`EXAM`, `ASSIGNMENT`, `PROJECT`, `TEST`), Priority, or Subject.
- **Event Card Detail:**
  - Checkbox to toggle `COMPLETED` / `PENDING`.
  - Title, Subject badge, Due Date & Countdown badge (e.g. `Due in 18 hours`).
  - Priority flag (Red for Urgent, Yellow for Medium).
  - Reminder status icon (e.g. 🔔 `Alert set for 2h prior`).
- **Add / Edit Event Modal:**
  - Title, Subject dropdown, Event Type, Start/End DateTime, Priority, Description, Reminders array (presets: 15m, 1h, 1d before).

---

### 4.5 Screen 5: Reminders Center (`/reminders` or Dropdown Drawer)
Central hub for triggered notifications and active alerts.
- Top Action: "Mark all as read" / "Clear dismissed".
- Alert List categorized by:
  - **Due Today / Overdue** (High visual urgency).
  - **Upcoming in next 48 Hours**.
  - **Attendance Warnings** (Triggered when any subject slips below target threshold).
- Each card has quick actions: `[Dismiss]`, `[Snooze 1 Hour]`, `[View Event]`.

---

### 4.6 Screen 6: Student Profile (`/profile`)
Personal academic identity and university details.
- Header with Avatar upload, Full Name, and Student ID / Roll Number.
- Editable Academic Information Card:
  - University / Institute Name.
  - Degree & Program (e.g., Bachelor of Technology).
  - Branch / Department (e.g., Computer Science).
  - Current Academic Year & Semester.
- Academic Milestone Summary: Total completed semesters, current total credits, degree completion percentage bar.

---

### 4.7 Screen 7: Settings (`/settings`)
Application-wide configurations and data controls.
- **Academic Defaults:**
  - Target Attendance Percentage input (default: `75%`).
  - Active Grading Scale configurator (view table of grade letters, points, and min/max percentage brackets; ability to add custom scale).
- **Theme & Display:**
  - Light, Dark, or System mode selector.
  - Date format preference (`DD/MM/YYYY` vs `MM/DD/YYYY`).
- **Notification Toggles:**
  - In-app notification sound / badges toggle.
  - Browser push notification permission requester.
- **Data Backup & Reset:**
  - `[Export Academic Data as JSON]` (Safe portable backup).
  - `[Import Data]` (Restore previous records).
  - `[Danger Zone: Reset All Academic Data]` (Protected by two-step confirmation modal).

---

## 5. Component Hierarchy

```
AppLayout
├── Navbar
│   ├── Logo & Brand
│   ├── SemesterSwitcher
│   ├── NotificationBell (with Popover Dropdown)
│   ├── ThemeToggle
│   └── UserAvatarMenu
├── Sidebar (Desktop) / MobileBottomBar (Mobile)
│   ├── NavItem (Dashboard)
│   ├── NavItem (Attendance)
│   ├── NavItem (Grades)
│   ├── NavItem (Events)
│   ├── NavItem (Profile)
│   └── NavItem (Settings)
├── PageContainer
│   ├── [DashboardPage]
│   │   ├── MetricStrip (StatCard x 4)
│   │   ├── AttendanceRadar (SubjectWarningCard x N)
│   │   ├── UpcomingEventsWidget (EventItem x N)
│   │   └── GPAProgressChart
│   ├── [AttendancePage]
│   │   ├── AttendanceHeader (GlobalSummary, TargetSlider)
│   │   ├── SubjectAttendanceGrid
│   │   │   └── SubjectAttendanceCard (Gauge, Counters, BunkPill, IncrementButtons)
│   │   └── ManualAttendanceModal
│   ├── [GradesPage]
│   │   ├── GPASummaryBanner
│   │   ├── SemesterTabs
│   │   ├── SubjectGradeTable (SubjectRow, GradeSelect, CreditCell)
│   │   └── WhatIfSimulatorDrawer
│   ├── [EventsPage]
│   │   ├── EventFilterBar
│   │   ├── CalendarView / EventListView
│   │   └── CreateEventModal (with ReminderPicker)
│   └── [SettingsPage]
│       ├── AttendanceTargetSetting
│       ├── GradingScaleManager
│       └── DataExportImportSection
└── ToastContainer (Global notification alerts)
```

---

## 6. Accessibility & Responsive Strategy

### 6.1 Responsive Breakpoints
- **Mobile (`< 640px`):** Single column layouts, fixed bottom navigation bar, card-based tables with swipe/tap actions, full-screen sheets for modals.
- **Tablet (`640px - 1024px`):** 2-column dashboard layout, collapsed icon-only sidebar, grid cards for attendance.
- **Desktop (`> 1024px`):** Expanded multi-column dashboard, persistent sidebar, rich data tables with inline grade selectors.

### 6.2 Accessibility Compliance (WCAG 2.1 AA)
- All interactive controls have visible `:focus-visible` rings with at least 3:1 contrast against surrounding surfaces.
- Semantic HTML tags (`<main>`, `<nav>`, `<header>`, `<section>`, `<article>`) used throughout.
- Color is never the sole indicator of status: attendance percentages always display both color and textual context (e.g. 🟢 "78.6% — Safe", 🔴 "68.2% — Shortage").
- Keyboard shortcuts for rapid daily attendance: `A` for Attended, `M` for Missed when focused on a subject card.
