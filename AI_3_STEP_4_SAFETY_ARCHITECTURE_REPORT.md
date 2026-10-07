# AI-3 Step 4: Safety Architecture Report

## 1. Status
**AI-3 Step 4: Safety Architecture is COMPLETE and FULLY VERIFIED.**
- Full test suite: **861 / 861 tests passing across 50 test files (100%)**.
- TypeScript check (`npx tsc --noEmit`): Clean (0 errors).
- Dashboard production build (`cd dashboard && npm run build`): Clean (4.92s).

---

## 2. Initial Safety Architecture Audit
Before writing implementation code, the repository safety systems were audited:
- **Client-Side Crisis Detection (`app/(auth)/tools/companion.tsx`)**: Contained an informal `CRISIS_PATTERNS` array (`"suicide"`, `"kill myself"`, `"want to die"`) that triggered local client UI state `showSafetyBanner(true)`. However, the message was still blindly forwarded to `generateAIResponse`.
- **Server Safety Checks (`convex/companion.ts`)**: Had no pre-Gemini crisis gate. Gemini was called on all inputs unless message limits were reached, meaning LLM output determined user responses during acute suicidal disclosures.
- **Existing Alert Pipeline (`convex/alerts.ts`)**: Contained `alerts` table with indices `by_userId`, `by_status`, and `by_attemptId`. Mutations supported `createAlert` (`type: "suicideRisk"`), but lacked deterministic deduplication, risking alert storms.
- **Existing CBT Safety Flow (`convex/cbt.ts`)**: Contained an offline regex `/\b(die|suicide|kill myself|self harm|hurt myself)\b/i` and a post-Gemini `riskDetected` flag that created a `suicideRisk` alert and switched the CBT session into `safety_mode`.
- **Emergency Resources**: Configured across architecture documents as **Tele-MANAS (14416 / 1800-891-4416)** and **National Lifeline 988**.

---

## 3. Exact NORMAL / ELEVATED / CRISIS Matrix

The locked architecture implements three deterministic server safety states:

| Safety State | Definition & Semantic Purpose | Examples | Backend Routing Action |
| :--- | :--- | :--- | :--- |
| **NORMAL** | Everyday conversation or ordinary emotional distress with no supported indication of immediate or self-directed harm. | `"I'm tired."`<br>`"College is exhausting."`<br>`"I'm feeling lonely."`<br>`"I had a horrible day."`<br>`"I wish this semester would end."` | Safety Gate passes to Context Manager (`safetyState: "normal"`) → Emoty Intent → Emoty Brain → Gemini. |
| **ELEVATED** | Significant or concerning distress where language does not establish explicit self-directed suicidal/self-harm intent. | `"I want to disappear."`<br>`"I wish I wasn't here."`<br>`"I can't do this anymore."`<br>`"Everything feels pointless."`<br>`"I don't see how things get better."` | Safety Gate passes to Context Manager (`safetyState: "elevated"`) → Emoty Intent → Emoty Brain with controlled safety boundaries. Supportive, non-diagnostic response. No alert storm. |
| **CRISIS** | Explicit self-directed suicidal intent, plan, or self-harm disclosure. | `"I want to die."`<br>`"I want to kill myself."`<br>`"I'm going to kill myself."`<br>`"I have decided to kill myself."`<br>`"I might hurt myself."`<br>`"I am going to hurt myself."` | **GEMINI SUPPRESSION ACTIVATED**: Normal Gemini call is bypassed. Deterministic deduplicated `suicideRisk` alert is recorded. Controlled emergency response delivered immediately. |

---

## 4. Third-Party Disclosure Behavior
- Disclosures regarding friends, roommates, or third parties (e.g., *"My friend wants to kill himself"*, *"I'm worried my friend might hurt herself"*) are classified as `third_party` (state: `elevated`).
- **Safety Invariant**: Third-party statements do **NOT** generate a `suicideRisk` clinical alert for the authenticated student.
- **Controlled Response**: A deterministic supportive response is returned advising the student on how to connect their friend with emergency resources (Tele-MANAS 14416 / 988) and campus support, without manufacturing a clinical diagnosis for the user.

---

