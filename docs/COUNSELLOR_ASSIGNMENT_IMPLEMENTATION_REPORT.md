# Counsellor Assignment, Caseload Management and Student Profile Integration

Implementation report. Verified results are marked as such; anything not exercised is listed under limitations.

## 1. What already existed (audit)

The audit found a working base from earlier security work, which this change extends rather than duplicates:

- `counsellorAssignments` table (counsellor, student, assignedBy, assignedAt, active, endedAt).
- Single assign/unassign mutations (admin-only) and a per-student control on the student detail page.
- Caseload authorization in `convex/authz.ts`, already used by every staff endpoint that reads or writes student data:
  - `assertCanAccessStudent`: a counsellor passes only with an active assignment.
  - `getStaffScope` / `scopeIncludes`: list endpoints.
  - Every exported Convex function was inventoried by script. None returned student data to a counsellor on a role check alone. Every record-id endpoint (alert, triage, attempt, follow-up, request, appointment) resolves the record's student and checks access.

Gaps found and fixed:

| Gap | Fix |
|---|---|
| No bulk assign/remove, no admin roster or unassigned list, no counsellor caseload view for admins | New queries/mutations and an Assignments page |
| No student-facing assignment query; the profile had no counsellor section | `getMyCounsellor` and a My Counsellor section |
| Deleting a counsellor left their students' rows active, pointing at a deleted account; student rows were not purged | Deletion ends active rows (both roles) and purges the student's own history |
| If a student's only counsellor was deactivated, safety alerts reached admins only | Inactive counsellors are skipped; the existing "alert every active counsellor" fallback applies |
| Ending an assignment did not record who ended it or why | `endedBy` and `endReason` fields |

## 2. Files changed

| File | Why |
|---|---|
| `convex/schema.ts` | Optional `endedBy`/`endReason` on `counsellorAssignments`; `by_active` index; `by_userId` index on the `counsellors` staff directory |
| `convex/counsellorAssignments.ts` | Assignment API (below) |
| `convex/authz.ts` | Safety-recipient fix for deactivated counsellors |
| `convex/users.ts` | Deletion ends assignments; student assignment rows added to the purge list |
| `convex/counsellor_assignments.test.ts` | 27 backend tests (new) |
| `dashboard/src/pages/Assignments.tsx` | Admin Student Assignments page (new) |
| `dashboard/src/App.tsx`, `layouts/DashboardLayout.tsx` | Admin-only `/assignments` route and nav item |
| `dashboard/src/components/CaseloadAssignment.tsx` | Confirm before reassign/remove; flag an inactive counsellor |
| `dashboard/src/pages/Overview.tsx`, `pages/PatientsList.tsx` | Counsellor wording: "My students" count and a "none assigned yet" empty state |
| `dashboard/src/index.css` | `.sr-only` helper |
| `components/profile/MyCounsellorSection.tsx` | Student My Counsellor section (new) |
| `common/myCounsellorState.ts` (+ test) | Pure view-state logic: loading / offline / unassigned / and so on |
| `app/(auth)/(tabs)/profile.tsx` | Section placed above Account Details |
| `i18n/locales/en.json` | English strings under `profile.myCounsellor` |

## 3. Schema and index changes

All additions are optional fields or new indexes, so existing documents remain valid and no data migration is needed.

- `counsellorAssignments.endedBy` (`v.optional(v.id("users"))`) and `counsellorAssignments.endReason` (`v.optional(v.string())`).
- `counsellorAssignments.index("by_active", ["active"])`, used for admin totals and roster joins.
- `counsellors.index("by_userId", ["userId"])`, used to find a counsellor's directory entry.

## 4. Assignment behaviour

- **One active counsellor per student.** Assigning a different counsellor ends the current row (`endReason: "reassigned"`, `endedBy`, `endedAt`) and inserts a new active row.
  - Repeating the same assignment is a no-op (`outcome: "unchanged"`).
  - Legacy duplicate active rows are repaired on the next assignment.
- **Atomic.** Each mutation is one Convex transaction, and Convex serializes conflicting writes.
  - Verified with concurrent conflicting requests: exactly one active row per student.
- **Validation before any write:**
  - the caller is an admin;
  - the counsellor exists, has role `counsellor` and is active;
  - the student exists, has role `patient` and is active.
- **Bulk** (`assignMany`, `unassignMany`):
  - up to 100 distinct students per request;
  - each student is validated separately and gets its own outcome (`assigned`, `reassigned`, `unchanged`, or `failed` with a reason);
  - valid students are applied, `success` is `false` whenever any student failed, and the summary counts every outcome.
