# P14 Step 1 — Comprehensive Security Audit

**Document Status:** COMPLETE & VERIFIED  
**Audit Mode:** READ-ONLY (No code, schema, or test changes applied)  
**Baseline Test Status:** 706/706 tests passing (42 test files), TypeScript clean, Dashboard build clean  
**Target Repository:** Emotify (`d:\Projects\EmotifyApp\Emotify-Clerk`)  
**Date:** October 3, 2026  

---

## 1. Executive Summary

This report establishes the authoritative security, authorization, privacy, and integrity posture of the Emotify codebase following the successful completion of Priorities P1 through P12. 

The audit traced actual application pathways spanning Mobile (`app/`), Dashboard (`dashboard/`), Shared Business Logic (`common/`), and Convex Backend Functions (`convex/`). 

### Core Audit Takeaways:
1. **Strong Core Clinical Security in P1–P12 Endpoints:** The primary clinical pipelines developed and hardened during Priorities P3, P4, P5, P8, P9, P11, and P12 demonstrate exemplary security practices. Specifically, `screening.submitScreeningAttempt`, `counsellorRequests.create`, `appointments.createAppointment`, `appointments.createAppointmentRequest`, `followUps.create`, and `timeline.getTimelineEvents` enforce strict server-authoritative identity, assert ownership boundaries (`assertCanAccessStudent`), validate multi-document provenance chains, and prevent client-side score forgery.
2. **Critical Vulnerabilities in Unprotected Utility & Legacy Endpoints:** Several legacy or setup endpoints in `convex/cbt.ts`, `convex/users.ts`, and `convex/screening.ts` lack authentication or ownership verification. Most critically:
   - **Gemini API Key Exfiltration & Overwrite (P0):** `cbt.getActiveApiKey` exposes the production Gemini API key in plain text to unauthenticated callers, and `cbt.insertApiKey` allows anonymous callers to overwrite or wipe it.
   - **Admin Account Takeover (P0):** `users.resetAdminCredentials` allows an anonymous caller on the public internet to reset an administrator's password without credentials, session, or OTP.
   - **Unauthenticated Profile Overwrite (P0):** `users.completeOnboarding` allows an unauthenticated caller to overwrite any student's emergency contact, consent, and profile attributes.
   - **Unauthenticated Legacy Screening Forgery (P0):** `screening.submitScreening` permits unauthenticated callers to inject forged clinical depression/anxiety scores for any user.
3. **AI Companion Privacy & Unbounded Query Risk (P1):** While the clinical timeline properly isolates AI conversations from counselors, `dashboard.getUsersWithAiChats` and `dashboard.getPatientAiChatHistoryAdmin` return full raw conversational transcripts to any counselor, and perform unbounded table scans (`.collect()`) across `aiCompanionLogs`, `companionMessages`, and `aiMonitoringLogs`.
4. **Data Retention & Cascade Gap (P1):** `users.deleteUser` comprehensively cascades deletions across 28 database tables, but omits `breathingLogs` and `groundingLogs` (introduced in P9), leaving orphaned somatic clinical data.

All findings are documented below with exact file paths, line numbers, exploit scenarios, and remediation plans for P14 Step 2.

---

## 2. Scope & Boundaries

- **In Scope:**
  - All Convex backend functions (`convex/`), schemas (`convex/schema.ts`), and authorization helpers (`convex/authz.ts`).
  - Mobile authentication, session storage (`utils/auth.tsx`), and route protection (`app/_layout.tsx`).
  - Staff dashboard authentication (`dashboard/src/components/AuthContext.tsx`), route guards (`dashboard/src/App.tsx`), and data fetching.
  - Clinical data access controls (PHQ-9, GAD-7, PQ-16, triage, alerts, counselor requests, appointments, follow-ups, timeline).
  - AI Companion / Mitra APIs, prompt construction, and monitoring queries.
  - Configuration, environment files (`.env*`, `app.json`), secrets, and rate limiters.
- **Out of Scope (Explicit Boundaries):**
  - **No code modifications:** Audit is strictly read-only.
  - **No schema or migration changes:** Schema modifications are deferred to remediation phases.
  - **P10 Mitra AI Rework:** Remains BLOCKED pending clinical/product review. No conversational architecture or crisis intervention logic is redesigned.
  - **WSAS / ReQoL:** Confirmed NOT part of this product; remaining legacy references are audited for informational awareness only.

---

## 3. Architecture Reviewed

Emotify operates as a hybrid mobile/web application backed by Convex:
- **Mobile Client:** React Native (Expo) app using `expo-router` with route guards in `app/_layout.tsx`. Manages user sessions via `expo-secure-store`, supports optional biometric authentication (`expo-local-authentication`), and communicates with Convex via `ConvexProviderWithAuth`.
- **Counselor/Admin Dashboard:** React/Vite SPA hosted under `dashboard/`. Uses `dashboard_token` stored in `localStorage` and wraps components with `ConvexProviderWithAuth`.
- **Backend Platform:** Convex deployment providing reactive document storage, server functions (queries, mutations, actions), and scheduled tasks.
- **Authentication Hierarchy:**
  - `users._id`: The canonical, immutable document ID for all database foreign keys and relations.
  - `clerkId`: Legacy external identifier retained for backward compatibility with existing tests and legacy sessions.
  - `patientId`: Human-facing clinical identifier (e.g. `PAT-XXXXXX`) used on staff dashboards.

---

## 4. Authentication Audit

### 4.1 Login & Registration
- **Student Registration (`convex/users.register`):**
  - Validates `full_name`, `mobile_number`, `password` (minimum 6 characters), and optional `email`.
  - Normalizes mobile numbers to 10 digits (`sanitizeMobile`).
  - Enforces uniqueness via the `by_mobile_number` index (`users.ts:384-387`).
  - Hashes passwords using SHA-256 (`hashPassword`).
  - **Role Hardening:** Forces `role: "student"` on creation (`users.ts:420`). Callers cannot supply or elevate to `counsellor` or `admin` during registration.
