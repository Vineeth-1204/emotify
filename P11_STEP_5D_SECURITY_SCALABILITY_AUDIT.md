# P11 Step 5D: Progress & Insights Security + Scalability Hardening Audit

**Document Status:** COMPLETE — READ-ONLY AUDIT  
**Date:** October 3, 2026  
**Auditor:** Antigravity AI Engineering & Security Audit Team  
**Scope:** Progress & Insights (P11 Step 5D), Counselor Roster/History Queries, Dashboard Backend API, Convex Index Verification, Authorization Gateways, and Data Retrieval Boundaries.  
**Production Code Changed:** 0 files (Strict Read-Only Enforcement)

---

## 1. Executive Summary

This audit assesses the backend query architecture, access control mechanisms, and pagination/scalability boundaries across the Emotify backend (`convex/`) and counselor/admin web application (`dashboard/`).

Emotify is an enterprise-grade mental health platform targeted for institutional deployment and Google Play Store release. The student mobile app (React Native/Expo) interacts with an all-TypeScript reactive Convex backend, while counselors and administrators utilize the administrative dashboard. 

The audit evaluated 6 primary areas identified in Step 5D:
1. **Authorization-Before-Retrieval** in dashboard queries (`getAlerts`, `getActivityFeed`, `getNotifications`, `getUsersWithAiChats`).
2. **Student/Patient List Scalability** in `convex/users.ts:listPatients` and search filtering mechanics.
3. **Sessions Selector** bounded retrieval and DOM virtualization in `dashboard/src/pages/Sessions.tsx`.
4. **Counselor History Queries** across CBT sessions, counselor requests, AI logs, and appointments.
5. **Audit Log Ingestion & Querying** (`convex/dashboard.ts:getAuditLogs`).
6. **Authorization Scope & Caseload Mapping Boundaries** within institutional governance.

### Key Audit Findings Summary
- **Critical Security Finding (Notifications)**: `getNotifications` in `convex/dashboard.ts` fetches institutional notifications with `.take(50)` without scoping to the authenticated user's `recipientId`, and `markNotificationRead` allows any authenticated caller to mark any notification as read.
- **Scalability Finding (Patient List In-Memory Search Truncation)**: `listPatients` in `convex/users.ts` paginates correctly via `by_role_and_created_at`, but when a `search` query is provided, it scans only a single batch (`Math.max(limit * 4, 100)`). If a student was created outside the latest 100 registrations, search returns an empty set.
- **Scalability Finding (Staff Alert Full-Table Collection)**: `getAlerts` correctly scopes student callers to their own records before querying, but for staff callers (counselor/admin) it executes three unbounded `.collect()` calls across `alerts`, `users`, and `triages` before slicing in memory.
- **Sessions Selector Verification (PASS)**: The previous concern regarding a 50-item cap on the sessions selector was investigated. The UI now implements a real-time server-side search input backed by `searchPatientSelector`, making the 50-item limit an intentional, healthy UX boundary against DOM bloating rather than an unsearchable hard ceiling.
- **Counselor Caseload Boundary (Documented)**: The current application intentionally operates on an institutional-wide counselor access model. No counselor-to-student caseload or assignment schema exists. This is an intentional product boundary, not an authorization flaw.

---

## 2. Current Query Architecture

The platform's data retrieval architecture bifurcates between student-facing mobile operations and staff-facing administrative workflows:

```
+-----------------------------------------------------------------------------------+
|                                Client Applications                                |
+----------------------------------------+------------------------------------------+
                                         |
            +----------------------------+----------------------------+
            | (Expo Mobile App)                                       | (Vite Web Dashboard)
            v                                                         v
+-----------------------+                                 +-----------------------+
| Student Auth & Ctx    |                                 | Staff Auth & Ctx      |
| (Clerk User Token)    |                                 | (Counselor / Admin)   |
+-----------+-----------+                                 +-----------+-----------+
            |                                                         |
            | ctx.auth.getUserIdentity()                              | ctx.auth.getUserIdentity()
            | identity.subject                                        | db.users.by_clerk_id
            v                                                         v
+-----------------------------------------------------------------------------------+
|                             Convex Query Gateways                                 |
+-----------------------------------------------------------------------------------+
| 1. Student-Scoped Endpoints:                                                      |
|    - alerts.withIndex("by_userId", uid)                                           |
|    - cbtSessions.withIndex("by_userId", uid)                                      |
|    - appointments.withIndex("by_patientId", pid)                                  |
|                                                                                   |
| 2. Staff Endpoints (Role-Gated):                                                  |
|    - caller.role === "admin" || caller.role === "counsellor"                      |
|    - listPatients: Compound cursor (created_at DESC, _id DESC)                    |
|    - listAllCbtSessions: Compound cursor (timestamp DESC, _id DESC)               |
|    - getCounsellorRequests: Compound cursor (created_at DESC, _id DESC)           |
|    - getAuditLogs: Admin-only, compound cursor (timestamp DESC, _id DESC)         |
|    - getAlerts: In-memory join of alerts.collect(), users.collect(), triages...   |
|    - getNotifications: Unscoped take(50) [SECURITY VULNERABILITY]                 |
+-----------------------------------------------------------------------------------+
```

### Ingestion vs. Retrieval Patterns
- **Ingestion**: All mutations append immutable timestamps and user identifiers (`userId`, `clerk_id`, `created_at`).
- **Retrieval**: High-volume tables (`users`, `cbtSessions`, `counsellorRequests`, `auditLogs`) utilize compound cursor pagination combining timestamp ordering with the unique `_id` tie-breaker.
- **Anti-Pattern Identified**: In several functions (`getAlerts`, `getUsersWithAiChats`, `getDashboardOverview`), staff workflows execute `.collect()` on entire tables followed by JavaScript array filtering and sorting.

---

## 3. Authorization-Before-Retrieval Audit

### 3.1 `getAlerts` (`convex/dashboard.ts:40-108`)
- **Student Flow**:
  - Code path: Checks `caller.role !== "admin" && caller.role !== "counsellor"`.
  - Queries: `ctx.db.query("alerts").withIndex("by_userId", (q) => q.eq("userId", caller._id)).order("desc").take(limit)`.
  - **Verdict**: **PASS**. Student identity is resolved first, non-staff status is verified, and database retrieval is strictly bounded to the student's own records. No cross-student data is retrieved or evaluated.
- **Staff Flow**:
  - Code path: Authenticates counselor/admin role before proceeding.
  - Queries:
    ```typescript
    const rawAlerts = await ctx.db.query("alerts").order("desc").collect();
    const users = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "patient")).collect();
    const triages = await ctx.db.query("triages").collect();
    ```
  - **Verdict**: **NEEDS HARDENING (Scalability)**. Authorization is correctly checked *before* data is returned to the client, but the query executes 3 full-table scans. At 10,000 students and 50,000 alerts, this query will exceed Convex execution time limits (10s limit) and read-byte quotas.

### 3.2 `getActivityFeed` (`convex/dashboard.ts:742-832`)
- **Student Flow**:
  - Gated to self: If not staff, returns user's own `aiMonitoringLogs`, `screeningResults`, `cbtSessions`, and `counsellorRequests` via indexed queries (`by_userId`, `by_patientId`).
  - **Verdict**: **PASS**. Fully authorization-scoped.
- **Staff Flow**:
  - Gated to staff: Runs bounded queries:
    - `counsellorRequests.order("desc").take(15)`
    - `cbtSessions.order("desc").take(15)`
    - `screeningResults.order("desc").take(15)`
    - `aiMonitoringLogs.order("desc").take(15)`
  - Joins user metadata via `ctx.db.get(item.userId)`.
  - **Verdict**: **PASS**. Bounded retrieval per table (`take(15)`), total items combined and sliced to 20. Does not scan full tables.

### 3.3 `getNotifications` & `markNotificationRead` (`convex/dashboard.ts:1100-1118`)
- **`getNotifications` Code Inspection**:
  ```typescript
  export const getNotifications = query({
    args: {},
    handler: async (ctx) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) return [];
      return await ctx.db
        .query("notifications")
        .order("desc")
        .take(50);
    },
  });
  ```
- **`markNotificationRead` Code Inspection**:
  ```typescript
  export const markNotificationRead = mutation({
    args: { notificationId: v.id("notifications") },
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Unauthorized");
      await ctx.db.patch(args.notificationId, { read: true });
    },
  });
  ```
