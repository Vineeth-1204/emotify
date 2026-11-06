# Priority 11 Step 5D: Counselor Roster & History Pagination — Read-Only Audit

**Status**: AUDIT COMPLETE — IMPLEMENTATION PENDING  
**Scope**: Read-Only Audit of Counselor Roster, History Queries, Authorization Boundaries, Privacy, and Pagination Requirements.  
**Constraint Enforcement**: No production code, schema, indexes, dashboard UI, or data modified. Step 5E/5F/5G deferred.

---

## 1. Executive Summary

Priority 11 Step 5D audits the scalability, bounding, authorization, and data privacy of all counselor-facing roster and history queries across the Emotify backend (`convex/`) and web dashboard (`dashboard/`).

While Priority 11 Steps 5A through 5C successfully hardened student telemetry (`getSevenDayMoodAnalytics`, `getRecentScreenings`), compound telemetry indexes, and the 18-source Clinical Timeline (`getStudentClinicalTimeline`), the **counselor management and clinical overview surfaces remain vulnerable to unbounded data growth**. Specifically:
1. **Unbounded Patient Roster Scan**: `api.users.listPatients` issues an unbounded `.collect()` on all users with role `patient`, applies in-memory chronological sorting and string-matching search, and returns the entire database array to the frontend without database limits or pagination.
2. **Dashboard Overview Table Scans**: `api.dashboard.getDashboardOverview` and `api.dashboard.getAlerts` execute full-table scans across `triages`, `alerts`, and `users`, aggregating historical data in server memory on every dashboard poll.
3. **Authorization-After-Retrieval Flaws (P0 Security Findings)**: In `getAlerts` and `getActivityFeed`, when called by a student, the queries retrieve global alerts and telemetry across all institutional patients first, filtering by `userId` in-memory *after* database retrieval.
4. **Truncated History Without Pagination**: Counselor history views like `listAllCbtSessions`, `getCounsellorRequests`, and `getAuditLogs` enforce a hard `.take(50)` or `.take(100)` limit without cursor pagination, permanently hiding historical clinical records older than the most recent batch.
5. **Mitra Privacy Decision Alignment**: `getPatientAiChatHistoryAdmin` and `getUsersWithAiChats` retrieve raw conversational chat text across the entire tenant without being gated behind active safety alerts, conflicting with the established Priority 10 privacy architecture.

The established Emotify architecture enforces **role-based institution-wide clinical access** for counselors and administrators under `assertCanAccessStudent` and `checkStaff`. There is currently **no student-counselor assignment/caseload mapping table**. This audit reflects that exact model without inventing fictitious caseload mapping.

---

## 2. Baseline Verification

Before conducting the read-only audit, system integrity was verified:

| Check | Tool / Command | Result |
|---|---|---|
| **Full Test Suite** | `npx vitest run` | **445 / 445 PASSING** across 23 test files (8.06s) |
| **TypeScript Validation** | `npx tsc --noEmit` | **0 errors / clean** |
| **Dashboard Production Build** | `npm --prefix dashboard run build` | **0 errors / clean build (770ms)** |

---

## 3. Counselor Roster Audit (`api.users.listPatients`)

### Implementation Analysis (`convex/users.ts:72-107`)
```typescript
export const listPatients = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const staff = await checkStaff(ctx);
    if (!staff) return [];

    let users = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "patient"))
      .collect();

    users.sort((a, b) => (a._creationTime || a.created_at || 0) - (b._creationTime || b.created_at || 0));

    let mapped = users.map((u, idx) => {
      const safe = sanitizeUser(u);
      return {
        ...safe,
        patientId: u.patientId || String(101 + idx),
      };
    });

    if (args.search) {
      const s = args.search.toLowerCase();
      mapped = mapped.filter(
        (u: any) =>
          (u.patientId || "").toLowerCase().includes(s) ||
          (u.full_name || "").toLowerCase().includes(s) ||
          (u.mobile_number || "").includes(s)
      );
    }

    return mapped;
  },
});
```

