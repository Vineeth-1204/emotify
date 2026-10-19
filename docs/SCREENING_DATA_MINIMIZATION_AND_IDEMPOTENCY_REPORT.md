# Screening Data Exposure Audit and Server-Side Idempotency (Phase 2)

Follow-up to [SCREENING_RESULTS_REDESIGN_REPORT.md](./SCREENING_RESULTS_REDESIGN_REPORT.md). That report left two concerns open (§7.2 and §7.3):
- the student's client could read clinical internals;
- duplicate submissions were prevented only in the client.

This change closes both on the server. Branch `claude/blissful-knuth-04nxs0`. Nothing was deployed.

Not changed: questionnaire items, scoring, thresholds, triage rules, the escalation rule, alert types, priority, recipients, provenance, crisis guidance, and the force-retest flow.

## 1. Vulnerable paths found

Every public function a signed-in student could call that returned screening attempts, triages, flags, scores, follow-ups or alerts was traced, together with its real call sites in the mobile app (`app/`, `components/`, `context/`, `hooks/`, `services/`, `utils/`, `common/`) and the dashboard (`dashboard/src`).

| Path | What a student could read before | Used by the mobile app? |
|---|---|---|
| `screening.submitScreeningAttempt` (response) | `attemptId`, `triageId`, `followUpId`, `triageLevel`, `suicideFlag`, `psychosisFlag`, full per-instrument `results` (scores, severity, item 9) | Called; response ignored |
| `triage.getLatest` | Own full triage row (level, flags, ids) | **Yes**: crisis gate (`(tabs)/_layout.tsx`), Home (`index.tsx`), `AvatarContext` |
| `triage.getLatestByUserId`, `triage.getTriageWithAttempt` | Own triage + full attempt | No (dashboard only) |
| `screening.getLatest` | Own totals, item-9 flag and score, attempt id | **Yes**: Home wellbeing cards |
| `screening.getAll` | Own full history with totals | **Yes**: Profile → export CSV |
| `screening.getLatestAttempt`, `getLatestRawAttempt`, `getScreeningHistory`, `getAllAttempts`, `getAttemptById`, `getAttemptWithTriage`, `getAttemptAlerts` | Item-level responses, scores, triage, alerts | No |
| `alerts.getPending`, `alerts.getAll`, `getAlertProvenance`, `getTriageAlerts` | Own alert rows: risk type, priority, provenance ids, staff acknowledgement metadata | No |
| `dashboard.getAlerts` | Own alerts plus alerts *synthesised from the latest triage* ("suicideRisk", ...) | No (dashboard only) |
| `dashboard.getActivityFeed` | Own alert items ("Suicide Risk Detected", status) | No (dashboard only) |
| `timeline.getStudentClinicalTimeline`, `dashboard.getPatientTimeline` | The full clinical timeline (screening, triage, alerts, provenance) | No |
| `counsellorRequests.getStudentCounsellorRequests`, `getRequestById` | Full request rows incl. triage/attempt links and staff fields | No (students use `getMyRequests`) |
| `followUps.getStudentFollowUps` | Follow-ups incl. `attemptId`, `triageId`, `appointmentId`, `sourceType`, `counselorId` | **Yes**: Appointments screen |
| `followUps.getFollowUpById`, `getFollowUpsByAppointmentId` | Full follow-up rows | No |

Cross-student access was already refused by `assertCanAccessStudent`. The exposure was the student's **own** clinical internals, readable by calling these functions directly regardless of what the UI showed.

## 2. API response changes and affected callers

### 2.1 Staff-only clinical reads (server-enforced)

Each function below now starts with `await requireCounselorOrAdmin(ctx)`. Students get `Unauthorized: Counselor or Admin access required.`; unauthenticated callers get `Unauthenticated: Login required.` Counsellors are still limited to their caseload by the existing `assertCanAccessStudent` check that follows. Staff responses are byte-for-byte unchanged.

- `screening`: `getLatestAttempt`, `getLatestRawAttempt`, `getScreeningHistory`, `getAllAttempts`, `getAttemptById`, `getLatest`, `getAll`, `getAttemptWithTriage`, `getAttemptAlerts`
- `triage`: `getLatestByUserId`, `getLatest`, `getTriageWithAttempt`
- `alerts`: `getPending`, `getAll`, `getAlertProvenance`, `getTriageAlerts`
- `timeline`: `getStudentClinicalTimeline`
- `dashboard`: `getPatientTimeline`
- `counsellorRequests`: `getStudentCounsellorRequests`, `getRequestById`
- `followUps`: `getFollowUpById`, `getFollowUpsByAppointmentId`

