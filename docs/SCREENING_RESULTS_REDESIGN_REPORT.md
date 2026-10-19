# Post-Screening Results Redesign: Implementation and Verification Report

Scope: the student-facing experience after the PHQ-9, GAD-7 and PQ-16 screening. The presentation changed. Clinical logic, triage, alerting and access control did not.

## 1. Original flow (audit)

### Data flow

1. **Questionnaire.** `app/(auth)/screening.tsx` lists the three checks and renders each one with `components/screening/Questionnaire.tsx`. Answers are saved as a draft in SecureStore (`screening_progress_<userId>`) after every answer.
2. **Submission.** When all three checks are complete, Submit calls `api.screening.submitScreeningAttempt` once. The only guard against a second submission was the `isSubmitting` React state, which swaps in a loading view.
3. **Server, in one Convex transaction** (`convex/screening.ts`):
   - authoritative scoring in `clinicalScoring.score*Responses`, rejecting incomplete or invalid responses;
   - triage via `evaluateClinicalTriage`: `suicide_flag` if PHQ-9 item 9 > 0, then `psychosis_flag` if PQ-16 ≥ 6, then `severe` if PHQ-9 or GAD-7 ≥ 15, then `moderate` (10–14), otherwise `mild`;
   - a longitudinal check adds an `escalation` alert when PHQ-9 or GAD-7 rises by more than 5;
   - inserts the `triages` row and the `screeningAttempts` row, and links them both ways;
   - `insertSafetyAlert` (in `convex/alerts.ts`) inserts the alert with provenance (`source`, `sourceId`, `attemptId`, `triageId`) and immediately writes one notification per recipient from `authz.getStaffRecipientsForStudent`:
     - recipients are admins plus the assigned counsellor, or every counsellor if the student is unassigned, excluding inactive accounts;
     - suicide and psychosis alerts are `critical_risk` at `critical` priority; others are `safety_alert` at `high`;
   - a `screening_review` follow-up timed from the triage level, and `screeningComplete = true`.
4. **Client after success.** The draft is deleted and the app goes straight to Home with `from=screening`.
   - Emoty shows a generic "Thanks for finishing your check-in."
   - **There was no outcome-specific feedback or next step.**
   - The triage-based text in `utils/insights.ts` is computed on Home but only displayed while screening is incomplete, so after screening it never appears.
5. **`suicide_flag`.** `app/(auth)/(tabs)/_layout.tsx` reads `triage.getLatest` and, while the latest level is `suicide_flag`, replaces the tabs with a full-screen crisis view. It has:
   - a red "Safety Priority" title and the approved sentence;
   - a red emergency-call button, the Tele-MANAS call, the emergency-contact call and "Talk to Counsellor Now" (which creates a counsellor request);
   - a grounding exercise;
   - closing it records `recordEmergencyScreenDismissal`.
6. **Failure.** A failed submission returned the student to the questionnaire list with **no message**. The answers were kept, because the draft is deleted only on success.
7. **Offline.** Convex keeps the mutation pending until it reconnects, so the loading view stays with no explanation.

### Files responsible

| File | Role |
|---|---|
| `app/(auth)/screening.tsx` | Questionnaire list and submission |
| `components/screening/Questionnaire.tsx` | One questionnaire |
| `convex/screening.ts` | `submitScreeningAttempt` |
| `convex/clinicalScoring.ts` | Scoring and triage rules |
| `convex/alerts.ts` | `insertSafetyAlert` |
| `convex/authz.ts` | Recipient selection |
| `app/(auth)/(tabs)/_layout.tsx` | Crisis screen |
| `app/(auth)/(tabs)/index.tsx`, `common/emotyPresence.ts` | Home and Emoty lines |

## 2. Changes

| File | Change |
|---|---|
| `common/screeningOutcome.ts` (new) | Pure presentation mapping, from stored triage level to student outcome, copy keys and next steps. Also contains `resultScreenState`, which keeps loading, offline and missing results separate from every outcome. No scoring or alerting. |
| `convex/screening.ts` | New read-only query `getMyResultSummary`. It takes no arguments and resolves identity from the session, so it only covers the caller's own latest **completed** attempt. It returns `{status, outcome, completedAt}` only: no scores, ids, triage labels or alert data. `submitScreeningAttempt` is **unchanged**. |
| `app/(auth)/screening-result.tsx` (new) | Calm results screen: Emoty, one card with heading, body, a primary action and secondary actions, and a quiet helpline line. It has loading, offline, missing and error-boundary states, uses the base palette (no mood theme, no red) and never shows scores. It only reads; it writes nothing. |
| `app/(auth)/screening.tsx` | **Submission:** a synchronous `useRef` guard against double taps before re-render. **Navigation:** goes to the results screen after a successful submit, instead of Home. **Failure:** a calm message and a "Try again" button, with the answers kept. **Offline:** a "Waiting for a connection" note on the loading view. Payload, scoring and order of operations are unchanged. |
| `app/(auth)/(tabs)/_layout.tsx` | Crisis screen, presentation only. The red "Safety Priority" title is now a calm heading in normal text colour ("Your safety matters most right now."), and the emergency button uses the standard primary style instead of red. The approved sentence, every action, the order of actions, the counsellor request and the dismissal record are unchanged. |
| `common/emotyPresence.ts` | New `screening_result` scene: Emoty shows a calm expression (never "celebrating") and no extra line. |
| `i18n/locales/en.json` | `screening.result.*` and `screening.submit.*` strings. |
| `common/screeningOutcome.test.ts`, `convex/screening_results.test.ts` (new) | Tests (section 6). |
| `convex/counsellor_contact_approval.test.ts` | Fixed a time-dependent assertion from the previous change (see section 6). |