- **Vulnerability Analysis**:
  1. The `notifications` schema explicitly defines `recipientId: v.string()` and index `by_recipientId: ["recipientId"]`.
  2. `getNotifications` fails to apply `.withIndex("by_recipientId", q => q.eq("recipientId", identity.subject))` or resolve caller ID.
  3. Any authenticated mobile student receives the latest 50 notifications for *all* students, counselors, and admins across the entire institution.
  4. `markNotificationRead` allows any authenticated user to mutate any notification's `read` status without asserting ownership.
- **Verdict**: **CRITICAL SECURITY VULNERABILITY / NEEDS HARDENING**.

### 3.4 `getUsersWithAiChats` & `getPatientAiChatHistoryAdmin` (`convex/dashboard.ts:1120-1200`)
- **Inspection**:
  - Gated to staff: `caller.role === "admin" || caller.role === "counsellor"`.
  - `getUsersWithAiChats` executes:
    - `ctx.db.query("aiCompanionLogs").collect()`
    - `ctx.db.query("companionMessages").collect()`
    - `ctx.db.query("aiMonitoringLogs").collect()`
    - `ctx.db.query("users").collect()`
  - Privacy consideration: Mitra AI redesign (P10) established student chat privacy boundaries. Chats should only be audited by counselors if an active crisis/safety alert or consent trigger was logged.
- **Verdict**: **NEEDS HARDENING (Scalability & Clinical Privacy Alignment)**.

---

## 4. Student/Patient List Scalability Audit

### 4.1 Query Mechanics (`convex/users.ts:listPatients`)
- **Index**: `by_role_and_created_at: ["role", "created_at"]`.
- **Ordering**: Descending by `created_at` with compound cursor `(created_at, _id)`.
- **Pagination Boundary**: Default limit 25, clamped to maximum 50.
- **Base Pagination**: **PASS**. When browsing without a search query, `listPatients` efficiently fetches `limit + 1` records using index range scans.

### 4.2 Search-Over-Pagination Defect (Scalability & Correctness)
- **Code Inspection** (`convex/users.ts:121-172`):
  ```typescript
  const fetchBatchSize = search ? Math.max(limit * 4, 100) : limit + 1;
  const rawPatients = await query.take(fetchBatchSize);

  let filtered = rawPatients;
  if (search) {
    const q = search.toLowerCase().trim();
    filtered = rawPatients.filter(
      (u) =>
        (u.full_name && u.full_name.toLowerCase().includes(q)) ||
        (u.patientId && u.patientId.toLowerCase().includes(q)) ||
        (u.mobile_number && u.mobile_number.includes(q))
    );
  }
  ```
- **Architectural Flaw**:
  1. The database query only retrieves the top 100 patients ordered by `created_at DESC`.
  2. In-memory string matching (`filter(...)`) is executed only on those 100 rows.
  3. If a patient named "John Doe" registered 6 months ago and is patient #150 in registration order, searching "John" returns `patients: []`.
  4. The pagination cursor returned reflects the 100th raw patient, creating an inconsistent pagination state.
- **Classification**: **SCALABILITY & FUNCTIONAL DEFECT / NEEDS HARDENING**.
- **Remediation Requirement**:
  - Implement a Convex search index `search_patients` on `users` indexing `full_name`, with filter fields `role: "patient"`.
  - Alternatively, route prefix search to `searchPatientSelector` (which indexes or scans specifically for search) or loop bounded batches.

---

## 5. Sessions Selector Audit

### 5.1 Context and Past Concerns
A previous audit raised a flag regarding a Sessions selector arbitrarily capping results at 50 records. We inspected `dashboard/src/pages/Sessions.tsx` and the underlying backend queries to determine whether this was a hard ceiling on selectable patients.

### 5.2 Current Implementation Inspection
- **Frontend Code (`dashboard/src/pages/Sessions.tsx:50-58, 255-276`)**:
  ```tsx
  const [patientSearch, setPatientSearch] = useState("");
  const patientSearchResults = useQuery(
    api.users.searchPatientSelector,
    patientSearch.trim().length >= 1 ? { search: patientSearch.trim(), limit: 50 } : "skip"
  );
  const defaultPatients = useQuery(api.users.listPatients, { limit: 25 });
  ```