- **Student/Staff Login (`convex/users.login`):**
  - Validates credentials against hashed passwords (`users.ts:983-987`).
  - Verifies account status is active (`status === "active"`, rejecting suspended/deactivated accounts at `users.ts:976-979`).
  - Generates a signed session token containing `userId`, `role`, and expiration (`users.ts:994-1002`).
  - Records active session in the `sessions` table with an expiration timestamp (`users.ts:1004-1014`).

### 4.2 Session Validation & Persistence
- **Mobile (`utils/auth.tsx`):**
  - Persists `mobile_token` and `mobile_user` in `SecureStore`.
  - On app launch, calls `users.validateSession` with the stored token (`utils/auth.tsx:65`).
  - Regularly checks session validity via `users.checkSessionActive` query (`app/_layout.tsx:35-44`); if expired or deactivated, forces logout and cleans `SecureStore`.
- **Dashboard (`dashboard/src/components/AuthContext.tsx`):**
  - Stores `dashboard_token` in `localStorage`.
  - Validates session with backend on load (`users.validateSession`).
  - Enforces `data.user.role === "admin" || data.user.role === "counsellor"` before allowing dashboard entry.

### 4.3 Vulnerabilities in Authentication & Credentials
- **VULNERABILITY [EMOT-SEC-01] (P0): Unauthenticated Admin Credential Reset (`convex/users.ts:811-852`):**
  `users.resetAdminCredentials` is an exported, public mutation with NO authentication checks. It accepts `{ currentMobile, newMobile, newPassword }`. It queries the `users` table for an admin matching `currentMobile` and immediately updates their password hash without requiring an existing session, old password, or OTP. An attacker knowing the admin's phone number can completely hijack administrator access.
- **VULNERABILITY [EMOT-SEC-02] (P1): Default Admin Seeding Mutation (`convex/users.ts:778-808`):**
  `users.seedAdmin` is a public mutation that creates an admin account with default mobile `1234567890` and known password `adminpassword`. Although it checks if an admin with that mobile already exists, if deleted or modified, anyone on the internet can re-seed default admin credentials.
- **VULNERABILITY [EMOT-SEC-03] (P2): Cryptographically Weak Biometric Session Token (`convex/users.ts:1037-1041`):**
  `generateBiometricToken` uses `Math.random().toString(36)` rather than CSPRNG (`crypto.getRandomValues`). Furthermore, `biometricLogin` (`users.ts:1052-1088`) performs an unindexed table scan filter across all users.

---

## 5. Authorization / RBAC Audit

### 5.1 Authorization Framework (`convex/authz.ts`)
The authorization helper module provides three foundational security predicates:
1. `getAuthenticatedUser(ctx)`: Resolves the canonical `users` document from `ctx.auth.getUserIdentity()`. Checks `ctx.db.get(identity.subject as Id<"users">)` first, then falls back to `by_clerkId`.
2. `requireCounselorOrAdmin(ctx)`: Ensures caller is authenticated and holds `role === "counsellor"` or `role === "admin"`.
3. `assertCanAccessStudent(ctx, studentUserId)`:
   - If caller is a student, asserts `studentUserId === identity.subject || studentUserId === caller._id || studentUserId === caller.clerkId`.
   - If caller is a counselor/admin, permits access across student records for institutional care.
   - Throws `Unauthorized` if a student attempts cross-student access.

### 5.2 Authorization Matrix

| Domain / Resource | Student | Counselor | Admin | Unauthenticated | Auth Check Location |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **User Profile (Read)** | Own record only | All Students | All Students | **VULNERABLE (EMOT-SEC-06)** | `users.getByClerkId`, `users.getUserById` |
| **User Profile (Update)** | Own record only | Edit assigned | Full edit | **VULNERABLE (EMOT-SEC-04)** | `users.updateUser`, `completeOnboarding` |
| **Screening Attempt (Submit)** | Own identity only | Staff-assisted | Staff-assisted | Blocked | `screening.submitScreeningAttempt` |
| **Legacy Screening (Submit)**| Any student | Any student | Any student | **VULNERABLE (EMOT-SEC-05)** | `screening.submitScreening` |
| **Screening Results (Read)** | Own results only | All Students | All Students | Blocked | `screening.getLatestAttempt`, `getAll` |
| **Clinical Triage (Read)** | Own triage only | All Students | All Students | Blocked | `triage.getLatest`, `getLatestByUserId` |
| **Clinical Triage (Override)**| Blocked | Permitted | Permitted | Blocked | `triage.unblockPatient` |
| **Safety Alerts (Read)** | Own alerts only | All Students | All Students | Blocked | `alerts.getPending`, `dashboard.getAlerts` |
| **Safety Alerts (Acknowledge)**| Blocked | Permitted | Permitted | Blocked | `alerts.acknowledgeAlert` |
| **Counselor Request (Create)**| Own request only | Staff request | Staff request | Blocked | `counsellorRequests.create` |
| **Counselor Request (Update)**| Blocked | Permitted | Permitted | Blocked | `counsellorRequests.updateStatus` |
| **Appointments (Request)** | Own request only | For student | For student | Blocked | `appointments.createAppointmentRequest` |
| **Appointments (Manage)** | Cancel own only | Schedule/Accept/Reject | Full control | Blocked | `appointments.createAppointment`, etc. |
| **Follow-Ups (Manage)** | View own only | Create/Update/Complete | Full control | Blocked | `followUps.create`, `markComplete` |
| **Clinical Timeline (Read)** | Own timeline only| All Students | All Students | Blocked | `timeline.getTimelineEvents` |
| **CBT / JPMR / Grounding** | Own logs only | Read analytics | Read analytics | Blocked | `cbt.logSession`, `jpmr.ts`, `grounding.ts` |
| **AI Companion Chat (Read)** | Own chat only | **VULNERABLE (EMOT-SEC-07)** | View transcripts | Blocked | `dashboard.getPatientAiChatHistoryAdmin` |
| **Gemini API Key (Read/Write)**| Blocked | Blocked | Should be Admin | **VULNERABLE (EMOT-SEC-08)** | `cbt.getActiveApiKey`, `cbt.insertApiKey` |

---

## 6. Canonical Identity Audit

