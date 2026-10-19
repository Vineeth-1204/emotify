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
- `cd dashboard && npm run build`: succeeds. **Correction (follow-up):** this command was run without `VITE_CONVEX_URL`. In that case `src/main.tsx` throws at start-up and Vite removes the rest of the app as unreachable code, so that build proved compilation only. The follow-up re-ran the build with `VITE_CONVEX_URL` set and confirmed the pages are in the bundle (section 12.6).
- `EXPO_PUBLIC_CONVEX_URL=https://example.convex.cloud CI=1 npx expo export --platform android`: Android bundle builds.
- Dashboard lint:
  - New and changed files are clean.
  - The whole `src` has 140 pre-existing errors, the same count before and after this change.
- The Assignments page was rendered in Chromium with mocked data and screenshotted:
  - roster and totals;
  - reassignment confirmation;
  - partial-failure report.

## 10. Limitations and decisions to confirm

- **Counsellor contact details for students:** resolved in the follow-up. Admins approve each field explicitly; see section 12.
- **Safety alerts for unassigned students:** every active counsellor and all admins are notified. This policy was confirmed and kept unchanged; it is verified by tests in section 12.4.
  - Those counsellors receive the notification text but cannot open the student's records.
- **Previous counsellor's notifications:** after reassignment, notifications already in their inbox stay. Opening the student from them is refused.
- **Institutions:** the data model has no institution entity; `campus` is free text. Assignments cannot be restricted by institution. The deployment is treated as single-institution, as before.
- **Roster size:** `listStudentAssignments` loads the newest 2,000 students and returns up to 500 matching rows. The page says so when truncated. Very large institutions would need cursor pagination.
- **Inactive students** cannot be assigned. Reactivate them first.
- **Translations:** new strings were added in English only. Hindi, Tamil and Telugu fall back to English through the existing i18n fallback.
- **Not tested on a device:** there is no Android SDK or emulator in this environment.
  - The mobile section is verified by type check, Android bundle export and unit tests of its state logic.
  - It has not been rendered on a phone, and no live deployment was exercised.

## 11. Deployment steps

Superseded by section 13 (deployment preparation). Nothing has been deployed.

---

# Follow-up: contact approval and deployment preparation

## 12. Counsellor contact approval

### 12.1 Data model and defaults

The staff-directory table `counsellors` is reused. It already held `email`, `phone` and an optional `userId` link to the counsellor's login account.

New fields, all optional so existing documents stay valid:

| Field | Meaning |
|---|---|
| `shareEmailWithStudents` | Student visibility of the institutional email. Only `true` means approved. |
| `sharePhoneWithStudents` | Student visibility of the institutional phone. Only `true` means approved. |
| `contactApprovalUpdatedAt`, `contactApprovalUpdatedBy` | When and by which admin approvals or links last changed. |

Defaults and rules:

- **New entries** created through `dashboard.addCounsellor` store `false` for both approvals. Their email and phone are format-checked, as they are on edit.
- **Missing values** on legacy entries are treated as not approved (`approvedContacts` checks `=== true`).
- **An approval covers one value for one person.** It is cleared automatically when:
  - the stored email or phone value changes (only that field's approval is cleared);
  - the entry is linked to an account or unlinked.
- **Approving a field requires** a linked account and a non-empty stored value.
- **Nothing is shown** when the entry is not listed (`status` other than `active`), or when an account is linked to more than one entry (legacy duplicates are ambiguous).
- **Revocation is immediate.** Approval is read inside `getMyCounsellor` on every call, so the next response, and every reactive subscriber, drops the field. Hiding it in the UI is not what enforces this.
- **Audit:** every link, unlink, contact change, approval and revocation writes an `auditLogs` entry.

### 12.2 Admin workflow

The existing but previously unrouted counsellor-management page (`dashboard/src/pages/Counsellors.tsx`) is now an admin-only route: **Counsellor directory** at `/counsellors`. No second staff-management interface was created.

1. **Add directory entry.** Enter name, institutional email, institutional phone and role, and optionally link an unlinked counsellor account. New entries share nothing.
2. **Link or unlink.** The account selector lists only counsellor accounts that are not linked to another entry. The server also rejects:
   - non-counsellor accounts;
   - accounts already linked to another entry (one entry per account);
   - relinking an entry that is already linked, which must be unlinked first so an existing link cannot be silently redirected to someone else.
3. **Edit contact.** Email and phone are format-checked. Changing a value hides that field from students until it is re-approved, and the page says so.
4. **Approve or revoke per field.** Each field shows its **stored value** next to its **student visibility**:
   - "Approved": shown to students;
   - "Hidden";
   - "Approved, but not shown": the entry is not listed, or the account is duplicated.
5. **List or unlist** the entry. The page's previous placeholder "Rating 5.0" and "Workload" figures, which were never real data, were replaced by the linked account's real assigned-student count.

All rules are enforced in `convex/counsellorDirectory.ts`, which is admin-only (`requireAdmin`). The page only sends requests.

### 12.3 Student-facing exposure paths checked

| Path | Result |
|---|---|
| `counsellorAssignments.getMyCounsellor` | Returns only the display name, role and assignment date, plus email and phone only when that field is approved. Policy is applied in `counsellorDirectory.approvedContacts`. |
| `counsellorAssignments.getForStudent` | **Fixed.** It was reachable by a student for their own record and returned internal assignment and counsellor ids. It is now staff-only (`requireCounselorOrAdmin`). The student app never used it. |
| `dashboard.getCounsellors` (raw directory) | Staff-only. Students receive `[]` (tested). |
| `counsellorDirectory.*` | Admin-only (tested for counsellor, student and anonymous callers). |
| Other modules (appointments, follow-ups, alerts, timeline, notifications, Emoty context, crisis resources) | A search for `email`, `phone`, `mobile_number` and every read of counsellor accounts or the directory found no other path that returns counsellor contact data to students. Patient phone and email fields there are returned only to staff. |
| Mobile `MyCounsellorSection` | Renders `counsellor.email` and `counsellor.phone` only when the server returns them. When neither is approved, it shows the name, role, assignment date and **Request a session**. Existing loading, unassigned, unavailable, offline and sign-in states are unchanged. |

### 12.4 Safety-alert recipient policy (unchanged, verified)

`getStaffRecipientsForStudent` was not modified in this follow-up. New tests confirm:

- **Unassigned student:** every active counsellor and every admin is notified, and the inactive counsellor is not.
- **Assigned student:** the assigned counsellor and admins are notified.
- **Notification grants no access:** a counsellor notified about an unassigned student is refused on `screening.getAll`, `alerts.getAlertProvenance` and `alerts.acknowledgeAlert`, and their alert list stays empty.
- **Reassignment:** alerts, triages and screening attempts are identical before and after.

Screening, triage and clinical scoring were not changed.

### 12.5 Files changed in the follow-up

| File | Change |
|---|---|
| `convex/schema.ts` | Approval fields on `counsellors` |
| `convex/counsellorDirectory.ts` (new) | Admin directory API (list, link, unlink, edit contact, approve/revoke) and the shared approval policy |
| `convex/counsellorAssignments.ts` | `getMyCounsellor` uses the approval policy; `getForStudent` is staff-only |
| `convex/dashboard.ts` | `addCounsellor` stores explicit `false` approvals and validates an optional account link |
| `convex/_generated/api.d.ts` | Registers the new module (the same entry `npx convex codegen` would generate) |
| `convex/counsellor_contact_approval.test.ts` (new) | 19 tests |
| `convex/counsellor_assignments.test.ts` | Legacy-entry expectation updated to the approval policy; staff-only `getForStudent` check |
| `dashboard/src/pages/Counsellors.tsx`, `App.tsx`, `layouts/DashboardLayout.tsx` | Directory page reworked and routed (admin-only) |
| `scripts/verify-deployment.mjs` | Optional caseload, My Counsellor and approval/revocation check for deployed environments |

### 12.6 Verification results (actual)

**Tests**
- **Contact approval:** `npx vitest run convex/counsellor_contact_approval.test.ts` → **19 passed**.
  - Covers defaults; email only; phone only; both; revocation; legacy missing fields; value change; relink; unlisted and duplicate entries; approval prerequisites; private fields absent; non-admin refusal; students cannot read the directory; invalid or duplicate links; audit; student isolation; safety recipients.
- **Mutation checks:**
  - With `approvedContacts` changed to ignore approvals, 7 of the 19 fail.
  - With the duplicate-link check removed, 1 fails.
- **Assignment and authorization suites:** `counsellor_assignments`, `remediation_top10`, `authorization`, `authz`, `p14_final_security_verification`, `myCounsellorState` → **6 files, 125 passed**.
- **Full suite:** `npx vitest run` → **76 files, 1282 tests passed, 0 failed.**

**Type checks**
- `npx tsc --noEmit -p .` (mobile): clean.
- `npx tsc --noEmit -p convex`: clean.
- `cd dashboard && npx tsc -b`: clean.

**Builds**
- **Dashboard:** `VITE_CONVEX_URL=<url> npx vite build` succeeds.
  - The bundle contains the Counsellor directory, Student assignments and Overview pages.
  - One warning: the main chunk is larger than 500 kB, so Vite suggests code-splitting.
  - **Production builds must set `VITE_CONVEX_URL`.** Without it, the bundle builds "successfully" but contains no app (see the correction in section 9).
- **Android:** `EXPO_PUBLIC_CONVEX_URL=https://example.convex.cloud CI=1 npx expo export --platform android` succeeds (5.54 MB Hermes bundle; contains `getMyCounsellor` and the `myCounsellor` strings).

**Lint and visual checks**
- The new directory page is lint-clean. Pre-existing dashboard lint errors are unchanged.
- The directory page was rendered in Chromium with mocked data: linked and unlinked entries, approved, hidden and "approved but not shown" states.

**Not verified**
- No device or emulator was used.
- No live deployment was exercised.

## 13. Deployment preparation (prepared only, not executed)

### 13.1 Target environments: not confirmed

- **Production Convex deployment.** The repository does not record which Convex deployment production uses:
  - no `.env*` with `CONVEX_DEPLOYMENT` or `EXPO_PUBLIC_CONVEX_URL`;
  - `eas.json` profiles define no environment variables, so they must come from EAS environment variables or secrets;
  - the dashboard has no `.env` and no hosting configuration (Vercel or Netlify).
- **What earlier reports say.** They name `fabulous-rooster-538.convex.cloud` as "production", but the same report synchronised it with `npx convex dev --once`, which targets a *development* deployment. Other deployments appear in older documents (`usable-stork-789`, `graceful-retriever-862`). **The production deployment must be confirmed by the owner** from the Convex dashboard, EAS environment variables and the website's hosting settings before anything is deployed.
- **Live checks could not run from this session:**
  - Requests to `*.convex.site` and `*.convex.cloud` were refused by this environment's network policy (HTTP 403 from the outbound proxy).
  - No verification-account credentials are configured.
- **Consequence.** Items 2 to 6 of the task (JWT/JWKS, login and token flow, unauthenticated-write refusal, deployed caseload authorization, existing assignment and directory data) are **unverified**. The earlier JWT/JWKS and verification-account failures must still be treated as **unresolved**.

### 13.2 Schema compatibility with existing data

- All new fields are `v.optional(...)`. Existing `counsellorAssignments` and `counsellors` documents validate unchanged, and missing approval fields mean "not approved".
- New indexes are `counsellorAssignments.by_active` and `counsellors.by_userId`. Convex backfills indexes during deploy, and no data migration is needed.
- **Existing directory entries** keep their stored email and phone, which stay hidden from students until an admin approves each field.
- **Existing assignments** are unchanged.
- **Before deploying, take a backup or snapshot.** In the Convex dashboard, use Backups, or run `npx convex export --path <file> --prod`. This export only reads data.

### 13.3 Pre-deployment checks (run by the owner, read-only)

```bash
# 1. Confirm the target: in the Convex dashboard, note the project's production deployment
#    name, and check it matches the EAS production EXPO_PUBLIC_CONVEX_URL and the website's VITE_CONVEX_URL.
# 2. Confirm required variables exist on production WITHOUT printing values.
npx convex env list --prod | cut -d= -f1       # expect JWT_PRIVATE_JWK (plus GEMINI_API_KEY / ELEVENLABS_API_KEY if used)
# 3. Public auth endpoints of the production site URL (no secrets involved)
curl -s https://<prod>.convex.site/.well-known/openid-configuration
curl -s https://<prod>.convex.site/.well-known/jwks.json     # one key, kid != "static-key-1", no d/p/q fields
# 4. Full auth and authorization check with DEDICATED verification accounts (never real students)
CONVEX_URL=https://<prod>.convex.cloud \
VERIFY_STUDENT_MOBILE=... VERIFY_STUDENT_PASSWORD=... \
VERIFY_ADMIN_MOBILE=... VERIFY_ADMIN_PASSWORD=... \
node scripts/verify-deployment.mjs
```

What `verify-deployment.mjs` covers:

- **Before the new version is deployed:**
  - OIDC issuer and JWKS rotation;
  - login and token signature;
  - `getCurrentUser`;
  - forged-token refusal;
  - unauthenticated clinical-write refusal;
  - re-login revoking the previous token;
  - logout;
  - deactivation and reactivation.
- **Only after the backend is deployed:** the caseload block (`VERIFY_COUNSELLOR_*`).

Do not use `VERIFY_SAFETY=1` on production; it creates real alerts. Signing in as the admin signs that admin out elsewhere.

**If any check fails, stop.** Fixing JWT/JWKS needs `npx convex env set JWT_PRIVATE_JWK ... --prod`, which is a production environment change. It needs your explicit approval and is not part of this task.

### 13.4 Deployment sequence (for approval)

1. **Backend first.**

   ```bash
   npx tsc --noEmit -p convex && npx vitest run      # must be green on the exact commit
   npx convex deploy                                  # with CONVEX_DEPLOY_KEY for the confirmed prod deployment
   ```

   The old dashboard and app keep working on the new backend: existing functions keep their arguments, and new fields are optional.

2. **Staff website second.**

   ```bash
   cd dashboard
   VITE_CONVEX_URL=https://<prod>.convex.cloud npm run build
   grep -l "Counsellor directory" dist/assets/*.js    # proves the app is in the bundle
   # publish dist/ with the existing hosting process (not identified in the repository)
   ```

3. **Mobile release last.**

   ```bash
   # EXPO_PUBLIC_CONVEX_URL / EXPO_PUBLIC_CONVEX_SITE_URL must be set for the production EAS environment
   eas build --platform android --profile production
   # submit or distribute through the existing release channel after device testing
   ```

   Device testing is still outstanding.

### 13.5 Post-deployment smoke tests

Use dedicated test accounts and a test directory entry linked to the test counsellor.

1. Run `scripts/verify-deployment.mjs` with student, admin and counsellor test accounts, plus `VERIFY_DIRECTORY_ENTRY_ID`. It covers:
   - all auth checks;
   - a counsellor refused for an unassigned student and allowed once assigned;
   - **My Counsellor** shows the counsellor without login details;
   - approving the email shows it, and revoking it hides it on the next read.

   It then restores the previous assignment and approval state. A previous assignment to a now-deactivated counsellor is restored as "unassigned".
2. **Admin, Assignments page:**
   - assign the test student, bulk-assign two test students, reassign one, remove one;
   - confirm the confirmation dialog, the outcome message and the totals.
3. **Counsellor:** the dashboard lists only the assigned test students. Opening another student by URL is refused.
4. **Student app:**
   - Profile → My Counsellor shows the counsellor;
   - after an admin reassignment, it updates without restarting;
   - after unassignment it shows the unassigned message;
   - offline mode shows the error state, not "unassigned".
5. **Contact approval:**
   - approve email only, then phone only, and check the student sees exactly the approved field;
   - revoke, and the field disappears on the next refresh of the screen;
   - edit the stored email, and it is hidden until re-approved.
6. **Safety-alert delivery:**
   - verify on a non-production deployment (`VERIFY_SAFETY=1`, or a test student's PHQ-9 item 9);
   - for an unassigned test student, every active counsellor and admin receives the alert notification, and a deactivated counsellor does not;
   - none of the notified counsellors can open the student.

## 14. Confirmation

No production changes were executed. Specifically:

- no `convex deploy`;
- no `convex env set`;
- no client URL changes;
- no website publish;
- no mobile build or release;
- no requests reached any Convex deployment (network access to Convex hosts is blocked in this session).

All verification above is local: unit and integration tests with `convex-test`, type checks, builds and browser renders with mocked data. Local results do not show the production deployment is secure or ready.
