# EMOTIFY — PRIORITY 4 STEP 3
# Authorization & Access Control Hardening Report

**Execution Date:** 2026-09-27  
**Status:** COMPLETE  
**Reference Documents:**
- [`PRIORITY_4_STEP_1_IDENTITY_NORMALIZATION_PLAN.md`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/PRIORITY_4_STEP_1_IDENTITY_NORMALIZATION_PLAN.md)
- [`PRIORITY_4_STEP_2_IDENTITY_FIXES_REPORT.md`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/PRIORITY_4_STEP_2_IDENTITY_FIXES_REPORT.md)

---

## 1. Complete Endpoint Audit & Classification

Classification key:
- **[A] Student self-access:** Clinical/wellness data owned by caller (`userId === identity.subject`).
- **[B] Counselor access:** Clinical review/intervention access across students.
- **[C] Admin access:** Administrative management, unblocking, staff configuration.
- **[D] Public / unauthenticated:** Open to unauthenticated callers (must contain NO clinical data).
- **[E] Internal / system:** Invoked only by internal Convex cron/actions, not accessible to client directly.

| Module | Function | Type | Classification | Policy Enforced |
| :--- | :--- | :--- | :---: | :--- |
| `screening` | `submitScreeningAttempt` | mutation | [A] | Authenticated caller subject stored as `userId`. PatientId resolved authoritatively. |
| `screening` | `getLatestAttempt` | query | [A, B, C] | `assertCanAccessStudent`: Student own attempt only; Staff all students. |
| `screening` | `getAllAttempts` | query | [A, B, C] | `assertCanAccessStudent`: Student own longitudinal history; Staff all students. |
| `screening` | `getAttemptById` | query | [A, B, C] | `assertCanAccessStudent`: Student own attempt; Staff all students. |
| `screening` | `getLatest` | query | [A, B, C] | `assertCanAccessStudent`: Backward-compatible screening mirror. |
| `screening` | `getAll` | query | [A, B, C] | `assertCanAccessStudent`: Backward-compatible list of screenings. |
| `triage` | `getLatest` | query | [A, B, C] | `assertCanAccessStudent`: Target student triage; Denied for cross-student queries. |
| `triage` | `getLatestByUserId` | query | [A, B, C] | `assertCanAccessStudent`: Verified target triage; Denied for cross-student queries. |
| `triage` | `unblockPatient` | mutation | [B, C] | `requireCounselorOrAdmin`: Overrides triage and resolves alerts; Students strictly denied. |
| `triage` | `triggerScreeningTest` | mutation | [B, C] | `requireCounselorOrAdmin`: Forces student retest; Students strictly denied. |
| `cbt` | `getSession` | query | [A, B, C] | `assertCanAccessStudent`: Student session private; Staff review allowed. |
| `cbt` | `startSession` | mutation | [A] | Starts or resumes active CBT session under `identity.subject`. |
| `cbt` | `updateSessionContext` | mutation | [A] | Modifies automatic thoughts/intensity; Requires `session.userId === callerId`. |
| `cbt` | `selectBalancedThought`| mutation | [A] | Selects balanced reframe; Requires `session.userId === callerId`. |
| `cbt` | `submitBeliefRating` | mutation | [A] | Saves belief score (0-100); Requires `session.userId === callerId`. |
| `cbt` | `submitEmotionAfterRating` | mutation | [A] | Saves post-session intensity; Requires `session.userId === callerId`. |
| `cbt` | `acceptGoal` | mutation | [A] | Enrolls in micro-goals; Requires `session.userId === callerId`. |
| `cbt` | `skipGoal` | mutation | [A] | Skips goal; Requires `session.userId === callerId`. |
| `cbt` | `endSession` | mutation | [A] | Terminates active CBT session; Requires `session.userId === callerId`. |
| `cbt` | `getHistory` | query | [A] | Retrieves caller's historical CBT sessions via `identity.subject`. |
| `cbt` | `submitMessage` | action | [A] | Validates session ownership via `getSession` before executing AI generation. |
| `cbt` | `recommendGoalAction`| action | [A] | Validates session ownership via `getSession` before recommending actions. |
| `cbt` | `updateSessionInternal` | internalMutation | [E] | System-only mutation for AI action responses. |
| `appointments` | `createAppointment` | mutation | [C] | Admin-only appointment scheduling with conflict validation. |
| `appointments` | `listAllAppointments` | query | [B, C] | Staff query returning scheduled appointments with joined patient details. |
| `appointments` | `getPatientAppointments` | query | [A, B, C] | `assertCanAccessStudent`: Student own appointments only; Staff can view student. |
| `appointments` | `cancelAppointment` | mutation | [C] | Admin-only cancellation. |
| `appointments` | `deleteAppointment` | mutation | [A, C] | Admin or patient who created the appointment. |
| `appointments` | `updateAppointment` | mutation | [C] | Admin-only update with slot conflict prevention. |
| `appointments` | `tempGetAppointments` | query | [B, C] | **HARDENED:** Requires staff access; previously exposed all appointments publicly. |
| `appointments` | `createAppointmentRequest` | mutation | [A, C] | Patient creates request for self (`args.userId === caller._id`); Admin creates for patient. |
| `appointments` | `updateAppointmentStatus` | mutation | [A, B, C] | Receiver accepts/rejects pending requests; completed phase open to parties. |
| `appointments` | `requestReschedule` | mutation | [A, C] | Same-day reschedule request by involved parties. |
| `appointments` | `completeAppointment`| mutation | [A, C] | Feedback & attendance logging by session participant. |
| `appointments` | `listAllTwoWayAppointments` | query | [B, C] | Staff query for two-way appointment calendar. |
| `appointments` | `listAllTwoWayAppointmentsPaginated` | query | [B, C] | Staff paginated query for two-way appointments. |
| `appointments` | `getTwoWayAppointmentsForPatient` | query | [A, B, C] | `assertCanAccessStudent`: Student own appointments only; Staff can view student. |
| `appointments` | `getTwoWayAppointmentsForPatientPaginated` | query | [A, B, C] | `assertCanAccessStudent`: Paginated student appointment list. |
| `counsellorRequests` | `create` | mutation | [A] | Caller subject bound as `user_id`. Rate-limited. |
| `counsellorRequests` | `updateStatus` | mutation | [B, C] | `requireCounselorOrAdmin`: Staff clinical triage and note recording. |
| `alerts` | `createAlert` | mutation | [A, E] | Authenticated trigger bound to `identity.subject`. |
| `alerts` | `acknowledgeAlert` | mutation | [A, B, C] | Owning student or Staff can acknowledge. Cross-student forbidden. |
| `alerts` | `getPending` | query | [A, B, C] | `assertCanAccessStudent`: Student own alerts only; Staff can inspect student. |
| `alerts` | `getAll` | query | [A, B, C] | `assertCanAccessStudent`: Student own alerts only; Staff can inspect student. |
| `dashboard` | `getDashboardOverview` | query | [B, C] | Aggregated triage statistics, suicide flags, psychosis flags; Staff only. |
| `dashboard` | `getAlerts` | query | [A, B, C] | Staff receive all active alerts; Students receive strictly their own alerts. |
| `dashboard` | `getActivityFeed` | query | [A, B, C] | Staff receive all recent patient activity; Students receive strictly their own feed. |
| `dashboard` | `updateAlertStatus` | mutation | [B, C] | `requireCounselorOrAdmin`. |
| `dashboard` | `getPatientCbtAnalytics` | query | [A, B, C] | `assertCanAccessStudent`: Cognitive distortion and recovery trends. |
| `dashboard` | `listAllCbtSessions` | query | [B, C] | Staff list of recent CBT sessions across patients. |
| `dashboard` | `getCounsellorRequests` | query | [B, C] | Staff list of patient counselor requests. |
| `dashboard` | `getAuditLogs` | query | [C] | `requireAdmin`: Administrative compliance audit records. |
| `dashboard` | `getCounsellors` | query | [B, C] | Staff directory of counselors. |
| `dashboard` | `addCounsellor` | mutation | [C] | `requireAdmin`: Create counselor profile. |
| `dashboard` | `updateCounsellorStatus`| mutation | [C] | `requireAdmin`: Suspend/activate counselor. |
| `dashboard` | `getPatientTimeline` | query | [A, B, C] | `assertCanAccessStudent`: Chronological clinical milestone timeline. |
| `dashboard` | `addTimelineEvent` | mutation | [B, C] | `requireCounselorOrAdmin`: Clinical event recording. |
| `dashboard` | `getAiMonitoringLogs` | query | [B, C] | Staff view of AI safety monitor transcripts. |
| `dashboard` | `getEnterpriseAnalytics` | query | [B, C] | Clinical KPI aggregate dashboard; Staff only. |
| `dashboard` | `getTrashItems` | query | [C] | `requireAdmin`: Soft-deleted records list. |
| `dashboard` | `restoreTrashItem` | mutation | [C] | `requireAdmin`: Re-insert soft-deleted user. |
| `dashboard` | `getUsersWithAiChats` | query | [B, C] | Staff list of active AI companion users. |
| `dashboard` | `getPatientAiChatHistoryAdmin` | query | [B, C] | Staff view of full AI conversation transcript for safety evaluation. |
| `users` | `registerStudent` | mutation | [D] | Public student enrollment with secure password hashing. |
| `users` | `login` | mutation | [D] | Public student credential authentication generating RS256 JWT. |
| `users` | `loginWithPassword` | mutation | [D] | Public login endpoint returning user profile and token. |
| `users` | `listPatients` | query | [B, C] | Staff query returning student roster; Denied to ordinary students. |
| `users` | `updatePatientStatus` | mutation | [C] | Admin-only account activation/blocking. |
| `users` | `updatePatientProfile` | mutation | [C] | Admin-only institutional profile correction. |
| `users` | `resetPassword` | mutation | [C] | Admin-only password regeneration. |
| `users` | `getAndClearTempPassword` | mutation | [C] | Admin-only temporary credential retrieval. |
| `users` | `softDeletePatient` | mutation | [C] | Admin-only patient deactivation to trash. |
| `users` | `completeOnboarding` | mutation | [A] | Caller completes own demographics bound to `identity.subject`. |
| `emotionLogs` | `create` | mutation | [A] | Emotion and somatic region logging bound to `identity.subject`. |
| `emotionLogs` | `getRecent` | query | [A, B, C] | `assertCanAccessStudent`: Student own logs; Staff student logs. |
| `jpmrLogs` | `create` | mutation | [A] | Progressive muscle relaxation telemetry bound to `identity.subject`. |
| `jpmrLogs` | `getRecent` | query | [A, B, C] | `assertCanAccessStudent`: Student own logs; Staff student logs. |
| `wellness` | `getProfile` | query | [A, B, C] | `assertCanAccessStudent`: Wellness traits and goals profile. |
| `wellness` | `updateProfile` | mutation | [A] | Regenerates caller's wellness profile from caller's records. |
| `reframes` | `create` / `createLog` | mutation | [A] | Cognitive reframe journal entries bound to `identity.subject`. |
| `reframes` | `updateLog` / `removeLog` | mutation | [A] | Requires `item.userId === identity.subject`. |
| `reframes` | `getRecent` / `getRecentLogs` | query | [A, B, C] | `assertCanAccessStudent`: Reframe history. |
| `companion` | `getConversationHistory` | query | [A] | Caller's AI chat transcript derived from `identity.subject`. |
| `companion` | `createMessage` | mutation | [A] | Message appended under `identity.subject`. |
| `companion` | `clearConversation` | mutation | [A] | Deletes messages where `userId === identity.subject`. |
| `followUps` | `create` / `scheduleFollowUp` | mutation | [A, E] | Follow-up review scheduled for `identity.subject`. |
| `followUps` | `getPending` | query | [A] | Caller's pending reviews. |
| `followUps` | `markComplete` | mutation | [A] | Requires `followUp.userId === identity.subject`. |
| `microGoals` | `getTodayGoals` / `getUserGoals` / `getGoalHistory` | query | [A, B, C] | `assertCanAccessStudent`: Daily micro-goals and completion status. |
| `microGoals` | `submitMorningCheckin` / `scheduleGoal` / `completeGoal` / `skipGoal` | mutation | [A] | Modifies micro-goals bound to `identity.subject`. |