### Detailed Evaluation Against Audit Requirements
| Audit Dimension | Finding | Assessment |
|---|---|---|
| **A. Memory Load** | **YES**. Unconditionally calls `.collect()` on `users.withIndex("by_role", q => q.eq("role", "patient"))`. | Loads every student in the institution into memory on every keystroke/poll. Severe O(N) memory and bandwidth liability. |
| **B. Post-Collect Search** | **YES**. Search parameter `args.search` is evaluated in-memory via JavaScript `String.includes` after the full collection. | Database indexes are not leveraged for filtering. |
| **C. Post-Collect Sorting** | **YES**. In-memory `.sort()` by `_creationTime || created_at`. | CPU cost on Convex server scales with student count. |
| **D. Post-Collect Slicing** | **NO**. It returns the entire array without even slicing or capping output. | Bandwidth scales linearly with student count. |
| **E. Index Quality** | Index `by_role: ["role"]` is used. | Lacks a compound index such as `by_role_and_creationTime: ["role", "_creationTime"]` for index-backed descending ordering. |
| **F. Field Exposure** | Applies `sanitizeUser(u)` to strip password hashes and biometric tokens. | Returns complete contact profiles, emergency contacts, aliases, and metadata. |
| **G. Authorization Timing** | **BEFORE**. Calls `checkStaff(ctx)` at line 75 before querying `ctx.db`. | Correctly enforces staff authorization before database query. |
| **H. Institutional Scope** | **Institution-wide by design**. | Accurately follows the established Emotify role-based access model. |

### Dashboard Callers
1. `dashboard/src/pages/PatientsList.tsx:162`:
   - Calls `useQuery(api.users.listPatients, { search: searchTerm })`.
   - Assumes a flat array (`patients?.length`, `patients.map(...)`).
   - Renders entire list in a table with zero pagination controls.
2. `dashboard/src/pages/Sessions.tsx:21`:
   - Calls `useQuery(api.users.listPatients, {})`.
   - Uses the array to populate a patient selector `<select>` dropdown (`patients?.map(p => <option key={p._id} ...>)`) and perform `.find(...)`.

---

## 4. Comprehensive Query Audit Inventory