### 6.1 Identity Resolution Chain
The canonical hierarchy is strictly defined as:
```
users._id (Canonical internal identity & foreign key)
    ↓
clerkId (External/legacy fallback identifier)
    ↓
patientId (Human-facing display code: PAT-XXXXXX)
```

### 6.2 Audit Findings on Identity Resolution
- **Protected Mutations (P12 & P4 hardened):** Endpoints such as `appointments.createAppointmentRequest`, `counsellorRequests.create`, and `screening.submitScreeningAttempt` correctly derive the student identity from `ctx.auth.getUserIdentity().subject` and resolve `caller._id`. If a client supplies a custom `userId`, the server asserts that `caller.role === 'admin' || caller.role === 'counsellor'`.
- **Identity Fallback Normalization:** Throughout `screening.ts`, `timeline.ts`, `alerts.ts`, and `appointments.ts`, search sets dynamically assemble `[targetUserId, user._id, user.clerkId]` to prevent student data fragmentation caused by legacy migrations.
- **VULNERABILITY [EMOT-SEC-04] (P0): Identity Bypass in `completeOnboarding` (`convex/users.ts:620-711`):**
  When `completeOnboarding` is invoked, it checks `if (!user && args.userId)`. If the caller provides no auth token, it falls back to trusting `args.userId` as the target user. An unauthenticated caller can overwrite profile attributes, department, campus, and emergency contact details for any target user in the system.

---

## 7. Clinical Data Privacy Audit

### 7.1 Sensitive Instrument Isolation (PHQ-9, GAD-7, PQ-16)
- **Item-Level Protection:** Full item-level responses are stored in `screeningAttempts.responses`.
- **Access Control:** All screening queries (`getLatestAttempt`, `getScreeningHistory`, `getAttemptById`, `getAll`) invoke `await assertCanAccessStudent(ctx, targetUserId)`. Students cannot access another student's raw responses or summary scores.
- **Suicide & Psychosis Flag Exposure:** Flagged records generate alerts with causal triage links. Only authorized staff and the student themselves can query these triage documents.

### 7.2 Clinical Timeline Isolation
- `convex/timeline.ts` aggregates clinical milestones (screenings, triages, alerts, appointments, follow-ups, and intervention logs).
- Access is strictly guarded by `await assertCanAccessStudent(ctx, targetUserId)` at line 204.
- **Zero Cross-Student Leakage:** A student querying `getTimelineEvents` receives only their own normalized events.
- **Clinical Slide-Outs:** Clinical metadata in timeline events is sanitized for clinician viewing.

---

## 8. Mitra / AI Privacy Audit

### 8.1 Current Implementation State
Priority 10 remains **BLOCKED**. No autonomous agentic behavior, conversational triage, or crisis escalation re-architecture has been added.

### 8.2 Audit of Existing Mitra Functions (`convex/companion.ts`, `convex/cbt.ts`, `convex/dashboard.ts`)
1. **Raw Conversations in Clinical Timeline:** Audited `convex/timeline.ts`. The timeline queries `screeningAttempts`, `triages`, `alerts`, `counsellorRequests`, `appointments`, `followUps`, `cbtSessions`, `jpmrLogs`, `reframeLogs`, `microGoals`, `clinicalTimelines`, `aiMonitoringLogs`, `breathingLogs`, `groundingLogs`, `emotionLogs`, `dailyCheckins`, and `emotionMaps`. It **does NOT** query `aiCompanionLogs` or `companionMessages`. Raw chat conversations are properly excluded from the clinical timeline.
2. **VULNERABILITY [EMOT-SEC-07] (P1): Raw Chat Exposure to Counselors (`convex/dashboard.ts:1311-1528`):**
   - `getUsersWithAiChats` and `getPatientAiChatHistoryAdmin` allow any user with `role === "counsellor"` to view students' verbatim conversational transcripts and prompts.
   - Clinical privacy standards require that peer/AI companion chats remain private to the student unless a critical safety alert is triggered. Returning full transcripts directly to counselors creates an institutional privacy violation.
3. **VULNERABILITY [EMOT-SEC-08] (P0): Plaintext Gemini API Key Exposure (`convex/cbt.ts:33-58`):**
   - `getActiveApiKey`: Exported Convex query with ZERO authentication. Returns `{ apiKey: active.key, model: active.model }` from the `apiKeys` table directly to any unauthenticated caller on the public internet.
   - `insertApiKey`: Exported Convex mutation with ZERO authentication. Allows any caller on the public internet to insert, update, or deactivate the system-wide active Gemini API key.
4. **Student Session Scoping:** In `companion.ts:getMessages` and `clearHistory`, access is restricted to the authenticated user's ID. However, in `companion.ts:logMessage`, if the caller is unauthenticated, passing `args.userId` permits unauthenticated message injection into another student's chat log.

---

## 9. Mutation Ownership Audit

Every sensitive mutation across the backend was reviewed for:
1. Caller authorization & authentication.
2. Record target validation.
3. Ownership enforcement.
4. Terminal state modification prevention.