## 3. Student-facing messages per existing outcome

**Mild → "steady"**
- Heading: "Thank you for checking in."
- Body: "Your answers have been saved. Taking time to notice how you feel is a good step. How we feel can change from week to week, so check in again whenever you like, and reach out if things start to feel harder."
- Primary action: Go to my wellbeing space.
- Secondary actions: Explore support options; Talk to a counsellor.
- Helpline line underneath.

**Moderate → "support"**
- Heading: "You deserve support, too."
- Body: "Some of your answers suggest that you may be going through a difficult time. You don't have to figure everything out on your own. Talking to a counsellor or someone you trust could help."
- Primary action: **Talk to a counsellor**, which opens the existing Appointments screen.
- Secondary actions: Explore support options; Go to my wellbeing space.
- Helpline line underneath.

**Severe or psychosis_flag → "priority_support"**
- Heading: "You don't have to handle this alone."
- Body: "Your answers suggest that you're experiencing difficulties that deserve attention. Speaking with a counsellor soon could help you work through what is happening and find the right support."
- Primary action: **Connect with a counsellor**.
- Secondary actions: Explore support options; Go to my wellbeing space.
- Helpline line underneath.

**suicide_flag → "immediate_safety"**
- Heading: "Your safety matters most right now."
- Body: the existing approved sentence, "We're concerned for your safety. If you're in danger now, please call emergency services immediately.", followed by "You don't have to go through this alone. You can also call Tele-MANAS on 14416 to talk to someone, at any time."
- Primary action: **Call emergency services (112)**.
- Secondary actions: Call Tele-MANAS (14416); More ways to get support. The last one opens the tabs, where the existing crisis screen (with "Talk to Counsellor Now" and the emergency contact) appears as before.
- No wellness activity is offered in place of crisis guidance.

**Helpline line** (all non-crisis outcomes): "If you ever feel unsafe, you can call Tele-MANAS on 14416 at any time, or 112 in an emergency."

**Other states**
- Loading: "Preparing your summary…"
- Offline: "Your answers are saved. We can't load your summary right now; it will appear when you're back online."
- Missing summary: "…we couldn't show your summary here…"
- Render error: a calm message and a way home.
- None of these states shows the "steady" message.
- Any triage level not in the table maps to "support", never to "steady".

## 4. How it stays calm without weakening escalation

- **The alert happens before the screen.**
  - The alert, the staff notifications, the follow-up and the triage record are all written inside `submitScreeningAttempt`, before the app receives a response.
  - The results screen opens only afterwards, and its query is read-only.
  - Nothing depends on the student tapping a button, opening a link or staying on the screen. A test asserts that the database is byte-identical before and after reading the summary.
- **The mapping only reads.** It reads the stored triage level and cannot change it, the alert type, priority or recipients.
  - Levels are never merged downwards: severe and psychosis both get the highest non-crisis tier.
  - Unknown levels fall back to "support", not "steady".
- **Crisis guidance is kept, not replaced.**
  - For `suicide_flag`, the existing crisis screen still appears on the tabs exactly as before, apart from the heading text and colours.
  - The results screen additionally puts the emergency and helpline calls first.
- **Nothing alarming on screen.** There are no scores, severity labels, instrument names or diagnostic words on the student screen, and no red.

## 5. Alert creation and recipient paths inspected

| Path | Behaviour | Changed? |
|---|---|---|
| `screening.submitScreeningAttempt` | Scoring, triage, attempt, alert, follow-up and completion in one transaction | No |
| `clinicalScoring.evaluateClinicalTriage` | Level and alert type | No |
| `alerts.insertSafetyAlert` | Alert with provenance, plus a notification per recipient (type and priority by alert type) | No |
| `authz.getStaffRecipientsForStudent` | Admins plus the assigned active counsellor; every active counsellor if unassigned or if the assigned counsellor is inactive; inactive accounts excluded | No |
| `alerts.recordEmergencyScreenDismissal`, `counsellorRequests.create` (`emergency_modal`) | Crisis-screen actions | No |
| `authz.assertCanAccessStudent` | Notification recipients still need caseload access to open records | No |