| # | Function Name | File | Caller(s) | Auth Check | Source Table | Index Used | Scoped? | Bounded? | Sort Location | Filter Location | Paginated? | Sensitive Data? | Growth Risk |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `listPatients` | `convex/users.ts:72` | `PatientsList.tsx`, `Sessions.tsx` | `checkStaff` (before) | `users` | `by_role` | Institution | **NO** (`.collect()`) | Memory | Memory | **NO** | Contact, Patient Profile | **CRITICAL (P1)** |
| 2 | `getDashboardOverview` | `convex/dashboard.ts:28` | `Overview.tsx` | `caller.role` (before) | `users`, `triages`, `alerts` | `by_role`, none, `by_status` | Institution | **NO** (multiple `.collect()`) | Memory | Memory | **NO** | Aggregated triage/risk stats | **CRITICAL (P1)** |
| 3 | `getAlerts` | `convex/dashboard.ts:116` | `AlertsCenter.tsx`, `DashboardLayout.tsx` | **AFTER (for students)**; before for staff | `alerts`, `users`, `triages` | none, `by_role`, none | Hybrid | **NO** (multiple `.collect()`) | Database (`alerts`), Memory | Memory | **NO** | Suicide flags, psychosis alerts, patient names | **CRITICAL (P0 / P1)** |
| 4 | `getActivityFeed` | `convex/dashboard.ts:232` | `Overview.tsx` | **AFTER (for students)**; before for staff | `alerts`, `emotionLogs`, `microGoals` | none | Hybrid | **PARTIAL** (`.take(15/50)`) | Database, then Memory | Memory | **NO** | Alerts, emotions, patient names | **HIGH (P0 / P1)** |
| 5 | `listAllCbtSessions` | `convex/dashboard.ts:586` | `Sessions.tsx` | `caller.role` (before) | `cbtSessions`, `users` | none | Institution | **HARD CAP (50)** | Database | None | **NO** | CBT thoughts, distortions, scores | **HIGH (P1)** |
| 6 | `getCounsellorRequests` | `convex/dashboard.ts:609` | `CounsellorRequests.tsx` | `caller.role` (before) | `counsellorRequests`, `users` | none | Institution | **HARD CAP (50)** | Database | None | **NO** | Crisis situations, thoughts, contact info | **HIGH (P1)** |
| 7 | `getAuditLogs` | `convex/dashboard.ts:644` | `AuditLogs.tsx` | `caller.role === 'admin'` (before) | `auditLogs`, `users` | none | Institution | **HARD CAP (100)** | Database | None | **NO** | Staff actions, security events | **MEDIUM (P1)** |
| 8 | `getCounsellors` | `convex/dashboard.ts:669` | `Counsellors.tsx` | `caller.role` (before) | `counsellors` | none | Institution | **NO** (`.collect()`) | Database | None | **NO** | Staff workload, ratings, contacts | **LOW (P2)** |
| 9 | `getPatientTimeline` | `convex/dashboard.ts:716` | Legacy tests | `assertCanAccessStudent` (before) | `clinicalTimelines` | `by_userId` | User | **NO** (`.collect()`) | Database | None | **NO** | Clinical notes | **MEDIUM (P2)** |
| 10 | `getPatientCbtAnalytics` | `convex/dashboard.ts:316` | `PatientDetail.tsx` | `assertCanAccessStudent` (before) | `cbtSessions`, `jpmrLogs`, `breathingLogs`, `groundingLogs`, `emotionMaps`, `emotionLogs`, `reframeLogs`, `streaks`, `badges` | `by_userId` | User | **NO** (multiple `.collect()`) | Memory | Memory | **NO** | Complete longitudinal patient analytics | **HIGH (P1)** |
| 11 | `getEnterpriseAnalytics` | `convex/dashboard.ts:791` | `Analytics.tsx`, `ScreeningCentre.tsx` | `caller.role` (before) | `users`, `cbtSessions`, `triages`, `screeningAttempts`, `emotionLogs` | none | Institution | **NO** (multiple `.collect()`) | None | Memory | **NO** | Institutional PHQ/GAD averages, risk distribution | **STEP 5E SCOPE** |
| 12 | `getUsersWithAiChats` | `convex/dashboard.ts:909` | `AiMonitoring.tsx` | `caller.role` (before) | `aiCompanionLogs`, `companionMessages`, `aiMonitoringLogs`, `users` | none | Institution | **NO** (multiple `.collect()`) | Memory | Memory | **NO** | Full chat messages, snippets, counts | **CRITICAL (P0 / P1)** |
| 13 | `getPatientAiChatHistoryAdmin` | `convex/dashboard.ts:1043` | `AiMonitoring.tsx` | `caller.role` (before, but no student check) | `aiCompanionLogs`, `companionMessages`, `aiMonitoringLogs`, `users` | `by_userId` | User | **NO** (`.collect()`) | Database, then Memory | None | **NO** | **Raw conversational chat transcripts** | **CRITICAL (P0 / PRIVACY)** |
| 14 | `getAll` | `convex/screening.ts:466` | `PatientDetail.tsx` | `assertCanAccessStudent` (before) | `screeningAttempts`, `screenings` | `by_userId` | User | **NO** (`.collect()`) | Memory | Memory | **NO** | Item-level PHQ-9/GAD-7/WSAS/ReQoL scores | **MEDIUM (P1)** |
| 15 | `getScreeningHistory` | `convex/screening.ts:350` | App / Telemetry | `assertCanAccessStudent` (before) | `screeningAttempts` | `by_userId` | User | **YES** (`.take(20)`) | Database | None | **NO** | Longitudinal assessment history | **ALREADY BOUNDED (5A)** |
| 16 | `getAllAttempts` | `convex/screening.ts:372` | App / Telemetry | `assertCanAccessStudent` (before) | `screeningAttempts` | `by_userId` | User | **YES** (`.take(20)`) | Database | None | **NO** | Longitudinal assessment history | **ALREADY BOUNDED (5A)** |
| 17 | `getPending` (Alerts) | `convex/alerts.ts:56` | `PatientDetail.tsx` | `assertCanAccessStudent` (before) | `alerts` | `by_userId` | User | **NO** (`.collect()`) | Memory | In-DB + In-Mem | **NO** | Active crisis alerts | **MEDIUM (P1)** |
| 18 | `getAll` (Alerts) | `convex/alerts.ts:105` | Internal | `assertCanAccessStudent` (before) | `alerts` | `by_userId` | User | **NO** (`.collect()`) | Database | None | **NO** | Historical alerts | **MEDIUM (P1)** |
| 19 | `getPending` (FollowUps) | `convex/followUps.ts:39` | Internal | `assertCanAccessStudent` (before) | `followUps` | `by_userId` | User | **NO** (`.collect()`) | None | In-DB + In-Mem | **NO** | Pending check-in obligations | **MEDIUM (P1)** |
| 20 | `listAllTwoWayAppointments` | `convex/appointments.ts:422` | `Overview.tsx` | `caller.role` (before) | `appointments` | none | Institution | **NO** (`.collect()`) | Memory | Memory | **NO** | Scheduled session dates & patient IDs | **MEDIUM (P1)** |
| 21 | `listAllTwoWayAppointmentsPaginated` | `convex/appointments.ts:436` | `Sessions.tsx` | `caller.role` (before) | `appointments` | none | Institution | **YES** (`.paginate()`) | Database | Memory post-filter | **YES (built-in)** | Scheduled appointments | **LOW (P2)** |
| 22 | `getStudentClinicalTimeline` | `convex/timeline.ts:153` | `ClinicalTimelineView.tsx` | `assertCanAccessStudent` (before) | 18 tables | Compound indexes | User | **YES** (iterative stream `targetEligible`) | Compound Index + Memory tie-break | Stream In-Flight | **YES (cursor)** | Clinical chronological events | **CLOSED (5C)** |