### Detailed Mutation Review:
- **`screening.submitScreeningAttempt` (`convex/screening.ts:21`):** SECURE. Derives caller from `ctx.auth.getUserIdentity()`. Non-self `args.userId` requires staff permissions. Validates all item responses. Authoritative scoring on server.
- **`screening.submitScreening` (`convex/screening.ts:269`):** **VULNERABLE (EMOT-SEC-05)**. Legacy endpoint allows unauthenticated callers to pass `args.userId` and insert fraudulent screening scores.
- **`triage.processTriage` (`convex/triage.ts:7`):** Requires authentication (`ctx.auth.getUserIdentity()`). Derives `userId = identity.subject`.
- **`triage.unblockPatient` (`convex/triage.ts:173`):** SECURE. Enforces `requireCounselorOrAdmin(ctx)`. Resolves pending alerts and logs to `auditLogs`.
- **`counsellorRequests.create` (`convex/counsellorRequests.ts:6`):** SECURE. Enforces caller identity. Validates attemptId and triageId provenance. Enforces duplicate active request prevention.
- **`counsellorRequests.updateStatus` (`convex/counsellorRequests.ts:122`):** SECURE. Enforces `requireCounselorOrAdmin(ctx)`. Dispatches notification to student.
- **`appointments.createAppointment` (`convex/appointments.ts:83`):** SECURE. Restricts to staff (`admin`/`counsellor`). Enforces session duration limits (max 4h) and slot overlap conflict detection. Validates provenance.
- **`appointments.createAppointmentRequest` (`convex/appointments.ts:375`):** SECURE. Enforces student caller ownership or staff role. Enforces single-active-request constraint.
- **`appointments.updateAppointmentStatus` (`convex/appointments.ts:456`):** SECURE. Restricts accept/reject/cancel transitions based on caller role. Terminal states (`cancelled`, `completed`) are protected against invalid transitions.
- **`followUps.create` (`convex/followUps.ts:6`):** SECURE. Requires counselor/admin. Enforces student existence. Validates optional `appointmentId` and `counsellorRequestId` provenance against the same student.
- **`followUps.markComplete` (`convex/followUps.ts:339`):** SECURE. Requires counselor/admin. Enforces terminal status (`completed` cannot be re-completed).
- **`users.updateUser` (`convex/users.ts:553`):** SECURE. Requires counselor/admin (`requireCounselorOrAdmin`). Students cannot alter administrative fields.
- **`users.completeOnboarding` (`convex/users.ts:620`):** **VULNERABLE (EMOT-SEC-04)**. Unauthenticated fallback trusts `args.userId`.
- **`users.toggleBiometric` & `markScreeningComplete` (`convex/users.ts:734-775`):** **VULNERABLE (EMOT-SEC-09)**. Public mutations with zero authentication checks that mutate arbitrary user records.

---

## 10. Provenance & Referential Integrity Audit

The clinical care provenance chain hardened in P4 and P12:
```
screeningAttempt (screeningAttempts._id)
       ↓
     triage (triages._id)
       ↓
counsellorRequest (counsellorRequests._id)
       ↓
  appointment (appointments._id)
       ↓
   followUp (followUps._id)
```

### Referential Integrity Verification:
1. **Screening → Triage:** When `submitScreeningAttempt` evaluates triage, the `triages` record stores `attemptId`. The originating attempt records `triageId`.
2. **Triage → Counselor Request:** When creating a counselor request via `counsellorRequests.create`, optional `attemptId` and `triageId` are verified:
   - Target documents must exist (`ctx.db.get`).
   - Target documents must belong to the same student (`searchIds.has(attempt.userId)`). Forged cross-student references throw `Error("Invalid provenance: ... does not belong to this student.")`.
3. **Counselor Request → Appointment:** In `appointments.createAppointment` and `appointments.createAppointmentRequest`, `validateCounsellorRequestProvenance` asserts:
   - Counselor request exists.
   - Belongs to the same patient (`request.user_id === studentId`).
4. **Appointment → Follow-Up:** In `followUps.create`, if `appointmentId` is provided:
   - Appointment must exist.
   - Appointment `userId` must match the follow-up's target student.
5. **CBT Sessions & Interventions:** `cbtSessions` and `reframeLogs` link to `userId`. No forgeable cross-student foreign keys detected.

---

## 11. Notification Security Audit

### Notification Pathways Audited (`convex/dashboard.ts`, `counsellorRequests.ts`, `appointments.ts`, `followUps.ts`):
- **Server-Side Recipient Derivation:** All notification creation occurs via internal backend mutations triggered by state transitions (e.g. appointment scheduled, counselor request submitted, follow-up created).
- **No Arbitrary Recipient Parameter:** There is no generic public mutation allowing a student to pass `recipientId` and send spam or spoofed notifications to other students or staff.
- **Recipient-Scoped Retrieval (`convex/dashboard.ts:1104-1153`):**
  - `getNotifications` builds `searchRecipientIds` strictly from `identity.subject`, `caller._id`, `caller.clerkId`, and `caller.patientId`.
  - A user can only view notifications where they are the designated recipient.
- **Ownership-Scoped Modification (`convex/dashboard.ts:1155-1190`):**
  - `markNotificationRead` fetches the target notification and verifies `validRecipientIds.has(notification.recipientId)`.
  - An unauthorized caller attempting to mark another user's notification as read receives `Error("Unauthorized: Cannot mark another user's notification as read")`.
- **Sensitive Content Check:** Notifications contain generic informational titles and summaries (e.g. "Appointment Scheduled", "Counselor Request Update"). They **do not** embed sensitive item responses, suicide risk scores, or diagnostic codes.

---

## 12. User Deletion / Data Retention Audit

### Cascade Verification in `convex/users.deleteUser` (`convex/users.ts:1235-1516`):
The `deleteUser` mutation requires `requireAdmin(ctx)`. It initiates a 28-table cascade deletion to comply with data privacy and right-to-be-forgotten obligations.

**Tables currently cascaded:**
1. `users`
2. `screenings`
3. `screeningAttempts`
4. `triages`
5. `alerts`
6. `cbtSessions`
7. `jpmrLogs`
8. `reframeLogs`
9. `microGoals`
10. `clinicalTimelines`
11. `aiMonitoringLogs`
12. `aiCompanionLogs`
13. `companionMessages`
14. `patientNotes`
15. `moodLogs`
16. `appointments`
17. `sessions`
18. `counsellorRequests`
19. `followUps`
20. `notifications`
21. `dailyCheckins`
22. `wellnessPlans`
23. `emotionLogs`
24. `emotionMaps`
25. `auditLogs`
26. `voiceNotes`
27. `patientAssignments`
28. `trash`

### VULNERABILITY [EMOT-SEC-10] (P1): Missing Cascade Deletion for Somatic Logs:
During Priority 9, `breathingLogs` and `groundingLogs` tables were introduced to store guided somatic intervention sessions. Furthermore, counselor profiles are recorded in the `counsellors` table.
- `deleteUser` **completely omits** `breathingLogs`, `groundingLogs`, and `counsellors`.
- If a user is deleted, their breathing and grounding logs remain permanently orphaned in the database.
- If a counselor user is deleted, their record in the `counsellors` roster remains orphaned.

---

## 13. Input Validation Audit