- **Notifications:**
  - The receiving counsellor gets one summary notification. If the new students have open safety alerts, it says how many and is sent at high priority.
  - Counsellors who lost students get one notification each.
- **Audit:** every change writes `caseload_assigned`, `caseload_reassigned` or `caseload_unassigned` to `auditLogs`.
- **History:** inactive rows form the history. `getStudentAssignmentHistory` (admin) lists counsellor, assigned by/at, ended by/at and reason.
- **Clinical records are never touched.** Alerts, screenings, triages, appointments, follow-ups, requests and timeline events are linked to the student, not to a counsellor.
  - They move with the student and keep their original provenance.
  - Verified: a snapshot of all clinical tables is identical before and after reassign and unassign.
- **Deactivated counsellor:**
  - Their rows stay active, which is reversible: reactivating restores the caseload.
  - Admins see these students under "Needs reassignment".
  - The student sees "unavailable".
  - A deactivated counsellor cannot sign in, because existing sessions are deleted on deactivation.
- **Deleted user:**
  - Active rows are ended (`student_deleted` / `counsellor_deleted`).
  - A deleted student's own rows are purged.
  - Ended rows naming a deleted counsellor remain in other students' history.

## 5. Backend API (`convex/counsellorAssignments.ts`)

| Function | Who | Purpose |
|---|---|---|
| `assign` | admin | Assign or reassign one student |
| `assignMany` | admin | Bulk assign/reassign, with per-student outcomes |
| `unassign` / `unassignMany` | admin | Remove assignment(s) |
| `listStudentAssignments` | admin | Roster + current counsellor + totals; search (name, student ID, mobile), status and counsellor filters |
| `listCounsellorUsers` | admin | Counsellors with caseload size (optionally including inactive accounts) |
| `getCounsellorRoster` | admin | One counsellor's students |
| `getStudentAssignmentHistory` | admin | Assignment history for one student |
| `getForStudent` | staff with access | Current counsellor of a student (existing; now also returns `counsellorActive`) |
| `getMyCaseloadSize` | counsellor | Existing |
| `getMyCounsellor` | student | Own assignment only; identity from the session; no arguments |

## 6. Caseload authorization (Feature C)

Enforcement remains server-side in `authz.ts`. Counsellors are scoped to active assignments, and there is no UI-only filtering.

Tests verify each of the following, as counsellor A, counsellor B, after reassignment and after removal:

- **Student-id reads:**
  - `users.getByClerkId`
  - `timeline.getStudentClinicalTimeline`, `dashboard.getPatientTimeline`
  - `screening.getAll`, `screening.getScreeningHistory`
  - `triage.getLatestByUserId`
  - `alerts.getAll`
  - `followUps.getStudentFollowUps`
  - `appointments.getPatientAppointments`
  - `counsellorRequests.getStudentCounsellorRequests`
  - `counsellorAssignments.getForStudent`
- **Record-id reads:** `screening.getAttemptById`, `triage.getTriageWithAttempt`, `alerts.getAlertProvenance`, `followUps.getFollowUpById`, `counsellorRequests.getRequestById`.
- **Writes:** `alerts.acknowledgeAlert`, `followUps.markComplete`, `triage.unblockPatient`, `dashboard.addTimelineEvent`.
- **Lists:** `users.listPatients`, `users.searchPatientSelector`, `dashboard.getAlerts`, `followUps.listAllFollowUps`, `appointments.listAllAppointments`, `appointments.listAllTwoWayAppointments`.

Results:

- Counsellor A can use all of them for an assigned student.
- Counsellor B is refused on all of them, including when passing A's record ids directly.
- After reassignment, the previous counsellor is refused and the new one sees the same history.
- Unassigned students are visible to admins only.

There is no admin bypass beyond what existed. Admins keep institution-wide access, as before.

## 7. Student profile integration (Feature D)

A **My Counsellor** section sits in the existing Profile tab, above Account Details. It uses the existing card and theme styles.