---

## 5. History Query Audit

### 1. Screening History
- `api.screening.getScreeningHistory` and `api.screening.getAllAttempts` were bounded to 20 records descending in Step 5A.
- However, `api.screening.getAll` (`convex/screening.ts:466`), consumed by `PatientDetail.tsx:87`, still uses unbounded `.collect()`. In `PatientDetail.tsx`, it calculates score trajectory charts across all historical screenings. It needs bounded retrieval or pagination if a student takes hundreds of assessments over multi-year enrollment.

### 2. CBT History
- `api.dashboard.listAllCbtSessions` retrieves all CBT sessions across the institution with `.take(50)`.
- It is bounded, but lacks pagination: after 50 sessions occur across the entire student population, sessions #51 and older disappear from the counselor's view.
- In `PatientDetail.tsx`, `api.dashboard.getPatientCbtAnalytics` collects every CBT session for that student to compute distortion distributions and improvement percentages.

### 3. Appointments & Follow-ups
- `api.appointments.listAllTwoWayAppointmentsPaginated` uses Convex's native `.paginate(args.paginationOpts)`. However, it applies `page: results.page.filter(a => a.date && a.time)` after `.paginate()`, meaning a returned page could contain fewer than the requested page size if incomplete appointment records exist.
- `api.appointments.listAllTwoWayAppointments` is unbounded `.collect()` used by `Overview.tsx:17` to find today's appointments.
- `api.followUps.getPending` is unbounded `.collect()`, though typically small (<20 items per student).

### 4. Safety Alerts History
- `api.dashboard.getAlerts` is unbounded across all alerts in the database, with secondary unindexed scans of `triages` and `users`.
- `api.alerts.getPending` is user-scoped and filtered by `status === "pending"`, but uses `.collect()`.

### 5. AI Monitoring History
- `api.dashboard.getUsersWithAiChats` scans all `aiCompanionLogs`, `companionMessages`, and `aiMonitoringLogs` to compute chat counts.
- `api.dashboard.getAiMonitoringLogs` is bounded with `.take(50)`.