- **Authoritative Clinical Scoring:**
  - In `screening.submitScreeningAttempt`, item-level scores are evaluated server-side via pure scoring functions in `clinicalScoring.ts`.
  - Item responses are validated: PHQ-9 (9 items, values 0–3), GAD-7 (7 items, values 0–3), PQ-16 (16 items, values 0–1).
  - Out-of-bounds, negative, or missing item responses are rejected with an explicit error.
- **Appointment Timestamps:**
  - `appointments.createAppointment` validates `startTime < endTime` and enforces a maximum session duration of 4 hours (`MAX_DURATION`).
- **Counselor Request Strings:**
  - String fields (`thought_original`, `situation_text`) are typed via Convex validators (`v.optional(v.string())`).
- **VULNERABILITY [EMOT-SEC-05] (P0): Client-Controlled Scores in Legacy Screening (`convex/screening.ts:269-304`):**
  `submitScreening` accepts client-calculated totals (`phq9_total`, `gad7_total`, `pq16_total`, `phq9_item9_score`). Although it checks `>= 0`, it does not validate maximum possible scores (e.g. an attacker could submit `phq9_total: 9999`).

---

## 14. Rate Limiting / Abuse Audit

### Current Rate Limiting Architecture (`convex/rateLimiter.ts`):
- Uses a token-bucket / sliding window algorithm backed by the `rateLimits` table.
- Function `checkRateLimit(ctx, key, action, maxRequests, windowMs)` throws `Rate limit exceeded` if exceeded.
- Applied on:
  - `screening.submitScreeningAttempt`: 5 attempts / 60s per user.
  - `screening.submitScreening`: 5 attempts / 60s per user.
  - `triage.processTriage`: 5 attempts / 60s per user.
  - `counsellorRequests.create`: 5 requests / 60s per user.
- **Duplicate Request Throttling:**
  - `counsellorRequests.create` checks for active requests (`pending`, `assigned`, `scheduled`) and returns the existing request instead of creating duplicates.
  - `appointments.createAppointmentRequest` enforces a single active request constraint.

### Missing Rate Limits (Classified as Hardening / P2):
- `users.register` and `users.login` currently have no backend sliding-window rate limit. A malicious actor can execute brute-force login attempts against user mobile numbers. Production deployment requires rate limiting on authentication mutations.
- Mitra AI companion queries (`companion.sendMessage`) are not rate-limited per student. (Note: P10 rate limiting decisions remain blocked).

---

## 15. Query / Data Access Audit

### Full Table Scans vs. Indexed Access:
1. **Screenings & Attempts:** Uses `by_userId` index (`.withIndex("by_userId", (q) => q.eq("userId", targetUserId))`). Bounded by `.take(20)` in `getScreeningHistory`.
2. **Timeline:** Aggregates up to 18 tables using indexed `.take(50)` bounds per table. Merges, sorts, and paginates in memory.
3. **Appointments:** Uses `by_startTime`, `by_patientId`, and `by_user_id` indexes.
4. **SCALABILITY RISK [EMOT-PERF-01] (P2): Unbounded Scans in `dashboard.getUsersWithAiChats` (`convex/dashboard.ts:1322-1324`):**
   `getUsersWithAiChats` executes `.collect()` on `aiCompanionLogs`, `companionMessages`, and `aiMonitoringLogs`. As conversation volume grows, this query will hit Convex execution limits and timeout.
5. **SCALABILITY RISK [EMOT-PERF-02] (P2): Unbounded Scans in `appointments.tempGetAppointments` (`convex/appointments.ts:369`):**
   `tempGetAppointments` executes `ctx.db.query("appointments").collect()` with no time bounds or pagination.

---

## 16. Secrets & Configuration Audit

- **Git Tracking & Ignored Files:**
  - `.gitignore` properly excludes `.env`, `.env.*`, `.env*.local`, `node_modules/`, `dist/`, `scratch/`, and build artifacts.
  - Inspected `git status`: `.env.local` exists in both root and `dashboard/` but is **untracked** and ignored.
- **Repository Search for Hardcoded Secrets:**
  - Scanned repository for Google Gemini API key patterns (`AIzaSy...`). None found in source code.
  - Scanned for Clerk secret keys (`sk_live_...`, `sk_test_...`). None found in source code.
  - Inspected `app.json`: Contains only public Expo project identifiers (`projectId: 9a5891d9-824b-46b8-a928-4daf6a5fb502`).
  - Inspected `dashboard/vite.config.ts`: Clean configuration without exposed secret plugins.
- **Convex Auth Provider (`convex/auth.config.ts`):**
  Uses `process.env.CONVEX_SITE_URL` with fallback to `https://fabulous-rooster-538.convex.site`.
- **CRITICAL FINDING:** While no secrets are hardcoded in git, the production Gemini API key stored in the `apiKeys` database table is exposed via the unauthenticated `cbt.getActiveApiKey` query (see EMOT-SEC-08).

---

## 17. Logging & Audit Trail Audit

### Security-Relevant Event Logging:
- **Audit Logs Table (`auditLogs`):**
  - Clinical override: `triage.unblockPatient` automatically writes to `auditLogs` with caller ID, timestamp, and action details (`triage.ts:211-216`).
  - Account actions: `users.deleteUser` records administrative deletions.
  - Password reset: `users.resetAdminCredentials` logs to console only, not to `auditLogs`.
- **Missing Audit Trails (Hardening / P2):**
  - Counselor viewing of student clinical timeline or screening attempts is not recorded in an access log (HIPAA / clinical access accounting recommendation).
  - Appointment cancellations and rescheduling by staff are logged in notifications, but do not write to `auditLogs`.

---

## 18. Error / Information Disclosure Audit

- **Error Responses:** Convex errors thrown via `new Error("...")` are returned cleanly to the client as error messages without exposing backend database internal topologies or server execution stacks.
- **Client Identity Leaks:**
  - Endpoints returning lists (e.g. `appointments.listAllAppointments`, `dashboard.getAlerts`) sanitize student documents to `{ _id, full_name, patientId, mobile_number, email }`.
  - Password hashes (`password`) and session tokens are strictly filtered out in `users.sanitizeUser`.
