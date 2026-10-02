# User Flows & Interaction Workflows
## Smart Student Manager

---

## 1. Primary User Journeys

```mermaid
graph LR
    A["1. Onboarding & Profile Setup"] --> B["2. Semester & Course Setup"]
    B --> C["3. Daily Attendance Tracking"]
    B --> D["4. Event & Reminder Management"]
    B --> E["5. Marks Entry & SGPA/CGPA Review"]
    C --> F["6. Dashboard Health Check"]
    D --> F
    E --> F
```

---

## 2. Detailed Step-by-Step User Flows

### 2.1 Flow 1: Onboarding & First-Time Setup

```mermaid
sequenceDiagram
    autonumber
    actor Student
    participant UI as Web Client
    participant Auth as Auth Handler
    participant DB as Database

    Student->>UI: Visits Landing Page & clicks "Get Started"
    UI->>Student: Renders Registration Form (Name, Email, Password)
    Student->>UI: Submits credentials
    UI->>Auth: POST /api/auth/register
    Auth->>DB: Create User record with default UserSetting (Target: 75%)
    Auth-->>UI: Session token created (HTTP-only cookie)
    UI->>Student: Redirects to Step-by-Step Onboarding Wizard
    
    rect rgb(240, 248, 255)
    Note over Student, UI: Onboarding Wizard (3 Simple Steps)
    Student->>UI: Step 1: Enters Profile (College, Degree, Major, Current Semester)
    Student->>UI: Step 2: Selects Grading Scale (Standard 10-Point or 4.0 Scale)
    Student->>UI: Step 3: Sets Default Attendance Target (e.g. 75% or 80%)
    UI->>DB: Updates StudentProfile and UserSetting
    end

    UI->>Student: Redirects to Dashboard with empty-state prompt: "Create your first semester"
```

#### Edge Cases & Recovery:
- **Email already registered:** Real-time form error displayed inline before page refresh.
- **Skipped Wizard:** Default settings (10-Point scale, 75% attendance target) are populated automatically so the student can start immediately without being blocked.

---

### 2.2 Flow 2: Semester & Subject Enrollment Flow

```mermaid
flowchart TD
    Start([User navigates to 'Grades' or clicks '+ Add Semester']) --> Modal[Semester Creation Modal]
    Modal --> FormInput[Enter Name e.g. 'Semester 3', Number: 3, Status: Active]
    FormInput --> SubmitSemester[Submit Semester]
    SubmitSemester --> SubjectPrompt{Add Subjects Now?}
    
    SubjectPrompt -->|Yes| SubModal[Subject Input Drawer / Table]
    SubjectPrompt -->|Later| RedirectActive[Redirect to Semester View]
    
    SubModal --> AddRow[Enter Subject Name, Code, Credits e.g. 4.0, Category: Core]
    AddRow --> MoreSubjects{Add Another?}
    MoreSubjects -->|Yes| AddRow
    MoreSubjects -->|No| SaveSubjects[Save Subjects to Database]
    SaveSubjects --> AutoInit[Auto-initialize AttendanceRecord C=0, A=0 for each subject]
    AutoInit --> RedirectActive
```

#### Key Architecture Rule:
Whenever a subject is created, an associated `AttendanceRecord` is automatically instantiated with `classesConducted = 0` and `classesAttended = 0`. This guarantees zero orphan subject states and instant attendance availability.

---

### 2.3 Flow 3: Daily Attendance Logging & "Bunk Simulator" Flow

```mermaid
flowchart TD
    OpenAtt([Student opens Attendance Page]) --> LoadCards[Render Subject Attendance Cards]
    LoadCards --> CalcState[Run Attendance Calculation Engine]
    
    CalcState --> CheckConducted{Classes Conducted == 0?}
    CheckConducted -->|Yes| ShowNeutral["Badge: 'No classes yet'<br/>Safe status (100%)"]
    CheckConducted -->|No| EvalTarget{"Percentage >= Target (75%)?"}
    
    EvalTarget -->|Yes: Safe| BunkCalc["Calculate Max Classes to Miss (M)<br/>Show Green Badge: 'Can skip M classes'"]
    EvalTarget -->|No: Deficit| CatchCalc["Calculate Classes to Catch Up (R)<br/>Show Red Badge: 'Must attend next R classes'"]
    
    ShowNeutral --> ActionClick{User Action}
    BunkCalc --> ActionClick
    CatchCalc --> ActionClick

    ActionClick -->|Tap '+ Attended'| IncBoth["Increment A + 1, C + 1<br/>Optimistic UI Update"]
    ActionClick -->|Tap '+ Missed'| IncCond["Increment C + 1 only<br/>Optimistic UI Update"]
    ActionClick -->|Tap 'Undo'| Decrement["Revert previous action"]

    IncBoth --> PushAPI[PUT /api/attendance/:subjectId]
    IncCond --> PushAPI
    Decrement --> PushAPI
    PushAPI --> ReCalc[Live update % and Bunk/Catch-up gauge]
```

