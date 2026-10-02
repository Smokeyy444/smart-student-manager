# Mathematical Specification & Calculation Engine Reference
## Smart Student Manager

---

## 1. Overview & Architectural Principles

The calculation engine in `src/lib/calculations/` contains the core mathematical logic for **Smart Student Manager**.

### Core Guarantees:
1. **Purity:** Every calculation function is deterministic with zero external side effects. No database queries, no HTTP requests, and no UI framework dependencies.
2. **Precision Policy:** Full 64-bit IEEE 754 floating-point precision is maintained during intermediate calculations. Rounding is applied only once at the final presentation/return boundary using `Number.EPSILON` to prevent binary floating-point representation anomalies.
3. **Decoupled Grading Scales:** No hardcoded scale formulas. The engine accepts arbitrary `GradingScaleDefinition` instances (10-point, 4.0-point, percentage, or custom).
4. **Defensive Validation:** All functions validate input domains (e.g. non-negative integers, $A \le C$, $T \in [0, 100]$) and throw domain-specific typed errors (`AttendanceValidationError`, `GPAValidationError`, `GradingScaleError`) rather than silently returning NaN or incorrect figures.

---

## 2. Attendance Engine

### 2.1 Variables & Definitions

| Symbol | Name | Type | Valid Domain | Description |
|---|---|---|---|---|
| $A$ | Classes Attended | Integer | $A \in \mathbb{Z}_{\ge 0}$ | Number of lectures the student attended. |
| $C$ | Classes Conducted | Integer | $C \in \mathbb{Z}_{\ge 0}, C \ge A$ | Total number of lectures held by faculty. |
| $T$ | Target Percentage | Float | $T \in [0, 100]$ | Institutional requirement (default: $75.0\%$). |
| $P$ | Attendance Percentage | Float | $P \in [0, 100]$ | Current attendance standing. |
| $M$ | Bunk Buffer | Integer | $M \in \mathbb{Z}_{\ge 0} \cup \{\infty\}$ | Max classes that can be missed while staying $\ge T\%$. |
| $R$ | Recovery Classes | Integer | $R \in \mathbb{Z}_{\ge 0} \cup \{\infty\}$ | Min consecutive classes to attend to reach $T\%$. |

---

### 2.2 Formulas

#### 1. Attendance Percentage ($P$)
$$P = \begin{cases} 
100.0\% & \text{if } C = 0 \quad (\text{Neutral/Safe baseline when semester begins}) \\
\left(\frac{A}{C}\right) \times 100 & \text{if } C > 0
\end{cases}$$

#### 2. Status Classification
$$\text{Status} = \begin{cases}
\text{NEUTRAL} & \text{if } C = 0 \\
\text{ON\_TRACK} & \text{if } P \ge T \\
\text{WARNING} & \text{if } T - 5 \le P < T \\
\text{CRITICAL} & \text{if } P < T - 5
\end{cases}$$

#### 3. Bunk Buffer ("Safe Skips", $M$)
When $P \ge T$ and $C > 0$, if a student misses $M$ future classes consecutively, total conducted becomes $C + M$ while attended remains $A$:
$$\frac{A}{C + M} \ge \frac{T}{100}$$
$$A \ge \frac{T}{100}(C + M) \implies 100A \ge TC + TM \implies TM \le 100A - TC$$
$$M \le \frac{100A - TC}{T}$$
Since classes are discrete integer sessions:
$$M = \max\left(0, \left\lfloor \frac{100A - TC}{T} \right\rfloor\right)$$

*Special Boundary Cases for $M$:*
- If $T = 0$: Returns `Infinity` (any number of classes can be missed without breaching 0%).
- If $P < T$: Returns `0`.
- If $C = 0$: Returns `0`.

#### 4. Recovery Classes ("Catch-Up Sessions", $R$)
When $P < T$, if a student attends the next $R$ classes consecutively, both attended and conducted increase by $R$:
$$\frac{A + R}{C + R} \ge \frac{T}{100}$$
$$100(A + R) \ge T(C + R) \implies 100A + 100R \ge TC + TR$$
$$(100 - T)R \ge TC - 100A$$
$$R \ge \frac{TC - 100A}{100 - T}$$
Since classes are discrete integer sessions:
$$R = \max\left(0, \left\lceil \frac{TC - 100A}{100 - T} \right\rceil\right)$$

*Special Boundary Cases for $R$:*
- If $P \ge T$: Returns `0`.
- If $C = 0$: Returns `0`.
- **Target $T = 100\%$ with $A < C$:** Once a class has been missed ($A < C$), $\frac{A + R}{C + R} = \frac{C - 1 + R}{C + R} < 1.0$ for any finite $R$. It is mathematically **impossible** to achieve 100% attendance. In this case, `isPossible` returns `false` and `classesRequired` returns `Infinity`.

---

### 2.3 Worked Examples

#### Example 1: Bunk Calculation
- Attended $A = 22$, Conducted $C = 25$, Target $T = 75\%$
- Percentage: $P = \frac{22}{25} \times 100 = 88.0\%$ ($P \ge 75\%$, Status: `ON_TRACK`)
- Bunk Buffer:
  $$M = \left\lfloor \frac{100(22) - 75(25)}{75} \right\rfloor = \left\lfloor \frac{2200 - 1875}{75} \right\rfloor = \left\lfloor \frac{325}{75} \right\rfloor = \lfloor 4.333 \rfloor = 4$$
- **Verification:**
  - If student misses 4 classes: $A = 22$, $C = 29 \implies \frac{22}{29} \times 100 = 75.86\% \ge 75\%$ (Safe).
  - If student misses 5 classes: $A = 22$, $C = 30 \implies \frac{22}{30} \times 100 = 73.33\% < 75\%$ (Breached).
  - Hence $M = 4$ is exact.