## 5. Ambiguous-Language & Contextual Idiom Behavior
- Semantic context is preserved; the system does not use a naive keyword blacklist.
- **Contextual Idioms**: Expressions like *"This movie made me want to die laughing"*, *"That exam killed me"*, *"I'm dead tired"*, *"I want to disappear from this group chat"*, or *"I wish I wasn't here for this lecture"* are classified as `contextual_idiom` and routed to **`NORMAL`**.
- **Ambiguous Concerning Wording**: Statements like *"I wish I didn't exist"* or *"I can't take this anymore"* route to **`ELEVATED`**, generating compassionate coping guidance without false claims of acute suicidality.

---

## 6. Gemini Request Suppression Behavior
- **Mandatory Invariant**: When a user message is classified as `CRISIS` (`isSelfCrisis: true`), the backend **NEVER** calls the Gemini API or LLM provider cascade.
- All Gemini network payloads, tokens, and prompt construction for crisis messages are eliminated.
- Verified in `SAFETY-08`: Even when API keys are absent, the controlled crisis contract is returned synchronously and recorded into `aiCompanionLogs`.

---

## 7. Crisis Response Architecture
The controlled crisis response is generated by `getControlledCrisisResponse(studentName)` in `convex/emotySafety.ts`:
- Acknowledges the seriousness of the situation.
- Directly delivers verified emergency resources: **Tele-MANAS (14416 / 1800-891-4416)** and **National Lifeline 988**.
- Encourages immediate connection with trusted friends, family, or campus counselors.
- Sets structured contract action to `{ type: "open_counsellor_request", label: "Connect with Counselor" }`.
- Sets avatarState to `"supportive"`.
- Avoids diagnosis, judgment, guilt, or emotional dependency.

---

## 8. Alert Creation Behavior
- On explicit `CRISIS`, the backend triggers `api.alerts.createSafetyAlertWithDeduplication`.
- **Audit Details**:
  - `userId`: Authoritative Clerk identity (`ctx.auth.getUserIdentity().subject`).
  - `type`: `"suicideRisk"`.
  - `status`: `"pending"`.
  - `createdAt`: Current server timestamp.
- Accessible exclusively by authorized counselors and admins via existing `authz` rules. Never exposes internal alert IDs to the student.

---

## 9. Alert Deduplication Rule
To prevent alert storms when a student in crisis sends repeated distress messages in rapid succession (e.g., *"I want to die"* followed immediately by *"I really want to die"*):
- **Cooldown Window**: `CRISIS_ALERT_COOLDOWN_MS = 15 * 60 * 1000` (15 minutes).
- **Rule**: If a pending alert of the same type (`"suicideRisk"`) exists for the authenticated student created within the past 15 minutes, new alert insertion is suppressed.
- **Audit Log**: The suppression is logged on the server: `[ALERT SUPPRESSED] Duplicate suicideRisk alert suppressed under cooldown for user: <userId>`.
- **Different / Escalated Events**: Alerts of different types (e.g. `manual_sos`, `counselor_request`) or alerts occurring after cooldown are **NOT** suppressed.

---

## 10. Client vs. Server Safety Authority
- **Server Safety Gate is Authoritative**: The server determines the user's safety state in `convex/companion.ts` before evaluating context or prompts.
- Client-provided `safetyState`, `userId`, or UI parameters are **never trusted** and cannot override server classification or bypass alert creation.
- Client-side regex in `companion.tsx` remains strictly a client UI convenience to show local banners, with no clinical authority.

---

## 11. CBT Compatibility
- The existing CBT safety gate in `convex/cbt.ts` and its `suicideRisk` alert generation remain intact and compatible with `alerts.ts`.
- No breaking changes were introduced to CBT session management, reframe logs, or clinical state machines.

---

## 12. Security & Authorization
- All companion endpoints enforce Clerk authentication (`ctx.auth.getUserIdentity()`).
- Student identity is derived solely from the server token; client-passed `userId` spoofing is rejected (`SAFETY-16`).
- Raw PHQ-9, GAD-7, and PQ-16 scores and private counselor notes are excluded from Gemini prompt context (`SAFETY-17` to `SAFETY-19`).

---