- **Backend Code (`convex/users.ts:searchPatientSelector`)**:
  ```typescript
  export const searchPatientSelector = query({
    args: {
      search: v.string(),
      limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
      // Authorization check for staff
      ...
      const limit = Math.min(Math.max(1, args.limit ?? 25), 50);
      // Evaluates search against patient records with early break at limit
    }
  });
  ```
### 5.3 Audit Evaluation
- **Why 50 is used**: HTML `<select>` elements and custom dropdown lists degrade in rendering performance and usability when populated with hundreds or thousands of DOM nodes. Bounding the selector dropdown to 50 results is standard UX practice.
- **Searchability**: The selector is not locked to 50 static patients. When the counselor types a student's name, student ID, or mobile number into the search box, `searchPatientSelector` performs real-time matching and populates the dropdown with the top 50 relevant matches.
- **Verdict**: **PASS / NO ISSUE**. The 50-record limit is an intentional bounded UI safeguard. The underlying architecture provides searchability across the dataset without memory leaks or unbounded DOM rendering.

---

## 6. Counselor History Audit

We audited four historical query patterns accessed by counselors: CBT session history, counselor appointment requests, two-way scheduled appointments, and AI monitoring logs.

| Query Function | Location | Pagination Type | Index Used | Bounded? | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `listAllCbtSessions` | `convex/dashboard.ts` | Compound Cursor `(timestamp, _id)` | `by_timestamp` | Yes (20-50) | **PASS / HARDENED** |
| `getCounsellorRequests` | `convex/dashboard.ts` | Compound Cursor `(created_at, _id)` | `by_created_at` | Yes (25-50) | **PASS / HARDENED** |
| `listAllTwoWayAppointmentsPaginated` | `convex/appointments.ts` | Convex `paginationOpts` | `by_timestamp` | Yes (args.paginationOpts) | **NEEDS HARDENING** (Post-filter) |
| `getAiMonitoringLogs` | `convex/dashboard.ts` | Static `.take(100)` | `by_timestamp` | Yes (100 cap) | **NEEDS HARDENING** (No cursor) |
| `getTwoWayAppointmentsForPatient` | `convex/appointments.ts` | Unbounded `.collect()` | `by_patientId` | No | **NEEDS HARDENING** |

### Detailed Observations:
1. **`listAllTwoWayAppointmentsPaginated` (`convex/appointments.ts:380-410`)**:
   - Uses `ctx.db.query("twoWayAppointments").order("desc").paginate(args.paginationOpts)`.
   - After fetching `results`, it executes:
     `results.page.filter((apt) => apt.date && apt.time && apt.studentName && apt.counselorName)`.
   - Filtering *after* pagination means if 10 out of 20 items in a page are legacy or incomplete records, the UI receives 10 items instead of 20, causing erratic scroll jumping and broken cursor boundaries.
2. **`getCounsellorRequests` Tab Badges (`dashboard/src/pages/CounsellorRequests.tsx:64-68`)**:
   - Badge counts (`pendingCount = requests.filter(r => r.status === "pending").length`) are computed only from the currently loaded page of requests, not total database records. This is a UX limitation, not a security vulnerability.
3. **`getTwoWayAppointmentsForPatient` (`convex/appointments.ts:413-435`)**:
   - Uses `.withIndex("by_patientId", q => q.eq("patientId", args.patientId)).collect()`.
   - For an individual student, appointment counts are clinically bounded (< 50 over a multi-year academic tenure), making `.collect()` acceptable for single-patient views, but unbounded over long histories.

---

## 7. Audit Log Audit

### 7.1 Security & Authorization (`convex/dashboard.ts:getAuditLogs`)
- **Access Control**:
  ```typescript
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return { logs: [], nextCursor: null, hasMore: false };
  const caller = await ctx.db.query("users").withIndex("by_clerk_id", ...).first();
  if (!caller || caller.role !== "admin") {
    return { logs: [], nextCursor: null, hasMore: false };
  }
  ```
- **Audit Verification**:
  - Gated strictly to `admin` role. Counselors and students are completely denied access.
  - Authorization check executes **prior** to any query on the `auditLogs` table.