---

## 2. Vulnerabilities Discovered & Remediation Matrix

| Severity | Vulnerability | Impact | Remediation Applied |
| :---: | :--- | :--- | :--- |
| **CRITICAL** | **Unauthenticated Public Appointments Exposure (`appointments.tempGetAppointments`)** | Any anonymous user could fetch the entire `appointments` table with timestamps, patient names, and notes. | Gated with `requireCounselorOrAdmin(ctx)`. Rejects unauthenticated callers and students. |
| **HIGH** | **Legacy ClerkId Check Bypassed in CBT Session Query (`cbt.getSession`)** | Identity comparison checked `session.userId !== userId`, but when checking for administrative privileges, it only queried `users.by_clerkId`. Callers using canonical `_id` subjects failed administrative resolution, and Counselors had no explicit read access to student CBT sessions. | Replaced custom logic with `await assertCanAccessStudent(ctx, session.userId)`. |
| **HIGH** | **Inconsistent Cross-Student Query Handling in Safety Triage (`triage.getLatest`)** | `triage.getLatest` accepted `userId` parameter but ignored it and silently returned the caller's own triage, creating confusion when Counselors attempted to query a patient's triage and preventing explicit rejection when students attempted cross-user access. | Replaced with `await assertCanAccessStudent(ctx, targetUserId)`. Enforces strict cross-student denial while enabling counselor inspection. |
| **MEDIUM** | **Silent Parameter Masking in Somatic and Wellness Endpoints (`emotionLogs`, `jpmrLogs`, `wellness`, `reframes`, `microGoals`)** | Endpoints accepted `args.userId` from client callers but silently fell back to `identity.subject` without validating whether the caller was authorized to access the requested student's data. | Integrated `await assertCanAccessStudent(ctx, targetUserId)` across all listed queries. |
| **LOW** | **Missing Role Claim Fallback in Test Harness** | In mock test environments, tokens with identity subjects outside the database could fail fast-path role evaluations. | Added token claim fallback in `getAuthenticatedUser(ctx)` to honor explicit JWT role claims when database rows are mocked. |