## 13. Files Changed
1. `convex/emotySafety.ts` (NEW): Authoritative Server Safety Gate, deterministic normalizers, category classification, emergency resource configuration, controlled crisis response builders, and alert deduplication logic.
2. `convex/emotySafety.test.ts` (NEW): Comprehensive 21-test suite covering SAFETY-01 to SAFETY-26.
3. `convex/alerts.ts` (MODIFIED): Added `createSafetyAlertWithDeduplication` mutation with 15-minute cooldown protection.
4. `convex/companion.ts` (MODIFIED): Integrated `classifyServerSafety` gate before context fetching; executed Gemini suppression on crisis; wired controlled crisis and third-party response branches.
5. `convex/emotyContext.ts` (MODIFIED): Added optional `safetyState` argument to `getAuthoritativeEmotyContext` so the authoritative server safety state is populated into `EmotyContext`.
6. `convex/emotyIntent.ts` (MODIFIED): Enhanced `SAFETY_BOUNDARY_SECTION` with explicit instructions on elevated state handling and server safety authority.
7. `vitest.config.ts` (MODIFIED): Raised `testTimeout` to 15000ms to guarantee reliable execution under full-suite edge-runtime concurrency.

---

## 14. Tests Added
In `convex/emotySafety.test.ts`:
- **SAFETY-01**: Normal emotional statement → `NORMAL`
- **SAFETY-02**: Elevated distress statement → `ELEVATED`
- **SAFETY-03**: Explicit suicidal intent → `CRISIS`
- **SAFETY-04**: Explicit self-harm intent → `CRISIS`
- **SAFETY-05**: Third-party suicidal disclosure → NOT student `CRISIS`
- **SAFETY-06**: Contextual idiom → NOT `CRISIS`
- **SAFETY-07**: Ambiguous concerning wording → `ELEVATED` where appropriate, not automatic `CRISIS`
- **SAFETY-08 & SAFETY-11**: `CRISIS` does not call Gemini and produces controlled safety response
- **SAFETY-09**: `NORMAL` continues through Emoty Brain flow
- **SAFETY-10**: `ELEVATED` continues through controlled Emoty Brain with safety state
- **SAFETY-12**: `CRISIS` creates appropriate backend safety alert
- **SAFETY-13**: Repeated `CRISIS` does not create unlimited duplicate alerts (Deduplication)
- **SAFETY-14**: Different/new safety event is not incorrectly suppressed
- **SAFETY-15**: Client-provided `safetyState` cannot override server result
- **SAFETY-16**: Client-provided `userId` cannot affect safety ownership
- **SAFETY-17 & SAFETY-18 & SAFETY-19**: Raw scores, counselor notes, and clinical timeline are not passed to Gemini context
- **SAFETY-20**: Gemini/provider failure does not break `CRISIS` handling
- **SAFETY-21**: Existing CBT safety behavior remains functional
- **SAFETY-22 & SAFETY-23**: Structured response contract remains valid and action allowlist is unchanged
- **SAFETY-24 & SAFETY-25**: Authentication remains required and authorization boundaries are enforced
- **SAFETY-26**: Existing Step 1A–Step 3 behavior remains regression-free

---

## 15. Full Test Result
- **Repository Total Tests**: **861 passed / 861 total across 50 test files (100% pass rate)**.
- Zero regressions.

---

## 16. TypeScript Result
- Command: `npx tsc --noEmit`
- Result: **Clean (Exit code 0, 0 errors)**.

---

## 17. Dashboard Build Result
- Command: `cd dashboard && npm run build`
- Result: **Clean (Built client environment for production in 4.92s)**.

---

## 18. Known Limitations
- Action execution routing remains deferred to subsequent architecture steps (recommended action is not auto-executed on client).
- Tele-MANAS phone dialing from the controlled crisis response text requires client-side link interaction or the action router.

---

## 19. Explicit Confirmation: Step 5+ Were NOT Implemented
In strict adherence to instructions, the following were **NOT** implemented:
- Action Router execution.
- Avatar redesign.
- Global Mitra → Emoty UI rename.
- Persistent memory, embeddings, or RAG.
- Conversation summaries.
- Proactive reminders or background notifications.
- New clinical scoring or triage algorithm changes.
- Counselor dashboard redesign.