---

## 6. Export Audit

### Inventory of Export Features
1. **Overview Report Export (`dashboard/src/pages/Overview.tsx:20`)**:
   - `handleExportReport`: Calls `window.print()` directly in the browser.
   - Triggers native browser print preview styled via CSS `@media print`.
   - **No backend export query or mutation exists.**
2. **Hospital Reports Generator (`dashboard/src/pages/Reports.tsx`)**:
   - `handlePrint`: Calls `window.print()`.
   - Contains 3 UI cards: "Patient Outcome Report", "Counsellor Workload Report", and "Hospital Audit & Compliance".
   - The "Download PDF", "Download CSV", and "Download Excel" buttons have **no `onClick` handlers or backend bindings** (static mock UI).
3. **Bulk Export Backend APIs**:
   - There are **no bulk export queries or mutations in Convex**.

### Evaluation
- No user-facing export functionality will be broken by implementing pagination on dashboard listing queries.
- Official bulk export capability (PDF/CSV/Excel) is an unbuilt feature that should be implemented with dedicated streaming or batched background tasks rather than overloading interactive dashboard listing queries.

---

## 7. Authorization Audit

### Authorization Enforcement Timing
Emotify's authorization model uses three levels:
1. `assertCanAccessStudent(ctx, targetUserId)` (`convex/authz.ts:86`):
   - **Student**: Allowed to access **only** their own records (`targetUserId === identity.subject` or matches user's canonical `_id`/`clerkId`).
   - **Counselor / Admin**: Granted institution-wide clinical access across all students.
   - **Unauthenticated**: Throws immediate error.
2. `checkStaff(ctx)` / `requireCounselorOrAdmin(ctx)`:
   - Validates that the caller is authenticated and has role `counsellor` or `admin`.
3. `requireAdmin(ctx)`:
   - Validates that caller has role `admin`.

### Critical Security Findings (P0): Authorization-After-Retrieval
Two queries in `convex/dashboard.ts` perform authorization filtering **after** collecting global data from the database:

1. **`convex/dashboard.ts:getAlerts` (Lines 126–136)**:
   ```typescript
   // Fetch ALL alerts across the entire institution first:
   let dbAlerts = await ctx.db.query("alerts").order("desc").collect();

   // If caller is a student, filter in-memory after retrieval:
   if (!isStaff) {
     dbAlerts = dbAlerts.filter(
       (a) => a.userId === canonicalId || ...
     );
   }
   ```
   **Security Violation**: The database query reads clinical alerts for every patient in the institution into memory before evaluating student permissions.
2. **`convex/dashboard.ts:getActivityFeed` (Lines 242–253)**:
   ```typescript
   let alerts = await ctx.db.query("alerts").order("desc").take(isStaff ? 15 : 50);
   let emotionLogs = await ctx.db.query("emotionLogs").order("desc").take(isStaff ? 15 : 50);
   let microGoals = await ctx.db.query("microGoals").order("desc").take(isStaff ? 15 : 50);

   if (!isStaff) {
     alerts = alerts.filter(a => matchesCaller(a.userId));
     emotionLogs = emotionLogs.filter(e => matchesCaller(e.userId));
     microGoals = microGoals.filter(m => matchesCaller(m.userId));
   }
   ```
   **Security & Correctness Violation**: Global records are fetched without user-scoping. If other students generate 50 events, a student's feed will be starved and empty because the post-filter drops all 50 global records.

---

## 8. Pagination Design for Step 5D

### 1. Patient Directory / Counselor Roster (`api.users.listPatients`)
- **Query Signature**:
  ```typescript
  export const listPatients = query({
    args: {
      search: v.optional(v.string()),
      cursor: v.optional(v.string()),
      limit: v.optional(v.number()),
      paginate: v.optional(v.boolean()),
    },
    ...
  });
  ```
- **Ordering**: Deterministic compound key `(created_at DESC, _id DESC)` or `(patientId DESC, _id DESC)`.
- **Compound Index Required**: `users.index("by_role_and_created_at", ["role", "created_at"])`.
- **Search Strategy**:
  - When `search` is provided: If search query matches a `patientId` (e.g. "101"), use `by_patientId` index or prefix search. If search query is short text (name/mobile), query up to a bounded scan budget (e.g. 200 candidates) and return the first page.
- **Page Size**: Default `25`, Maximum `50`.
- **Cursor Structure**: Base64 encoded `{ createdAt: number, id: string }`.
- **Backward Compatibility**: Dual-mode return: if `cursor` or `paginate: true` is omitted, return the bounded array (up to 50 records) or legacy array shape to prevent breaking `PatientsList.tsx` or `Sessions.tsx`.

### 2. Global CBT Sessions History (`api.dashboard.listAllCbtSessions`)
- **Current Behavior**: Hard `.take(50)` without pagination.
- **Ordering**: `timestamp DESC, _id DESC`.
- **Index**: Uses existing `by_userId_and_timestamp` for user-scoped, or table `by_creationTime` / timestamp index.
- **Page Size**: Default `20`, Maximum `50`.
- **Cursor**: Base64 encoded `{ timestamp: number, id: string }`.

### 3. Counselor Requests (`api.dashboard.getCounsellorRequests`)
- **Current Behavior**: Hard `.take(50)` without pagination.
- **Ordering**: `timestamp DESC, _id DESC`.
- **Page Size**: Default `25`, Maximum `50`.
- **Cursor**: Base64 encoded `{ timestamp: number, id: string }`.

### 4. Audit Logs (`api.dashboard.getAuditLogs`)
- **Current Behavior**: Hard `.take(100)` without pagination.
- **Ordering**: `timestamp DESC, _id DESC`.
- **Page Size**: Default `50`, Maximum `100`.
- **Cursor**: Base64 encoded `{ timestamp: number, id: string }`.

---

## 9. Dashboard Compatibility & Frontend Caller Trace

| Frontend Page / Component | Current Hook / Call | Current Expected Return Type | Proposed Pagination Mode | UI Impact & Required UX | Breakage Risk If Unhandled |
|---|---|---|---|---|---|
| `dashboard/src/pages/PatientsList.tsx` | `useQuery(api.users.listPatients, { search })` | `Array<User>` | Infinite Scroll / "Load More" button | Add "Load More Patients" button or page navigation; update count pill from `patients.length` to total or page indicator | **HIGH** if query return shape changes to `{ page, nextCursor }` without dual-mode support |
| `dashboard/src/pages/Sessions.tsx` | `useQuery(api.users.listPatients, {})` | `Array<User>` | Patient Dropdown (Selector) | Dropdown only needs active patients or a searchable input; dual-mode returning direct array keeps it working | **HIGH** if query return shape changes |
| `dashboard/src/pages/Sessions.tsx` | `useQuery(api.dashboard.listAllCbtSessions)` | `Array<CbtSession>` | Paginated Table / "Load More" | Add "Load More Sessions" button | **HIGH** if return shape changes |
| `dashboard/src/pages/CounsellorRequests.tsx` | `useQuery(api.dashboard.getCounsellorRequests)` | `Array<Request>` | Paginated Table / "Load More" | Add "Load More Requests" button | **HIGH** if return shape changes |
| `dashboard/src/pages/AuditLogs.tsx` | `useQuery(api.dashboard.getAuditLogs)` | `Array<AuditLog>` | Paginated Table / "Load More" | Add "Load More Logs" button | **HIGH** if return shape changes |
| `dashboard/src/pages/Overview.tsx` | `useQuery(api.appointments.listAllTwoWayAppointments)` | `Array<Appointment>` | Today's appointments filter | Keep bounded query for today's date or use date index | **MEDIUM** |
| `dashboard/src/pages/PatientDetail.tsx` | `useQuery(api.screening.getAll, { userId })` | `Array<Screening>` | Longitudinal Summary DTO | Keep returning score trajectory DTO, bounded to newest 50 | **LOW** if dual-mode |

---

## 10. Data Privacy Findings

1. **Unrestricted Counselor AI Chat Transcript Viewer (P0 Privacy Violation)**:
   - `convex/dashboard.ts:getPatientAiChatHistoryAdmin` allows any staff member with the `counsellor` or `admin` role to view and search the full, raw text transcripts of **any student in the institution** without any check for an active safety flag.
   - As established in **Priority 10 Step 2 Alignment** (`PRIORITY_10_STEP_2_CLINICAL_PRODUCT_DECISIONS_ALIGNMENT.md`):
     - Ordinary conversational messages with Mitra must remain private.
     - Raw transcripts should only be viewable when a verified safety escalation (`suicideRisk` or active critical alert) has been triggered.
     - Outside of safety escalation, counselors should receive only high-level telemetry (message count, session count, active timestamps).
2. **Mitra Telemetry Table Over-Fetch (`convex/dashboard.ts:getUsersWithAiChats`)**:
   - Collects all messages from `aiCompanionLogs`, `companionMessages`, and `aiMonitoringLogs` to extract the `latestMessageSnippet`. This exposes students' casual conversational text to the counselor overview table.
3. **Screening Responses**:
   - `screeningAttempts` stores raw instrument answers. Counselor queries should expose only structured scores (`phq9_total`, `gad7_total`, `item9_flag`) and severity levels, not question-by-question free text unless clinically necessary.

---

## 11. Priority Classification of Findings

### P0 — Security & Correctness Issues
1. **`P0-AUTH-01`: Authorization-After-Retrieval in `getAlerts` (`convex/dashboard.ts:126`)**:
   - *Current Behavior*: Queries all institutional alerts into server memory before filtering for non-staff students.
   - *Why it is a problem*: Clinical data for all patients is retrieved in a student-invoked query, violating least privilege.
   - *Remediation*: If caller is student, query `.withIndex("by_userId", q => q.eq("userId", callerId))`.
2. **`P0-AUTH-02`: Global Retrieval & Starvation in `getActivityFeed` (`convex/dashboard.ts:242`)**:
   - *Current Behavior*: Takes the top 50 global alerts, emotions, and goals across all students and filters by caller in-memory.
   - *Why it is a problem*: If other students are active, the calling student's activity feed is completely starved.
   - *Remediation*: Query using user-scoped index when caller is a student.
3. **`P0-PRIV-01`: Unrestricted Raw Mitra Chat Transcript Inspection (`convex/dashboard.ts:1043`)**:
   - *Current Behavior*: Allows staff to view full student AI companion conversations at any time.
   - *Why it is a problem*: Violates student confidentiality and Priority 10 privacy contract.
   - *Remediation*: Gate transcript viewing behind active clinical safety alerts (`suicideRisk` / crisis flags).

### P1 — Scalability & Production Issues
1. **`P1-ROSTER-01`: Unbounded Patient Collection in `listPatients` (`convex/users.ts:78`)**:
   - *Current Behavior*: Executes unbounded `.collect()` of all patients, sorts, and filters in memory.
   - *Why it is a problem*: Scales O(N) in memory and database reads. As student population reaches thousands, dashboard timeouts will occur.
   - *Remediation*: Add compound index `users.index("by_role_and_created_at", ["role", "created_at"])`, bounded page retrieval, and deterministic cursor pagination.
2. **`P1-OVERVIEW-01`: Full Table Scans in `getDashboardOverview` (`convex/dashboard.ts:34-70`)**:
   - *Current Behavior*: Full scans of `users`, `triages`, and `alerts` on every dashboard command center load.
   - *Why it is a problem*: Disproportionate database load for basic overview statistics.
   - *Remediation*: Transition overview to rollups (Step 5E) or bounded recent-window queries.
3. **`P1-HIST-01`: Truncated History Without Pagination in `listAllCbtSessions` & `getCounsellorRequests`**:
   - *Current Behavior*: Hard `.take(50)` without pagination.
   - *Why it is a problem*: Clinical sessions older than the 50 most recent are permanently hidden from counselors.
   - *Remediation*: Implement deterministic cursor pagination.

### P2 — Optimization & Maintainability
1. **`P2-ANALYTICS-01`: Multi-Table Patient Detail Over-Collection (`convex/dashboard.ts:getPatientCbtAnalytics`)**:
   - *Current Behavior*: Collects all CBT sessions, JPMR logs, emotion maps, emotion logs, and reframe logs for a patient.
   - *Remediation*: Bound telemetry to 30-day or 90-day analytical windows.
2. **`P2-APPT-01`: In-Memory Filtering After Database Pagination (`convex/appointments.ts:448`)**:
   - *Current Behavior*: Calls `.paginate(args.paginationOpts)` then filters out records without `date && time`.
   - *Remediation*: Ensure incomplete appointments are either indexed or excluded at schema validation.

### P3 — Optional Future Improvements
1. **`P3-SEARCH-01`: Full-Text Search on Patient Directory**:
   - Transition in-memory `String.includes` search in `listPatients` to Convex Search Indexes (`searchIndex`).
2. **`P3-EXPORT-01`: Dedicated Asynchronous Bulk Export Framework**:
   - Implement dedicated action-based PDF/CSV generation instead of browser `window.print()`.

---

## 12. Recommended Step 5D Implementation Sequence

When Step 5D implementation is approved, execute in this strict minimal sequence:

1. **Step 5D.1: Fix Authorization-After-Retrieval (P0)**:
   - Update `convex/dashboard.ts:getAlerts` and `convex/dashboard.ts:getActivityFeed` to query strictly with `by_userId` when the caller is a student, eliminating global table scans and in-memory authorization.
2. **Step 5D.2: Add Compound Roster Index (`convex/schema.ts`)**:
   - Add `.index("by_role_and_created_at", ["role", "created_at"])` to `users` table.
3. **Step 5D.3: Implement Deterministic Cursor Pagination on `listPatients`**:
   - Add `{ cursor, limit, paginate }` arguments to `api.users.listPatients`.
   - Implement dual-mode response for backward compatibility with `PatientsList.tsx` and `Sessions.tsx`.
   - Enforce maximum limit of 50 per page.
4. **Step 5D.4: Implement Cursor Pagination on Counselor History Queries**:
   - Add cursor pagination to `listAllCbtSessions`, `getCounsellorRequests`, and `getAuditLogs`.
5. **Step 5D.5: Update Dashboard Consumers**:
   - Add "Load More" controls to `PatientsList.tsx`, `Sessions.tsx`, `CounsellorRequests.tsx`, and `AuditLogs.tsx`.
6. **Step 5D.6: Verification & Stress Testing**:
   - Add dedicated unit and integration tests (`convex/priority11_step5d.test.ts`) validating roster pagination, search bounding, authorization isolation, and cursor resumption.
   - Full regression suite, TypeScript, and dashboard build verification.

---

## 13. Explicitly Deferred Work

Per project constraints, the following items are strictly excluded from Step 5D:
- **Priority 11 Step 5E**: Institutional analytics rollup tables (`getEnterpriseAnalytics`, daily/weekly rollup tables).
- **Priority 11 Step 5F**: DAU/WAU/MAU aggregation definitions.
- **Priority 11 Step 5G**: Formal performance verification framework and latency benchmarking.
- **Data Retention Policies**: Automated soft-delete cleanup and log archival.
- **New Counselor Assignment / Caseload Architecture**: Emotify currently operates on role-based institutional access; individual caseload mapping is deferred.
- **Clinical Feature Changes**: No changes to screening scoring, triage thresholds, or intervention protocols.

---

## 14. Validation Baseline

Current baseline captured before implementation:
- **Test Suite**: 445 / 445 passing across 23 test suites.
- **TypeScript**: 0 errors.
- **Dashboard Production Build**: 0 errors / clean build.

---

## 15. Final Status

**AUDIT COMPLETE — IMPLEMENTATION PENDING**  
All counselor roster and history queries have been audited. No production code or schema has been modified. Awaiting review before beginning Step 5D implementation.