#### Example 2: Catch-Up Calculation
- Attended $A = 12$, Conducted $C = 20$, Target $T = 75\%$
- Percentage: $P = \frac{12}{20} \times 100 = 60.0\%$ ($P < 75\%$, Status: `CRITICAL`)
- Recovery Classes:
  $$R = \left\lceil \frac{75(20) - 100(12)}{100 - 75} \right\rceil = \left\lceil \frac{1500 - 1200}{25} \right\rceil = \left\lceil \frac{300}{25} \right\rceil = \lceil 12.0 \rceil = 12$$
- **Verification:**
  - After attending 12 consecutive classes: $A = 24$, $C = 32 \implies \frac{24}{32} \times 100 = 75.0\%$ (Target exactly reached).

---

## 3. GPA & Grading Scale Engine

### 3.1 Variables & Definitions

| Symbol | Name | Type | Description |
|---|---|---|---|
| $c_i$ | Course Credit Hours | Float | Weight of subject $i$ (e.g. $4.0, 3.0, 1.5$). |
| $g_i$ | Grade Point | Float | Numeric point assigned to grade letter (e.g. $A+ = 9.0$). |
| $N$ | Evaluated Subjects | Integer | Count of credit-bearing graded subjects in semester. |
| $QP$ | Quality Points | Float | $c_i \times g_i$. |
| $SGPA$ | Semester GPA | Float | Weighted average for a single semester. |
| $CGPA$ | Cumulative GPA | Float | Credit-weighted average across all completed semesters. |

---

### 3.2 Formulas

#### 1. Semester Grade Point Average (SGPA)
$$\text{Total Semester Credits} = \sum_{i=1}^{N} c_i$$
$$\text{Total Quality Points} = \sum_{i=1}^{N} (c_i \times g_i)$$
$$\text{SGPA} = \begin{cases}
\text{null} & \text{if } \sum c_i = 0 \quad (\text{No credit-bearing courses enrolled/graded}) \\
\frac{\sum_{i=1}^{N} (c_i \times g_i)}{\sum_{i=1}^{N} c_i} & \text{if } \sum c_i > 0
\end{cases}$$

#### 2. Cumulative Grade Point Average (CGPA)
Across $S$ completed semesters:
$$\text{CGPA} = \frac{\sum_{j=1}^{S} \text{QualityPoints}_j}{\sum_{j=1}^{S} \text{Credits}_j} = \frac{\sum_{j=1}^{S} (C_j \times SGPA_j)}{\sum_{j=1}^{S} C_j}$$

> **Important Mathematical Note:** CGPA is **NOT** the arithmetic mean of semester SGPAs:
> $$\text{CGPA} \ne \frac{1}{S} \sum_{j=1}^{S} SGPA_j$$
> If Semester 1 has 24 credits and Semester 2 has 12 credits, Semester 1 carries twice the weight in CGPA.

#### 3. Audit & Zero-Credit Subjects
Subjects where `isAudit: true` or `creditHours === 0` are excluded from both numerator and denominator in SGPA and CGPA. They do not dilute or inflate academic averages.

---

### 3.3 Default 10-Point Grading Scale

Configured in `src/lib/constants/grading.ts`:

| Grade Letter | Grade Point | Minimum Percentage | Description | Passing? |
|---|---|---|---|---|
| **O** | 10.0 | $\ge 90\%$ | Outstanding | Yes |
| **A+** | 9.0 | $\ge 80\%$ | Excellent | Yes |
| **A** | 8.0 | $\ge 70\%$ | Very Good | Yes |
| **B+** | 7.0 | $\ge 60\%$ | Good | Yes |
| **B** | 6.0 | $\ge 55\%$ | Above Average | Yes |
| **C** | 5.0 | $\ge 50\%$ | Average | Yes |
| **D** | 4.0 | $\ge 40\%$ | Pass | Yes |
| **F** | 0.0 | $< 40\%$ | Fail | No |

---

## 4. Precision & Rounding Policy

1. **Intermediate Calculations:** Kept at full 64-bit IEEE 754 precision.
2. **Final Display Values:**
   - SGPA: 2 decimal places (e.g. `8.75`).
   - CGPA: 2 decimal places (e.g. `8.64`).
   - Attendance Percentage: 2 decimal places (e.g. `81.25%`).
3. **Rounding Implementation:**
   ```typescript
   export function roundToDecimals(value: number, decimals: number = 2): number {
     const factor = Math.pow(10, decimals);
     return Math.round((value + Number.EPSILON) * factor) / factor;
   }
   ```
   `Number.EPSILON` prevents standard floating-point representation rounding bugs (e.g. `1.005 * 100 = 100.49999999999999` rounding down to `1.00` instead of `1.01`).

---

## 5. Input Modes Supported by Domain Layer

The calculation layer supports all future UI input modes:

1. **Direct Grade Entry:** Student selects `gradeLetter` or `gradePoint`.
2. **Marks + Maximum Marks Entry:** Student inputs `marksObtained` and `maxMarks` (percentage automatically resolved).
3. **Optional Grade + Marks Validation:** `validateMarksAndGrade()` verifies that entered marks do not contradict the selected grade letter.
4. **Aggregate Attendance:** Direct adjustment of $A$ and $C$ counters.
5. **Incremental Session Logging:** Present/Absent increments.
6. **Detailed Session Logs:** `aggregateAttendanceLogs()` aggregates history records (Present, Absent, Cancelled).
7. **Bulk/CSV Import Data Structures:** `parseBulkAttendanceRecord()` cleanly validates rows for spreadsheet/CSV uploads.