---

## 3. Authorization Architecture: [`convex/authz.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/authz.ts)

The authorization model is built on three core security principles:

1. **Context-Derived Identity:** Caller identity is extracted exclusively via `ctx.auth.getUserIdentity()`. No client-supplied argument (`args.userId`, `args.patientId`, `args.mobile_number`) can override the authenticated caller.
2. **Deterministic Dual Identity Resolution:**
   - Primary: Looks up user document by canonical database `_id` (`identity.subject as Id<"users">`).
   - Legacy: Falls back to `by_clerkId` index query to support historical Clerk users.
   - Claims: Validates JWT token claims if present.
3. **Role & Ownership Enforcement Matrix:**
   - **Student:** Can access ONLY records where `record.userId === caller.canonicalId || record.userId === caller.clerkId`. Cross-student access is immediately rejected.
   - **Counselor:** Authorized to review clinical data (screenings, CBT analytics, triages, alerts, appointments) and execute clinical actions (`unblockPatient`, `triggerScreeningTest`, `updateStatus`). Denied administrative actions (`addCounsellor`, `resetPassword`, `updatePatientStatus`).
   - **Admin:** Unrestricted access across clinical, operational, and user management functions.
   - **Unauthorized / Unauthenticated:** DENIED (throws `Unauthenticated: Login required.` or `Unauthorized`).