### 7.2 Scalability & Query Performance
- **Index**: `by_timestamp: ["timestamp"]`.
- **Ordering**: Descending (`order("desc")`) by timestamp with `_id` compound tie-breaker.
- **Pagination Boundary**: Default limit 50, maximum limit clamped to 100.
- **Cursor Serialization**: Base64 opaque cursor containing `[lastTimestamp, lastId]`.
- **UI Integration (`dashboard/src/pages/AuditLogs.tsx`)**: Integrates clean `Load More` button appending batches without resetting table state.
- **Verdict**: **PASS / HARDENED**.

---

## 8. Relevant Convex Indexes

Verification of indexes declared in `convex/schema.ts` against query access patterns:

| Table | Index Name | Indexed Fields | Status | Query Coverage / Gaps |
| :--- | :--- | :--- | :--- | :--- |
| `users` | `by_role` | `["role"]` | Active | Used by `listPatients`, but misses compound created_at |
| `users` | `by_role_and_created_at`| `["role", "created_at"]` | Active | **Optimized**: Backs cursor pagination for patient list |
| `users` | `by_clerk_id` | `["clerk_id"]` | Active | Primary auth lookup |
| `users` | `search_students` | N/A | **MISSING** | Text search currently scans top 100 rows in memory |
| `alerts` | `by_userId` | `["userId"]` | Active | Backs student-scoped alert queries |
| `alerts` | `by_resolved` | `["resolved"]` | Active | Available, but `getAlerts` currently uses `.collect()` |
| `alerts` | `by_timestamp` | `["timestamp"]` | Active | Backs chronological retrieval |
| `notifications` | `by_recipientId` | `["recipientId"]` | Active | **UNUSED IN QUERY**: `getNotifications` neglects this index! |
| `notifications` | `by_read` | `["read"]` | Active | Unused in query |
| `cbtSessions` | `by_timestamp` | `["timestamp"]` | Active | Backs counselor session history pagination |
| `cbtSessions` | `by_userId` | `["userId"]` | Active | Backs student session history |
| `counsellorRequests`| `by_created_at` | `["created_at"]` | Active | Backs counselor request queue pagination |
| `counsellorRequests`| `by_status` | `["status"]` | Active | Backs status filtering |
| `auditLogs` | `by_timestamp` | `["timestamp"]` | Active | Backs admin audit log pagination |
| `twoWayAppointments`| `by_timestamp` | `["timestamp"]` | Active | Backs appointment timeline pagination |

---

## 9. Pagination Architecture

The platform exhibits two distinct pagination styles:

### 9.1 Compound Opaque Base64 Cursor Pattern (Custom Emotify Architecture)
- **Used by**: `listPatients`, `listAllCbtSessions`, `getCounsellorRequests`, `getAuditLogs`.
- **Structure**:
  ```typescript
  // Encoded cursor: base64(JSON.stringify([timestampOrCreatedAt, _id]))
  // Range query:
  .filter((q) =>
    q.or(
      q.lt(q.field("timestamp"), cursorTimestamp),
      q.and(
        q.eq(q.field("timestamp"), cursorTimestamp),
        q.lt(q.field("_id"), cursorId)
      )
    )
  )
  ```
- **Strengths**: Stable ordering, immune to pagination drift when new records are inserted at the top of the table; stateless across client requests.
- **Weaknesses**: When post-query memory filtering is applied (e.g. search string filtering), cursor position advances past unfiltered items, producing incomplete pages.

### 9.2 Convex Native `paginate(paginationOpts)` Pattern
- **Used by**: `listAllTwoWayAppointmentsPaginated`.
- **Structure**: Uses Convex runtime pagination cursors (`continueCursor`).
- **Strengths**: Fully managed by Convex platform, native reactive subscriptions per page.
- **Weaknesses**: Any post-fetch `.filter()` call distorts page sizes and breaks continuous cursor progression unless handled using Convex schema validation or filtered queries.

---

## 10. Audit Findings & Classifications

Each finding is classified according to the mandatory audit standards:

### [FINDING-01] Notification Data Leakage & Unbounded Retrieval
- **Classification**: **NEEDS HARDENING** (Actual Security Vulnerability + Scalability Concern).
- **Detail**: `getNotifications` in `convex/dashboard.ts` returns the latest 50 notifications platform-wide without filtering by `recipientId`. Any logged-in student or staff member can read private notifications of other users. `markNotificationRead` has no ownership assertion.
- **Impact**: Cross-user data leakage violating student privacy and FERPA/HIPAA-aligned data boundaries.