- **Data:** reactive `useQuery(api.counsellorAssignments.getMyCounsellor)`, so the section updates live when an admin reassigns the student.
- **States** (pure logic in `common/myCounsellorState.ts`, unit-tested):
  - **Assigned:** name, "Counsellor" badge, "Your counsellor since …", approved contacts if any, and a "Request a session" button that opens the existing Appointments screen.
  - **Unassigned:** the exact wording from the specification.
  - **Unavailable:** shown when the counsellor's account is deactivated.
  - **Loading:** spinner.
  - **Offline/error:** "We couldn't load your counsellor right now…". A missing answer is never shown as "unassigned".
  - **Session problem:** "Please sign in again…".
  - An error boundary keeps a crash in this section from breaking the profile screen.
- **Privacy:**
  - The query takes no student argument.
  - It returns only the display name, role, assignment date and directory contacts.
  - Verified absent from the response: the counsellor's login mobile number, account email, internal ids, and any screening, triage or alert data.

## 8. Tests run (verified)

- **New backend file:** `npx vitest run convex/counsellor_assignments.test.ts` → **27 passed**.
  - Covers assignment, bulk, reassignment, removal, idempotency, concurrency, invalid combinations, partial failure, cap, non-admin refusal, roster views, caseload authorization across endpoints, reassignment access transfer, clinical-record preservation, safety hand-over, the safety fallback for a deactivated counsellor, student profile states, and the deletion cascade.
- **New mobile file:** `npx vitest run common/myCounsellorState.test.ts` → **6 passed**.
- **Mutation checks:**
  - With the deletion change removed, the "deleting a counsellor" test fails.
  - With the safety-recipient fix reverted, the deactivated-counsellor safety test fails.
- **Full suite:** `npx vitest run` → **75 files, 1263 tests passed, 0 failed.**

## 9. Builds and type checks (verified)

- `npx tsc --noEmit -p .` (mobile app): clean.
- `npx tsc --noEmit -p convex`: clean.
- `cd dashboard && npx tsc -b`: clean.
- `cd dashboard && npm run build`: succeeds.
- `EXPO_PUBLIC_CONVEX_URL=https://example.convex.cloud CI=1 npx expo export --platform android`: Android bundle builds.
- Dashboard lint:
  - New and changed files are clean.
  - The whole `src` has 140 pre-existing errors, the same count before and after this change.
- The Assignments page was rendered in Chromium with mocked data and screenshotted:
  - roster and totals;
  - reassignment confirmation;
  - partial-failure report.

## 10. Limitations and decisions to confirm

- **Counsellor contact details for students.**
  - There is no "approved for student visibility" setting on counsellor accounts. Their mobile number is a login identifier, so the student view shows neither the account mobile nor the account email.
  - Email and phone are shown only from an **active staff-directory entry (`counsellors` table) linked to the counsellor's account via `userId`**.
  - Nothing in the current UI creates that link. Its admin page (`dashboard/src/pages/Counsellors.tsx`) is not routed. Until the link is set, students see the name, role, assignment date and the "Request a session" button.
  - Decide which contact fields are approved for students, and add a way to link directory entries to counsellor accounts.
- **Safety alerts for unassigned students** still notify every active counsellor and all admins (existing behaviour, kept for safety).
  - Those counsellors receive the notification text but cannot open the student's records.
  - If notifications should go to admins only, that is a one-line change in `getStaffRecipientsForStudent`; it needs a clinical decision.
- **Previous counsellor's notifications:** after reassignment, notifications already in their inbox stay. Opening the student from them is refused.
- **Institutions:** the data model has no institution entity; `campus` is free text. Assignments cannot be restricted by institution. The deployment is treated as single-institution, as before.
- **Roster size:** `listStudentAssignments` loads the newest 2,000 students and returns up to 500 matching rows. The page says so when truncated. Very large institutions would need cursor pagination.
- **Inactive students** cannot be assigned. Reactivate them first.
- **Translations:** new strings were added in English only. Hindi, Tamil and Telugu fall back to English through the existing i18n fallback.
- **Not tested on a device:** there is no Android SDK or emulator in this environment.
  - The mobile section is verified by type check, Android bundle export and unit tests of its state logic.
  - It has not been rendered on a phone, and no live deployment was exercised.

## 11. Deployment steps

1. Deploy the Convex backend (`npx convex deploy`). The schema change only adds optional fields and indexes; Convex builds the indexes on deploy, and no data migration is needed.
2. Deploy the dashboard build and ship the mobile app as usual. Deploy the backend first: the new dashboard page and the profile section call functions that only exist after step 1.
3. Existing students are unaffected. Unassigned students remain visible only to admins until assigned on the new **Assignments** page.

Local tests passing does not show the production deployment is secure or ready. Verify the deployed configuration separately.