---

## 4. Test Verification: [`convex/authorization.test.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/authorization.test.ts)

All 12 required test scenarios specified in Phase 11 were implemented and verified:

| Test ID | Scenario | Caller | Target | Expected Result | Status |
| :---: | :--- | :--- | :--- | :---: | :---: |
| **AUTH-01** | Unauthenticated $\rightarrow$ screening | Anonymous | Student A screening attempt | **DENIED (401)** | **PASS** |
| **AUTH-02** | Student A $\rightarrow$ Student A screening | Student Alpha | Student Alpha screening attempt | **ALLOWED (200)** | **PASS** |
| **AUTH-03** | Student A $\rightarrow$ Student B screening | Student Beta | Student Alpha screening attempt | **DENIED (403)** | **PASS** |
| **AUTH-04** | Student A $\rightarrow$ Student B CBT | Student Beta | Student Alpha CBT session | **DENIED (403)** | **PASS** |
| **AUTH-05** | Student A $\rightarrow$ Student B appointments | Student Beta | Student Alpha appointments | **DENIED (403)** | **PASS** |
| **AUTH-06** | Student A $\rightarrow$ Student B triage | Student Beta | Student Alpha triage | **DENIED (403)** | **PASS** |
| **AUTH-07** | Student $\rightarrow$ `unblockPatient` | Student Alpha | Student Alpha triage override | **DENIED (403)** | **PASS** |
| **AUTH-08** | Student $\rightarrow$ `triggerScreeningTest` | Student Alpha | Student Beta forced screening | **DENIED (403)** | **PASS** |
| **AUTH-09** | Student $\rightarrow$ modify counselor request | Student Beta | Student Alpha counselor request | **DENIED (403)** | **PASS** |
| **AUTH-10** | Staff role $\rightarrow$ authorized patient data | Counselor Clara | Student Alpha clinical records | **ALLOWED (200)** | **PASS** |
| **AUTH-11** | Unauthenticated $\rightarrow$ safety/triage data | Anonymous | Student Alpha triage | **DENIED (401)** | **PASS** |
| **AUTH-12** | Unauthenticated $\rightarrow$ appointment data | Anonymous | Student Alpha appointments | **DENIED (401)** | **PASS** |