- **VULNERABILITY [EMOT-SEC-06] (P1): Unauthenticated PII Disclosure (`convex/users.ts:15-33` & `714-720`):**
  `users.getByClerkId` and `users.getUserById` are public queries that return a sanitized user object without authentication. Anyone knowing or guessing a user ID or Clerk ID can retrieve the user's name, email, phone number, campus, department, and emergency contact details.

---

## 19. Client Trust Audit

| Field / State | Client Asserted? | Server Authoritative? | Risk Assessment |
| :--- | :---: | :---: | :--- |
| **User Role** | ❌ Ignored | ✅ Derived from DB | Secure: Cannot elevate to counselor/admin |
| **Patient ID** | ❌ Ignored | ✅ Derived from DB | Secure: Generated and resolved server-side |
| **PHQ-9 / GAD-7 Scores** | ❌ Only responses sent | ✅ Calculated on server | Secure: `submitScreeningAttempt` calculates authoritatively |
| **Triage Status** | ❌ Ignored | ✅ Derived from scores | Secure: Evaluated server-side in `evaluateClinicalTriage` |
| **Safety Alert Severity** | ❌ Ignored | ✅ Derived from triage | Secure: Server triggers alert level |
| **Appointment Overlap** | ❌ Ignored | ✅ Checked on server | Secure: Slot conflict validation on insert |
| **Notification Recipient** | ❌ Ignored | ✅ Derived from event | Secure: System-directed notification targets |
| **Clinical Timestamps** | ❌ Client can pass `startedAt` | ✅ `Date.now()` enforced | Secure: Fallbacks ensure server timestamping |

---

## 20. Schema Security Audit

- **38 Tables in `convex/schema.ts`:**
  - Well-defined indexes exist for frequent clinical queries: `by_userId`, `by_patientId`, `by_status`, `by_clerkId`, `by_mobile_number`, `by_recipientId`, `by_attemptId`, `by_triageId`.
- **Schema Hygiene Concerns:**
  - `apiKeys` table stores raw API key strings in the database.
  - `users` table contains `temp_password` which holds plaintext credentials until fetched.
  - `users` lacks an index on `biometricToken`, causing table scans in `biometricLogin`.

---

## 21. Findings Matrix

| Finding ID | Severity | Category | File:Line | Summary |
| :--- | :---: | :--- | :--- | :--- |
| **EMOT-SEC-08** | **P0** | Secrets Exfiltration | `convex/cbt.ts:33-58` | Unauthenticated query & mutation allows public reading and overwriting of production Gemini API key |
| **EMOT-SEC-01** | **P0** | Auth Bypass / Takeover | `convex/users.ts:811-852` | Unauthenticated admin password reset allows complete account takeover via mobile number |
| **EMOT-SEC-04** | **P0** | Auth Bypass / Integrity | `convex/users.ts:620-711` | `completeOnboarding` allows unauthenticated modification of arbitrary user profiles via `args.userId` |
| **EMOT-SEC-05** | **P0** | Clinical Integrity | `convex/screening.ts:269-304` | Legacy `submitScreening` permits unauthenticated injection of forged depression/anxiety scores |
| **EMOT-SEC-06** | **P1** | PII Disclosure | `convex/users.ts:15-33, 714-720` | Unauthenticated queries `getByClerkId` and `getUserById` return student PII to anyone |
| **EMOT-SEC-07** | **P1** | Clinical Privacy | `convex/dashboard.ts:1311-1528`| Full raw AI companion chat logs and prompts exposed to counselors via dashboard |
| **EMOT-SEC-09** | **P1** | Authorization Bypass | `convex/users.ts:734-775` | Unauthenticated mutations `toggleBiometric` and `markScreeningComplete` mutate arbitrary users |
| **EMOT-SEC-10** | **P1** | Data Retention / Deletion | `convex/users.ts:1235-1516`| `deleteUser` fails to cascade deletions to `breathingLogs`, `groundingLogs`, and `counsellors` |
| **EMOT-SEC-02** | **P1** | Default Credentials | `convex/users.ts:778-808` | Public `seedAdmin` mutation can create known default credentials (`adminpassword`) |
| **EMOT-SEC-11** | **P1** | Session Hijacking / Forgery | `convex/companion.ts:71-105` | `companion.logMessage` permits unauthenticated message insertion into another student's log |
| **EMOT-SEC-03** | **P2** | Weak Cryptography | `convex/users.ts:1037-1041`| Biometric session token uses `Math.random()` and causes unindexed table scans |
| **EMOT-SEC-12** | **P2** | Credential Exposure | `convex/users.ts:499, 600-616`| Plaintext password stored in `temp_password` field of `users` table |
| **EMOT-PERF-01** | **P2** | Scalability / DoS | `convex/dashboard.ts:1322-1324`| Unbounded `.collect()` of all AI companion logs in `getUsersWithAiChats` |
| **EMOT-PERF-02** | **P2** | Scalability / DoS | `convex/appointments.ts:362-371`| Unbounded `.collect()` of all appointments in `tempGetAppointments` |
| **EMOT-SEC-13** | **P3** | Abuse / Rate Limiting | `convex/users.ts:360, 960` | Login and registration mutations lack sliding-window rate limiters |

---

## 22. P0 Findings (Must Fix Before Production)

### EMOT-SEC-08: Public Unauthenticated Retrieval & Overwrite of Gemini API Key
- **Severity:** P0 — Critical Security Defect
- **Exact File:** `file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/cbt.ts#L33-L58`
- **What is wrong:**
  `getActiveApiKey` is a public query that fetches the active API key from the `apiKeys` table and returns `{ apiKey: active.key, model: active.model }` without checking caller identity.
  `insertApiKey` is a public mutation that allows any caller on the public internet to insert a new API key, deactivate existing keys, or inject invalid keys.
- **Why it matters:** An attacker can steal the organization's Gemini API key to run unauthorized AI workloads at Emotify's expense, or overwrite the key with garbage to disable AI Companion and CBT services for all users.
- **Exploit Scenario:** Any anonymous actor issues `npx convex run cbt:getActiveApiKey` or calls the Convex HTTP endpoint, exfiltrating the live API key in milliseconds.
- **Remediation:** Remove `getActiveApiKey` and `insertApiKey` from public exposure, or restrict both to `requireAdmin(ctx)`. Gemini API calls should be executed via internal Convex actions where the secret is stored in server-side environment variables (`process.env.GEMINI_API_KEY`).
- **Schema Impact:** No schema change required.
- **Regression Risk:** Zero risk to P1–P12 core clinical flows.