Two dashboard list queries keep their argument-less contract (the dashboard calls them with `{}`):
- `dashboard.getAlerts` returns `[]` for a student, the same as for an unauthenticated caller.
- `dashboard.getActivityFeed` returns a student's own emotion-log and micro-goal items only, with no alert items.

**Dashboard callers** (`screening.getAll`, `triage.getLatestByUserId`, `alerts.getPending`, `timeline.getStudentClinicalTimeline`, `counsellorRequests.getStudentCounsellorRequests`, `followUps.getStudentFollowUps` with `userId`, `dashboard.getAlerts`, `dashboard.getActivityFeed`) all run as staff and are unaffected. No dashboard code changed.

### 2.2 `screening.submitScreeningAttempt`

- New optional argument `submissionKey: string` (see §3).
- **Student caller.** Returns exactly `{ status: "submitted", outcome, replayed }`.
  - `outcome` is `"steady" | "support" | "priority_support" | "immediate_safety"`, from the existing `outcomeForTriageLevel` mapping.
- **Staff caller** submitting for an assigned student. Returns the previous full shape (`attemptId`, `attemptType`, `screeningId`, `triageId`, `followUpId`, `triageLevel`, `suicideFlag`, `psychosisFlag`, `results`) plus `outcome` and `replayed`.
- Affected callers:
  - `app/(auth)/screening.tsx` (ignored the response; still does);
  - `scripts/verify-deployment.mjs` (updated, §2.4);
  - tests (updated, §5).

### 2.3 New minimal student endpoints (identity from the session only; no arguments)

| Endpoint | Returns | Replaces in the app |
|---|---|---|
| `triage.getMySafetyStatus` | `{ crisis, forceRetest, elevatedSupport }` (booleans), or `null` for non-students | `triage.getLatest` in `(tabs)/_layout.tsx` (crisis gate, force-retest redirect, screening-complete check), `index.tsx`, `AvatarContext.tsx` |
| `screening.getMyWellbeingIndicators` | `{ emotionalBalance, mindCalmness }`, each `{ percent, badge, badgeTone, barTone }`, or `null` | `screening.getLatest` on Home |
| `screening.exportMyScreenings` | `[{ completedAt, phq9Total, gad7Total, pq16Total, phq9Item9 }]` | `screening.getAll` in Profile → export |
| `screening.getMyResultSummary` (from the previous task) | `{ status, outcome, completedAt }` | — (results screen) |

Notes on the new endpoints:
- **Safety status levels.** `crisis` means the latest triage is `suicide_flag`. `forceRetest` means it is `force_retest`. `elevatedSupport` means it is `severe`, `suicide_flag` or `psychosis_flag`; Home and the avatar used exactly this test before.
- **Wellbeing bands.** The bands and colours are the ones Home computed on the client before:
  - PHQ-9: ≤4, ≤9, ≤14; badge colour red if ≥10; bar ≤9 green, ≤14 amber.
  - GAD-7: ≤4, ≤9, ≤14; badge colour red if ≥10; bar ≤7 green, ≤12 amber.
- **Wellbeing display change.** Home used to show "100%" when there was no screening; it now hides the cards until a check-in exists.
- **Export.** It contains the student's own totals and their own item-9 answer, which is their data. It has no triage levels, flags, alert data or ids.

### 2.4 Other changed contracts

- **`followUps.getStudentFollowUps`, student caller.** Returns only `{ _id, type, dueDate, completed, status, completedAt, selfInitiated }`.
  - `selfInitiated` replaces `sourceType === "self_initiated"` in `tools/appointments.tsx`.
  - Staff still get full rows.
- **`counsellorRequests.create` and `grounding.logSession`.** The crisis screen no longer receives triage ids. Instead, for `sourceType` `emergency_modal` (student caller) and `crisis_blocker`, the server links the student's latest triage itself (`latestTriageIdFor`), so request and grounding provenance stays the same.
  - An explicit `triageId` is still accepted and validated as before.
  - Other sources never get an automatic link.
- **`scripts/verify-deployment.mjs`.** The safety block now:
  - submits with a `submissionKey`;
  - asserts the minimal response (`outcome === "immediate_safety"`, no `triageLevel` or `attemptId`);
  - checks `getMySafetyStatus.crisis`;
  - checks the `screening_review` follow-up via `getStudentFollowUps`;
  - checks that a same-key replay returns `replayed: true`.