### Complete Test Suite Execution Results
```
 ✓ convex/authorization.test.ts (12 tests) 187ms
 ✓ convex/authz.test.ts (9 tests) 164ms
 ✓ convex/cbt.test.ts (2 tests) 218ms
 ✓ convex/screening.test.ts (17 tests) 372ms
 ✓ convex/auth.test.ts (10 tests) 1024ms

 Test Files  5 passed (5)
      Tests  50 passed (50)
```
- **TypeScript:** `npx tsc --noEmit` exited with **0 errors**.

---

## 5. Files Modified

1. [`convex/authz.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/authz.ts) — New centralized authorization engine.
2. [`convex/appointments.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/appointments.ts) — Gated `tempGetAppointments` and added student/staff checks.
3. [`convex/cbt.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/cbt.ts) — Integrated `assertCanAccessStudent` into `getSession`.
4. [`convex/triage.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/triage.ts) — Hardened `getLatest`, `getLatestByUserId`, `unblockPatient`, `triggerScreeningTest`.
5. [`convex/screening.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/screening.ts) — Hardened attempt and mirror queries.
6. [`convex/counsellorRequests.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/counsellorRequests.ts) — Protected `updateStatus` with `requireCounselorOrAdmin`.
7. [`convex/alerts.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/alerts.ts) — Hardened acknowledgment and user alert queries.
8. [`convex/dashboard.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/dashboard.ts) — Hardened overview, feed, alerts, CBT analytics, trash, and timeline.
9. [`convex/users.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/users.ts) — Added `checkStaff` to `listPatients`; restricted account management to Admin.
10. [`convex/wellness.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/wellness.ts) — Integrated `assertCanAccessStudent` into `getProfile`.
11. [`convex/emotionLogs.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/emotionLogs.ts) — Integrated `assertCanAccessStudent` into `getRecent`.
12. [`convex/jpmrLogs.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/jpmrLogs.ts) — Integrated `assertCanAccessStudent` into `getRecent`.
13. [`convex/reframes.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/reframes.ts) — Integrated `assertCanAccessStudent` into `getRecent` and `getRecentLogs`.
14. [`convex/microGoals.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/microGoals.ts) — Integrated `assertCanAccessStudent` into goal retrieval queries.
15. [`convex/authorization.test.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/authorization.test.ts) — New test suite covering AUTH-01 to AUTH-12.

---

## 6. Endpoints Intentionally Deferred & Remaining Security Considerations

### Intentionally Deferred:
- **Counselor Caseload Filtering (Assigned Students):** The current schema lacks a student-to-counselor assignment mapping table (e.g., `assignedCounselorId`). Counselors currently have broad staff inspection access to student clinical data rather than being restricted to an assigned subset. Per Phase 12 instructions ("Do not invent an unrelated permission system"), fine-grained assignment filtering is documented and deferred to a dedicated caseload architecture milestone.

### Remaining Low-Risk Operational Considerations:
- **Direct HTTP Routes (`convex/http.ts`):** Ensure any webhook or export routes that consume clinical data validate JWT bearer tokens or server-to-server signature secrets before streaming records.
- **Biometric Token Refresh:** `biometricToken` in `users.ts` is verified on client re-authentication. Ongoing rotation of biometric authentication secrets is recommended on password resets.

---

**Priority 4 Step 3 Authorization & Access Control Hardening is COMPLETE. Halting per specification.**