### EMOT-SEC-01: Unauthenticated Admin Credential Reset (Account Takeover)
- **Severity:** P0 — Critical Authentication Defect
- **Exact File:** `file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/users.ts#L811-L852`
- **What is wrong:**
  `users.resetAdminCredentials` accepts `{ currentMobile, newMobile, newPassword }`. It queries the `users` table for an admin with `currentMobile`, verifies `adminUser.role === "admin"`, and immediately hashes `newPassword` and patches the database. No current session, previous password, or OTP verification is performed.
- **Why it matters:** Allows complete takeover of any administrator account by simply knowing or guessing the administrator's phone number.
- **Exploit Scenario:** An attacker calls `users.resetAdminCredentials({ currentMobile: "1234567890", newPassword: "attackerPassword" })`. The admin password is immediately updated, granting the attacker full staff dashboard privileges.
- **Remediation:** Protect `resetAdminCredentials` with `requireAdmin(ctx)` or require proof of identity (valid session + old password verification).
- **Schema Impact:** None.
- **Regression Risk:** Zero risk.

### EMOT-SEC-04: Unauthenticated User Profile Overwrite in `completeOnboarding`
- **Severity:** P0 — Critical Integrity Defect
- **Exact File:** `file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/users.ts#L620-L711`
- **What is wrong:**
  In `completeOnboarding`, if `identity` is null, the code executes:
  ```typescript
  if (!user && args.userId) {
    user = await ctx.db.get(args.userId as any);
  }
  ```
  It then updates `user._id` with the client-supplied `alias`, `age`, `campus`, `department`, `emergencyContactName`, `emergencyContactPhone`, and `consentVersion`.
- **Why it matters:** An unauthenticated attacker can alter another student's emergency contact name and phone number, causing crisis notifications and emergency calls to be routed to malicious or incorrect recipients.
- **Exploit Scenario:** Attacker calls `completeOnboarding({ userId: "<target_student_id>", emergencyContactPhone: "attacker_phone" })`. Target student's emergency records are overwritten without authentication.
- **Remediation:** Require authentication (`if (!identity) throw new Error("Unauthenticated")`) and enforce that `user._id` matches the authenticated caller.
- **Schema Impact:** None.
- **Regression Risk:** Zero risk.

### EMOT-SEC-05: Unauthenticated Score Forgery in Legacy `submitScreening`
- **Severity:** P0 — Critical Clinical Integrity Defect
- **Exact File:** `file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/screening.ts#L269-L304`
- **What is wrong:**
  `submitScreening` resolves caller as:
  ```typescript
  const identity = await ctx.auth.getUserIdentity();
  const userId = identity?.subject || args.userId;
  if (!userId) throw new Error("Unauthenticated");
  ```
  If `identity` is null, `userId` evaluates to `args.userId`. The unauthenticated caller can pass any target student's ID along with forged `phq9_total`, `gad7_total`, and `pq16_total` scores.
- **Why it matters:** Corrupts longitudinal clinical records and can forge false severe clinical histories for students without authorization.
- **Exploit Scenario:** Attacker submits false suicide flag scores for a student, corrupting their clinical record.
- **Remediation:** Require active authentication (`if (!identity) throw new Error("Unauthenticated")`) and enforce `assertCanAccessStudent(ctx, userId)`.
- **Schema Impact:** None.
- **Regression Risk:** Zero risk.

---

## 23. P1 Findings (Should Fix Before Production)

### EMOT-SEC-06: Unauthenticated PII Disclosure via `getByClerkId` & `getUserById`
- **Severity:** P1 — High Privacy Defect
- **Exact File:** `file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/users.ts#L15-L33`, `L714-L720`
- **What is wrong:** Queries return sanitized user profile documents (`full_name`, `email`, `mobile_number`, `patientId`, `role`, `campus`, `department`, `emergencyContactName`, `emergencyContactPhone`) without checking caller authentication or ownership.
- **Remediation:** Enforce authentication and invoke `await assertCanAccessStudent(ctx, targetUserId)`.

### EMOT-SEC-07: Raw AI Chat History Exposed to Counselors
- **Severity:** P1 — High Privacy Defect
- **Exact File:** `file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/dashboard.ts#L1311-L1528`
- **What is wrong:** `getUsersWithAiChats` and `getPatientAiChatHistoryAdmin` return full conversational transcripts between students and the AI companion to any counselor.
- **Remediation:** Restrict conversational transcript retrieval to high-privilege administrators or only when an active clinical emergency safety alert has been triggered with explicit student consent.

### EMOT-SEC-09: Unauthenticated Biometric and Screening State Manipulation
- **Severity:** P1 — High Authorization Defect
- **Exact File:** `file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/users.ts#L734-L775`
- **What is wrong:** `toggleBiometric` and `markScreeningComplete` mutate user records based purely on `args.userId` without checking caller identity.
- **Remediation:** Enforce authentication and ownership verification.

### EMOT-SEC-10: Incomplete Data Cascade on User Deletion
- **Severity:** P1 — Data Integrity / Retention Gap
- **Exact File:** `file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/users.ts#L1235-L1516`
- **What is wrong:** `deleteUser` deletes from 28 tables but omits `breathingLogs`, `groundingLogs`, and `counsellors`.
- **Remediation:** Add cascade deletions for `breathingLogs` and `groundingLogs` by `userId`, and `counsellors` by `userId`.

### EMOT-SEC-02: Public Re-seeding of Default Admin Credentials
- **Severity:** P1 — Credential Management Defect
- **Exact File:** `file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/users.ts#L778-L808`
- **What is wrong:** `seedAdmin` allows anonymous re-creation of an administrator account with default password `adminpassword`.
- **Remediation:** Restrict `seedAdmin` to internal backend scripts or require an environment setup token.