### [FINDING-02] Patient List Search Truncation on Scaled Datasets
- **Classification**: **NEEDS HARDENING** (Scalability & Functional Correctness Concern).
- **Detail**: `listPatients` in `convex/users.ts` applies `search` filtering *after* taking only 100 records from the database. Students created beyond the 100 most recent records cannot be found via search.
- **Impact**: As the student body scales into thousands, counselors cannot find older patients from the main patients list.

### [FINDING-03] Full-Table In-Memory Collection in Staff Alert Center
- **Classification**: **NEEDS HARDENING** (Scalability Concern).
- **Detail**: `getAlerts` performs `.collect()` on `alerts`, `users`, and `triages` before sorting and slicing in memory when queried by staff.
- **Impact**: Will trigger query timeout exceptions and high bandwidth billing once alerts exceed several thousand documents. (Note: Student alert queries are already hardened and bounded).

### [FINDING-04] Full-Table Collection in AI Chat Monitoring
- **Classification**: **NEEDS HARDENING** (Scalability + Clinical Privacy Alignment).
- **Detail**: `getUsersWithAiChats` performs `.collect()` across `aiCompanionLogs`, `companionMessages`, `aiMonitoringLogs`, and `users`. It also allows counselors to view raw student AI companion transcripts without a documented safety triage breach.
- **Impact**: High memory usage and friction with P10 student privacy guardrails.

### [FINDING-05] Sessions Selector 50-Item Bound
- **Classification**: **NO ISSUE** / **PASS**.
- **Detail**: The 50-item limit in `Sessions.tsx` is an intentional DOM protection boundary backed by real-time server-side search (`searchPatientSelector`).
- **Impact**: None. Provides optimal UX and prevents browser memory degradation.

### [FINDING-06] Counselor History Bounded Pagination
- **Classification**: **PASS**.
- **Detail**: `listAllCbtSessions` and `getCounsellorRequests` implement robust compound cursor pagination with limits clamped between 20 and 50 records.
- **Impact**: Fully scalable across large institutional datasets.

### [FINDING-07] Audit Log Ingestion & Role Gating
- **Classification**: **PASS**.
- **Detail**: Gated strictly to `admin` before querying. Uses index `by_timestamp`, compound cursor pagination, and bounded limits (max 100).
- **Impact**: Complies with institutional auditability standards without scalability bottlenecks.

### [FINDING-08] Counselor Caseload / Assignment Architecture
- **Classification**: **BLOCKED BY MISSING ARCHITECTURE** (Intentional Product Boundary).
- **Detail**: Counselors currently have institutional-wide access to all student clinical summaries. There is no counselor assignment schema (e.g. `counselorAssignments` mapping specific students to specific counselors).
- **Impact**: This is the current intentional product model for Track G / Emotify institutional pilot. Caseload scoping cannot be implemented without defining a new assignment and roster data architecture.

---

## 11. Recommended Changes

### Recommended Change 1: Scope Notifications to Recipient
- In `convex/dashboard.ts:getNotifications`:
  1. Resolve caller user ID from `identity.subject`.
  2. Query `notifications.withIndex("by_recipientId", q => q.eq("recipientId", caller.patientId || caller._id || identity.subject))`.
  3. In `markNotificationRead`, assert caller ownership or admin role before applying `ctx.db.patch`.

### Recommended Change 2: Resolve Patient Search Scalability
- In `convex/users.ts`:
  1. For `listPatients`, if `search` is provided, redirect execution to a search-optimized query or utilize a Convex search index `withSearchIndex("search_students", q => q.search("full_name", search).eq("role", "patient"))`.
  2. Maintain cursor pagination for the default (unfiltered) roster.

### Recommended Change 3: Bound Staff Alerts Retrieval
- In `convex/dashboard.ts:getAlerts`:
  1. Replace `ctx.db.query("alerts").order("desc").collect()` with indexed range queries or bounded pagination: `take(limit * 2)`.
  2. Fetch user metadata individually via `ctx.db.get` or batch map by ID instead of collecting all users in the database.

### Recommended Change 4: Sanitize Appointment Pagination
- In `convex/appointments.ts:listAllTwoWayAppointmentsPaginated`:
  1. Remove in-memory `.filter()` on `results.page`.
  2. Ensure data sanitization occurs at insertion or handle missing legacy fields gracefully on the frontend.