## 6. Tests and builds (actual results)

**Tests**

| Command | Result |
|---|---|
| `npx vitest run common/screeningOutcome.test.ts` | **12 passed** |
| `npx vitest run convex/screening_results.test.ts` | **14 passed** |
| `npx vitest run` | **78 files, 1,308 tests passed, 0 failed** |

`common/screeningOutcome.test.ts` covers:
- the level-to-outcome mapping, including missing and unknown levels;
- the copy for every outcome: present, with no diagnostic, score or alarming words, and the agreed wording;
- the low-concern copy making no "you are fine" claim;
- the actions for each outcome;
- the crisis outcome keeping the approved sentence, which also remains on the emergency screen;
- Emoty never "celebrating";
- loading, offline and missing never mapping to an outcome;
- the results screen being read-only, with no scores or red;
- the guarded single submit, the draft deleted only on success, and retry on failure;
- the crisis screen keeping every action and the dismissal record.

`convex/screening_results.test.ts` runs the real submit mutation for every triage level. It checks:
- exactly one attempt, triage record and follow-up per submission;
- the same alert type (or none) as before, with provenance;
- the summary outcome, and that reading it changes nothing;
- an escalation alert still firing while the student sees "steady";
- the latest check-in winning;
- no scores, ids, labels or counsellor details in the summary;
- students seeing only their own summary and no staff alerts;
- assigned recipients and critical priority;
- unassigned recipients (all active counsellors and admins, never a deactivated counsellor);
- a notification granting no access;
- reassignment keeping alerts, triages and attempts identical, with the new counsellor seeing the existing alert.

**Mutation check:** with `severe` temporarily mapped to "steady", 3 tests fail.

**Pre-existing test fixed:** the earlier contact-approval privacy test asserted that the digits "41" (a fixture age) never appear anywhere in the response JSON. The `assignedAt` timestamp contained "41" on today's date, so the test failed independently of this change. It now checks the counsellor object for the age. The exact-keys assertion beside it still forbids extra fields.

**Type checks and builds**
- `npx tsc --noEmit -p .`, `npx tsc --noEmit -p convex` and `cd dashboard && npx tsc -b`: clean.
- `EXPO_PUBLIC_CONVEX_URL=https://example.convex.cloud CI=1 npx expo export --platform android`: succeeds (5.56 MB). The bundle contains the results route, `getMyResultSummary` and the new copy.
- `cd dashboard && VITE_CONVEX_URL=https://example.convex.cloud npx vite build`: succeeds (dashboard code unchanged).

## 7. Unresolved concerns

1. **Clinical review of the copy.** The new wording, especially the "steady" body and the second crisis paragraph, needs approval from the clinical lead. The crisis sentence itself is the existing one.
2. **The submit response still exposes internals.** `submitScreeningAttempt` still returns `triageId`, `followUpId`, `triageLevel`, the flags and the per-instrument results to the student's client.
   - The app ignores them, and the new screen does not use them.
   - Removing them changes the mutation's contract, which existing tests and `scripts/verify-deployment.mjs` rely on, so it was not done in this UI task.
   - The student can also already read their own triage record through `triage.getLatest`, which the app uses for the crisis gate. Restricting both is a follow-up that needs a decision.
3. **No server-side idempotency key.** Duplicate submissions are prevented in the client only, by the new synchronous guard plus the existing loading view. The server has only a rate limit (5 per minute).
   - Two deliberate submissions within a minute would create two attempts and, if flagged, two alerts. This is existing behaviour.
   - A server-side dedupe could suppress a legitimate quick re-submission, so it needs a product and clinical decision.
4. **Forced-retest banner.** The banner on the questionnaire list ("Your counselor or doctor has requested a required re-screening test") still uses a red icon and text. It is shown before the questionnaire, so it was left unchanged here.
5. **English only.** The new strings are in English; Hindi, Tamil and Telugu fall back to English.
6. **Not tested on a device.** The new screen was verified by type checks, unit tests and the Android bundle export. It has not been rendered on a phone or emulator (none is available here), and no deployed environment was exercised.

## 8. What was not changed

- Questionnaire items, options, instructions and order.
- Scoring, thresholds, the triage rules and the longitudinal escalation rule.
- `submitScreeningAttempt`: its arguments, its transaction, what it writes and what it returns.
- Alert creation, alert types, priority, recipients, provenance, timestamps and audit records.
- Counsellor-request creation, the emergency-screen dismissal record, and the force-retest redirect.
- Authorization rules and the counsellor-assignment features.
- The crisis screen's guidance, actions and their order (only the heading text and two colours changed).
- No deployment, environment-variable change, website publish or mobile release.