## 3. Idempotency design

### Key generation, scoping, persistence and retention

- **Generation.** The client creates the key with `expo-crypto` `Crypto.randomUUID()`.
  - The server accepts `^[A-Za-z0-9_-]{16,128}$` and rejects anything else with `Invalid submission key.` before writing.
- **Scope.** The key is scoped by `(userId, key)`. `userId` is the student the attempt is recorded for: the session subject, or the assigned student when staff submit.
  - Two students with the same key never collide.
  - A student can never replay or retrieve another student's submission: the lookup is inside their own scope, and naming another student as `userId` is refused by `assertCanAccessStudent`.
- **Persistence.** New table `screeningSubmissions`:
  - fields: `{ userId, key, fingerprint, attemptId, triageId, followUpId, createdAt }`;
  - index: `by_user_and_key`;
  - `fingerprint` is the SHA-256 of the responses in canonical sorted-key form, so item order does not matter.
- **Retention.** Rows live as long as the account. They are added to the user-deletion purge (`USER_OWNED_TABLES` in `convex/users.ts`), so they are removed with the rest of the student's data.
  - One small row per completed check-in, the same order of size as `screeningAttempts`.
  - No time-based expiry. A key is meaningful only until the client clears it, and keeping the row means a very late retry still cannot duplicate.

### Server flow (one Convex mutation, one transaction)

1. Authenticate; resolve `userId` (staff → assigned-student check).
2. If `submissionKey` is present:
   - validate its format;
   - compute the fingerprint;
   - read `screeningSubmissions` by `(userId, key)`.
3. If a row exists:
   - **Same fingerprint:** return the original outcome with `replayed: true`. Nothing is written. No new attempt, triage, follow-up, alert or notification; no rate-limit token is used; the user record is not touched.
   - **Different fingerprint:** reject with "This submission was already recorded with different answers. Start a new check-in instead." Nothing is written.
4. Otherwise, run the existing flow unchanged:
   - rate limit;
   - score and validate (incomplete or invalid responses are rejected);
   - triage;
   - escalation check;
   - triage and attempt records;
   - safety alert and staff notifications (`insertSafetyAlert`, same recipients);
   - follow-up;
   - **insert the `screeningSubmissions` row**;
   - mark screening complete.
5. Return the minimal or staff response with `replayed: false`.

### Why this is transaction-safe

- **The lookup and the insert are one transaction.** Step 3's indexed read and step 4's key-row insert run inside the same Convex mutation, and Convex mutations are serializable (optimistic concurrency control).
  - The read of the `by_user_and_key` range `(userId, key)` is in the transaction's read set.
  - If a concurrent same-key mutation commits a row in that range first, this transaction conflicts and Convex re-runs it.
  - The re-run sees the committed row and takes the replay path.
  - So at most one logical assessment is created per `(userId, key)`, with no client lock, timestamp window or separate check-then-insert step.
- **No partial records on failure.** A failure anywhere (validation, rate limit, an error while alerting) aborts the whole transaction: no partial records and no key row, so the key is not "burned" and the same key can be retried with valid answers.
- **Retry after a committed timeout.** If the first request committed but its response was lost, the client retries with the same key. The row exists, so the retry returns `replayed: true` and creates nothing.

### Client draft and key lifecycle (`common/screeningSubmissionKey.ts`, `app/(auth)/screening.tsx`)

| Event | Draft answers | Submission key |
|---|---|---|
| Student answers or changes an answer | Saved (SecureStore) | **Cleared**: different answers mean a different submission |
| Student presses Submit | Kept | Reused if saved, else created and saved *before* the request |
| Request fails, times out, or the app is killed | Kept | **Kept**: the retry (or the next launch) sends the same key |
| Server confirms | Deleted | **Cleared**: the next check-in is a genuine reassessment with a new key |

- Keys are stored per user (`screening_submission_key_<userId>`), so a shared device cannot mix students.
- A corrupted saved key is replaced. A storage read failure falls back to a fresh key rather than blocking submission.
- The existing synchronous `submittingRef` guard and the error/retry UI from the previous task remain.

### Compatibility and the rate limit

- `submissionKey` is optional. Older app builds that do not send it behave exactly as before: no dedupe, rate limit only.
- The rate limit (5 per minute) is unchanged and still applies to every *new* submission. Replays return before it, so a retrying client cannot lock itself out, and a replay cannot be used to create records.

## 4. Schema changes

`convex/schema.ts` adds one table; no existing table or field changed:

```ts
screeningSubmissions: defineTable({
  userId: v.string(), key: v.string(), fingerprint: v.string(),
  attemptId: v.id("screeningAttempts"), triageId: v.id("triages"), followUpId: v.id("followUps"),
  createdAt: v.number(),
}).index("by_user_and_key", ["userId", "key"]),
```

The table is additive and needs no migration or backfill. Existing attempts simply have no key row.

## 5. Tests (actual results)

### New tests

**`convex/screening_minimization_idempotency.test.ts` (25 tests).**

*Task A (data minimization):*
- All 22 staff-only reads (23 calls, since `screening.getLatest` is also called with no arguments) refuse a student, even for their own records.
- The same 23 calls refuse another student and an unauthenticated caller.
- Admin and the assigned counsellor still read them; a counsellor outside the caseload is refused.
- `dashboard.getAlerts` and `getActivityFeed` contain no alert data for students; staff views are unchanged.
- The student submit response is exactly `{status, outcome, replayed}`.
- Staff submitting for a student still get the full response.
- `getMySafetyStatus`:
  - contains three booleans only;
  - covers each level (`suicide_flag` opens the crisis gate; `severe`; `moderate`; `force_retest`);
  - returns `null` for unauthenticated and staff callers;
  - is not affected by other students.
- `getMyWellbeingIndicators`: bands only, with no score, triage, flag or id strings; own data only.
- `exportMyScreenings`: exact keys; own rows only.
- `getStudentFollowUps`: students get only the allowed keys; staff still get `attemptId` and `triageId`.
- Urgent-safety navigation: the emergency counsellor request and the crisis grounding log get the student's triage id on the server; a routine log gets none.
- Source scan: no file in the mobile app calls any staff-only read; the app uses `getMySafetyStatus` and `getMyWellbeingIndicators`.

*Task B (idempotency):*
- Same key ×4 gives one attempt, triage, follow-up, alert and notification set; replays are identical apart from `replayed: true`.
- **Retry after a committed request whose response was lost:**
  - no duplicate alert or notification;
  - the `critical_risk` recipients are exactly the admin and the assigned counsellor;
  - the crisis gate stays on.
- Four concurrent same-key deliveries (`Promise.all`) give one assessment and three replays.
- A new key gives a genuine reassessment (`baseline` → `reassessment`).
- Different students using the same key, with the same or different answers, get independent records, and neither sees the other's result.
- The same key with different answers is rejected with no writes.
- Answer order does not change the fingerprint.
- Malformed keys (empty, short, spaces, 129 characters, path-like) are rejected with no writes.
- Incomplete, out-of-range and missing-instrument responses are rejected with zero records, and the key is not burned.
- The rate limit still applies to new submissions; 8 replays do not use it up.
- With no key (old builds), every call is recorded as before.
- Staff replays return the same `attemptId`; a student naming another student is refused.
- Key rows are in the deletion purge list.

**`common/screeningSubmissionKey.test.ts` (6 tests).**
- The key is reused across retries.
- It is cleared after confirmation, so the next check-in gets a new key.
- Keys are per user.
- A corrupted saved key is replaced; an invalid generated key is refused.
- A storage failure falls back to a fresh key.
- The screen wiring creates the key with `Crypto.randomUUID()`, clears it when answers change and after success before navigating, and does not clear it on failure.

### Existing tests updated for the new contract

These tests were updated in 26 files. No test was skipped or deleted, and every cross-student or unauthenticated denial is still a denial. Some denial assertions now accept the staff-only message as well as the old one.

- **Student-allow tests became student-refused.** Tests that asserted "a student can read their own record through `<staff read>`" now assert the refusal and that an admin can still read it:
  - `AUTH-02`;
  - `authz` test 1;
  - `TIMELINE-01`;
  - `TIMELINE-CARE-01`;
  - `LONG-02`/`LONG-03`;
  - `PROV-01`;
  - `REQUEST-FLOW-08`, where the student still gets status via `getMyRequests`;
  - `REASSESS-03` and `P11-5A-SCR-01`, which gained a student-refusal check while their data checks now run as an admin.
- **Dashboard alert-list tests** now expect `[]` for students: `ALERTS-01` and `P11-5D-AUTH-01`/`-02`. In the CBT safety tests (`cbt`, `P8-DECOUPLE-09`), alert creation is now checked in the database.
- **Tests that read ids or levels from the student's submit response** now read the stored records (`test-utils/screening.ts` `latestSubmission`) or use an admin viewer (`staffViewer`).
- **Two tests that previously passed without testing anything** (`FOLLOWUP-PROV-07`, `P9-JPMR-MEDIA-08`) now use real ids. In both, an undefined id had compared equal to undefined.