---

## 12. Files That Would Need Modification (During Implementation)

*(Note: No files have been modified during this audit phase)*

1. `convex/dashboard.ts`
   - Scope `getNotifications` and `markNotificationRead` by caller identity.
   - Refactor staff `getAlerts` to eliminate `alerts.collect()` and `users.collect()`.
   - Bound `getUsersWithAiChats` and add safety-trigger requirement.
2. `convex/users.ts`
   - Refactor `listPatients` search mechanism to prevent 100-record truncation.
3. `convex/appointments.ts`
   - Remove destructive post-pagination filtering in `listAllTwoWayAppointmentsPaginated`.
4. `convex/schema.ts`
   - Add search index `search_students` on `users` table if search index approach is selected.

---

## 13. Files That Must NOT Be Modified

To preserve clinical, visual, and architectural integrity, the following files MUST remain untouched:

- `dashboard/src/layouts/*` (Dashboard visual layout and Track G navigation)
- `dashboard/src/pages/Overview.tsx`, `AlertsCenter.tsx`, `PatientDetail.tsx` (Visual redesign forbidden)
- `common/emotionTaxonomy.ts`, `common/emotionRouting.ts` (Phase 1-3A emotion engine)
- `convex/screening.ts`, `convex/clinicalTimeline.ts` (Clinical scoring for PHQ-9, GAD-7, PQ-16)
- `convex/companion.ts`, `app/(auth)/tools/companion.tsx` (P10 Mitra AI boundaries)
- `app/(auth)/tools/breathing.tsx`, `grounding.tsx`, `reframe.tsx`, `jpmr.tsx` (P9 CBT interventions)
- Any file implementing WSAS or ReQoL-10 (Strictly prohibited by product boundaries)

---

## 14. Test Plan (For Future Implementation Step)

When Step 5D moves to implementation, the following tests must be executed to certify correctness:

1. **Security & Authorization Test Suite (`convex/security_step5d.test.ts`)**:
   - Verify unauthenticated caller receives empty or error on `getNotifications`.
   - Verify Student A cannot see Student B's notifications in `getNotifications`.
   - Verify Student A cannot mark Student B's notification as read via `markNotificationRead`.
   - Verify non-admin caller receives empty array on `getAuditLogs`.
   - Verify student caller on `getAlerts` receives only their own alerts.
2. **Scalability & Search Pagination Test Suite**:
   - Seed database with 200 patients where Patient #195 has name "Target Student".
   - Execute `listPatients({ search: "Target Student" })` and assert student is returned.
   - Verify compound cursor progression produces sequential, non-overlapping pages across 100+ CBT sessions.
3. **Regression Validation**:
   - Run full existing test suite (`npm test`) to maintain 569/569 baseline passing tests.
   - Run `tsc --noEmit` on backend and dashboard.
   - Run `npm run build` on `dashboard/` to verify zero build regressions.

---

## 15. Risk Assessment

| Risk Category | Severity | Likelihood | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **Notification Privacy Leak** | **HIGH** | **HIGH** | Immediate targeted patch in `convex/dashboard.ts` using `by_recipientId` index. |
| **Alerts Query Timeout** | **MEDIUM** | **HIGH** (at scale) | Transition from `.collect()` to bounded pagination before pilot deployment with > 500 students. |
| **Patient List Search Blindspot** | **MEDIUM** | **HIGH** (at scale) | Introduce Convex search index for student names/IDs. |
| **Accidental Dashboard UI Breakage** | **HIGH** | **LOW** | Strict prohibition on changing component layouts, CSS tokens, or Track G clinical terminology. |
| **Clinical Timeline Semantic Drift** | **CRITICAL**| **NONE** | No clinical scoring formulas or triage severity thresholds are touched by Step 5D. |

---

## Conclusion & Next Steps

This audit confirms that the core pagination infrastructure for CBT sessions, counselor requests, and audit logs is robust, bounded, and properly indexed. 

However, critical security hardening is urgently required for **notifications**, and scalability refactoring is necessary for **staff alert retrieval** and **patient roster searching** before production deployment.

**Status:** AUDIT COMPLETE — IMPLEMENTATION PENDING USER REVIEW  
**Production Code Changes in this Pass:** 0 files.