#### Edge Cases & Protection:
- **Accidental double click:** Rapid debouncing on action buttons prevents accidental bursts.
- **Attended > Conducted Attempt:** If user manually edits numbers in modal and sets $A > C$, client-side Zod validation stops submission and outlines the field in red.

---

### 2.4 Flow 4: Marks Entry & SGPA/CGPA Audit Flow

```mermaid
flowchart TD
    SelectSem([Student selects Semester]) --> ViewSubjects[Display Subject List with Credits]
    ViewSubjects --> ClickGrade[Clicks 'Enter Grade' on Subject]
    ClickGrade --> GradeModal[Modal: Choose Grade Letter or enter Marks]
    
    GradeModal --> Mapping{Input Type}
    Mapping -->|Selects Letter e.g. 'A+'| LookupPoint[Grade Point = 9.0 from active GradingScale]
    Mapping -->|Enters Marks e.g. 84/100| AutoMap[Auto-match to Letter 'A' and Point 9.0]
    
    LookupPoint --> SaveGrade[Save SubjectGrade record]
    AutoMap --> SaveGrade
    SaveGrade --> TriggerGPA[Run GPA Calculation Engine]
    
    TriggerGPA --> CalcSGPA["Compute SGPA = Sum(Credits * GradePoint) / Sum(Credits)"]
    CalcSGPA --> CalcCGPA["Compute CGPA across all Completed/Active Semesters"]
    CalcCGPA --> UpdateUI["Animate SGPA / CGPA gauges on screen"]
```

---

### 2.5 Flow 5: Event Creation & Reminder Trigger Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Student
    participant UI as Event Manager UI
    participant Worker as Reminder Service
    participant API as /api/events
    participant DB as Database

    Student->>UI: Clicks "+ Add Event"
    UI->>Student: Opens Event Drawer
    Student->>UI: Fills Title ("OS Midterm Exam"), Type ("EXAM"), Priority ("HIGH"), Date/Time
    Student->>UI: Sets Reminder: "24 Hours Before" + "2 Hours Before"
    UI->>API: POST /api/events (with reminders array)
    API->>DB: Creates Event and 2 Reminder rows (status: SCHEDULED, triggerAt: calculated timestamp)
    API-->>UI: Event Created Successfully
    UI->>Student: Renders event tag in Calendar & Agenda

    Note over Worker, DB: Continuous In-App Notification Loop
    Worker->>DB: Queries triggerAt <= NOW() AND status == 'SCHEDULED'
    DB-->>Worker: Returns triggered reminders
    Worker->>UI: Dispatches Notification Event (Bell Icon badges +1)
    UI->>Student: Displays Non-intrusive Toast: "Upcoming: OS Midterm Exam in 2 hours!"
    Student->>UI: Clicks "Dismiss" or "Mark Event Completed"
    UI->>API: PATCH /api/reminders/:id { status: 'DISMISSED' }
```

---

## 3. Summary of Exception Handling in User Flows

| Flow | Scenario | System Handling |
|---|---|---|
| **Attendance** | Student enters 0 conducted classes | System gracefully shows $100\%$ placeholder with prompt "No classes conducted yet", avoiding `0/0` NaN errors. |
| **Attendance** | Target is set to $100\%$ | Catch-up formula avoids division by zero $(100 - 100)$ by enforcing a maximum allowed target of $99.9\%$ in validation rules. |
| **Grades** | Semester has only 0-credit audit courses | SGPA is reported as `N/A` rather than `0.00`, preventing false academic failure flags. |
| **Events** | Event start date is set in the past | Allowed for retrospective record-keeping, but reminder generation is automatically skipped. |
| **Network** | Device goes offline during attendance click | Optimistic UI update informs student: "Saved locally. Syncing with cloud..." and retries on reconnect. |