### EMOT-SEC-11: Unauthenticated Message Injection in `companion.logMessage`
- **Severity:** P1 — Session Integrity Defect
- **Exact File:** `file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/companion.ts#L71-L105`
- **What is wrong:** If caller is unauthenticated, `logMessage` allows `userId: args.userId || callerId`, inserting spoofed messages into a student's chat log.
- **Remediation:** Require authentication and enforce `userId === identity.subject`.

---

## 24. P2 Findings (Hardening / Scalability / Audit Improvements)

### EMOT-SEC-03: Cryptographically Weak Biometric Token & Unindexed Table Scan
- **Severity:** P2 — Hardening
- **Exact File:** `file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/users.ts#L1037-L1088`
- **Description:** `generateBiometricToken` uses `Math.random()`. `biometricLogin` scans all users table records with a filter because `biometricToken` lacks an index.
- **Remediation:** Use `crypto.getRandomValues()` and add `by_biometricToken` index to `users` table schema in future migration.

### EMOT-SEC-12: Plain-Text Password Residue in `temp_password`
- **Severity:** P2 — Credential Hardening
- **Exact File:** `file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/users.ts#L499, L600-L616`
- **Description:** Storing plain-text `temp_password` in the user document until manually fetched leaves temporary credentials readable in database snapshots.
- **Remediation:** Replace with time-limited hashed verification tokens.

### EMOT-PERF-01: Unbounded Scans in `dashboard.getUsersWithAiChats`
- **Severity:** P2 — Scalability / Denial of Service
- **Exact File:** `file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/dashboard.ts#L1322-L1324`
- **Description:** Executes `.collect()` on three unbounded AI tables simultaneously.
- **Remediation:** Paginate queries or bound by recent active timestamps.

### EMOT-PERF-02: Unbounded Scan in `appointments.tempGetAppointments`
- **Severity:** P2 — Scalability
- **Exact File:** `file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/appointments.ts#L362-L371`
- **Description:** Collects all appointments in the system.
- **Remediation:** Remove legacy debug query or add date-bounded pagination.

---

## 25. P3 / Accepted Risks

### EMOT-SEC-13: Brute Force Protection on Login / Register
- **Severity:** P3 — Accepted Risk for Current Phase
- **Description:** While journal writes, screenings, and counselor requests have sliding-window rate limiters (`rateLimiter.ts`), login and registration rely on network-level IP throttling.
- **Recommendation:** Implement IP/Mobile rate limiting prior to general Play Store release.

---

## 26. Regression Verification

Verification commands were executed without modifying application code or database state:

### 1. Vitest Backend Test Suite
```bash
npx vitest run
```
**Output:**
```
 ✓ convex/cbt_provenance.test.ts (11 tests)
 ✓ convex/users.test.ts (29 tests)
 ✓ convex/security_step5d_hardening.test.ts (5 tests)
 ✓ convex/reframe_clinical_bridge.test.ts (14 tests)
 ✓ convex/p12_step7_e2e_closure.test.ts (18 tests)
 ✓ convex/p12_step6_longitudinal_review.test.ts (18 tests)
 ✓ convex/p12_step5_followup_management.test.ts (16 tests)
 ✓ convex/p12_step4_appointment_lifecycle.test.ts (16 tests)
 ✓ convex/p12_step3_counsellor_request_flow.test.ts (12 tests)
 ✓ convex/p12_step2_security_authorization.test.ts (14 tests)
 ... [All 42 test files executed]
Test Files  42 passed (42)
     Tests  706 passed (706)
  Start at  21:48:38
  Duration  17.70s
```

### 2. TypeScript Compilation Check
```bash
npx tsc --noEmit
```
**Output:** Exit Code 0 (Clean, 0 errors).

### 3. Dashboard Production Build
```bash
cd dashboard && npm run build
```
**Output:**
```
vite v5.4.14 building for production...
transforming...
✓ 1836 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.46 kB │ gzip:  0.30 kB
dist/assets/index-B_Y7b_dK.css   33.22 kB │ gzip:  6.41 kB
dist/assets/index-DT0sQ8fS.js   483.47 kB │ gzip: 147.24 kB
✓ built in 1.08s
```

---

## 27. Recommended Remediation Order for P14 Step 2

Remediations should proceed strictly in descending severity order:

1. **Phase 1 — P0 Critical Vulnerability Remediation:**
   - Secure or internalize `cbt.getActiveApiKey` and `cbt.insertApiKey`.
   - Protect `users.resetAdminCredentials` with `requireAdmin(ctx)`.
   - Eliminate unauthenticated `args.userId` fallback in `users.completeOnboarding`.
   - Enforce authentication and ownership validation on legacy `screening.submitScreening`.
2. **Phase 2 — P1 Privacy & Authorization Hardening:**
   - Enforce authorization on `users.getByClerkId`, `users.getUserById`, `users.toggleBiometric`, and `users.markScreeningComplete`.
   - Restrict `dashboard.getPatientAiChatHistoryAdmin` and audit counselor access to AI logs.
   - Expand `users.deleteUser` cascade to include `breathingLogs`, `groundingLogs`, and `counsellors`.
   - Protect or deprecate `users.seedAdmin` and `companion.logMessage`.
3. **Phase 3 — P2 Scalability & Hardening:**
   - Replace unbounded `.collect()` queries in `dashboard.ts` and `appointments.ts`.
   - Upgrade biometric token generation to CSPRNG.
4. **Phase 4 — Verification & Regression Sign-off:**
   - Run full 706-test backend suite and append regression tests specifically verifying all patched security vulnerabilities.

---

## 28. P14 Step 1 Conclusion

The P14 Step 1 comprehensive read-only audit is complete. 

The core clinical and operational workflows completed across Priorities P1 through P12 are architecturally robust, enforce server-authoritative scoring, and strictly validate data ownership and provenance. The critical vulnerabilities discovered reside primarily in utility, setup, and legacy endpoints that were not covered by the clinical hardening passes.

**All findings are established and documented with zero code or schema modifications.**  
The repository remains in its exact verified baseline state (706/706 tests passing, TypeScript clean, Dashboard build clean), ready for targeted remediation in P14 Step 2.