The assignment, contact-approval, counsellor-authorization and safety-recipient suites (`counsellor_assignments`, `counsellor_contact_approval`, `screening_results`, `remediation_top10`) all pass.

### Results

| Check | Result |
|---|---|
| `npx vitest run` | **80 files, 1339 tests passed, 0 failed** (previous commit: 1308) |
| `npx tsc --noEmit -p .` (app) | 0 errors |
| `npx tsc --noEmit -p convex` | 0 errors |
| `cd dashboard && npx tsc -b` | 0 errors |
| `EXPO_PUBLIC_CONVEX_URL=https://example.convex.cloud CI=1 npx expo export --platform android` | Succeeds (5.56 MB Hermes bundle; contains `getMySafetyStatus`, `getMyWellbeingIndicators`, `exportMyScreenings`, `submissionKey`) |
| `cd dashboard && VITE_CONVEX_URL=https://example.convex.cloud npx vite build` | Succeeds (dashboard source unchanged) |
| `node --check scripts/verify-deployment.mjs` | OK |

### Mutation testing

Each mutant was applied to production code, the relevant new test file was run, and the original was restored. **All 20 mutants were killed.** (A first attempt at the follow-up mutant matched an unrelated line, so it changed nothing and is not counted; it was re-targeted.)

| Mutant | Failing tests |
|---|---|
| Key lookup skipped | 7 |
| Fingerprint ignored | 1 |
| Key scope made global (not per student) | 7 |
| Full response returned to students | 3 |
| Key row never inserted | 11 |
| Rate limit moved before replay | 1 |
| Key format check removed | 1 |
| `screening.getLatest` staff guard removed | 2 |
| `triage.getLatest` staff guard removed | 2 |
| Crisis gate always off | 2 |
| Follow-ups untrimmed for students | 1 |
| Previous (weaker) follow-up trimming restored | 1 |
| `dashboard.getAlerts` returns alerts to students again | 1 |
| No server-side crisis-blocker provenance | 1 |
| No server-side emergency-request provenance | 1 |
| Key table missing from the deletion purge | 1 |
| Client: saved key never reused | 2 |
| Client: key not per user | 2 |
| Screen clears the key on failure | 1 |
| Screen keeps the key when answers change | 1 |

## 6. Limitations

1. **Concurrency is proven by design, not by a live race.**
   - `convex-test` runs mutations one at a time, so the concurrent test checks the serialized outcome: one assessment and three replays.
   - The protection against truly interleaved requests is Convex's serializable OCC over the `(userId, key)` index read plus the insert in the same mutation (§3).
   - Nothing was exercised against a deployment (network access to `*.convex.cloud` is blocked here, and no deploy was allowed).
2. **Old app builds get no dedupe.** Without `submissionKey` the server behaves as before. Making the key mandatory would break installed builds, so it should wait for a forced app update.
3. **Wellbeing percentages are coarse.** Home shows `round((max − score) / max × 100)`, which can be inverted to the PHQ-9 and GAD-7 totals.
   - This is the minimum the existing Home cards need, and the totals are the student's own.
   - Removing them is a product decision (for example, showing badges only).
   - The export likewise keeps the student's own totals and item-9 answer.
4. **Fingerprint mismatch on the same key is rejected, not merged.**
   - The app never sends this, because changing an answer clears the key.
   - A client bug that did would see an error asking for a new check-in, and nothing would be recorded twice.
5. **Not verified on a device or deployment.** The checks are unit, integration and mutation tests, type checks and bundle builds.
   - `scripts/verify-deployment.mjs` covers the new contract for when a non-production deployment is available.
   - Staff dashboards were not exercised in a browser; their code and queries' staff responses are unchanged.
6. **Rows from earlier task periods are not keyed.** Historical attempts have no `screeningSubmissions` row. This only means they cannot be replayed, which is correct.

## 7. Not changed

- Questionnaire items, scoring, thresholds, triage rules and the longitudinal escalation rule.
- Alert creation, alert types, priority, recipients (`getStaffRecipientsForStudent`), provenance and notifications.
- Crisis guidance and actions, the emergency-dismissal record, and the force-retest redirect (now driven by `getMySafetyStatus.forceRetest`).
- Staff responses of every staff API; dashboard source code.
- No deployment, no production environment-variable change, no dashboard publish, no mobile release.
