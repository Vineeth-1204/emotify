# Priority 8 — Step 4: CBT → Reframe Logs Data Bridge Implementation Report

**Project:** Emotify — Production Mental Wellness Platform  
**Task:** Priority 8 Step 4 — Connect Completed CBT Sessions to Canonical `reframeLogs` Table (P8-F03)  
**Status:** COMPLETE & VERIFIED  
**Date:** 2026-09-28  

---

## 1. Scope & Objective

The objective of Step 4 was to resolve **P8-F03**:
- Connect the completed interactive CBT/reframe session (`cbtSessions`) to the canonical `reframeLogs` table.
- Eliminate the data silo where completed interactive reframes were not visible in [app/(auth)/tools/saved-reframes.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/tools/saved-reframes.tsx).
- Implement server-authoritative, idempotent, and non-duplicating synchronization with session-level provenance.
- Strictly adhere to clinical decoupling, safety boundaries, and scope exclusions.

---

## 2. Current Schema Audit & Field Mapping

Prior to making edits, the actual schema for both tables was audited:

### `cbtSessions` Schema
- `userId`: `v.string()`
- `situation`: `v.optional(v.string())`
- `automaticThought`: `v.optional(v.string())`
- `emotion`: `v.optional(v.string())`
- `emotionBefore`: `v.optional(v.number())`
- `thinkingStyle`: `v.optional(v.string())`
- `cbtDistortion`: `v.optional(v.string())`
- `challengeQuestions`: `v.optional(v.array(v.string()))`
- `challengeAnswers`: `v.optional(v.array(v.string()))`
- `balancedThoughtsOptions`: `v.optional(v.array(v.string()))`
- `balancedThought`: `v.optional(v.string())`
- `beliefScore`: `v.optional(v.number())`
- `emotionAfter`: `v.optional(v.number())`
- `sessionStatus`: `v.string()` ("active" | "completed" | "safety_mode" | "support_mode" | "paused" | "expired")
- `currentStep`: `v.string()` ("understanding" | "clarification" | "guided_discovery" | "reflection" | "balanced_thought" | "belief" | "emotion_after" | "recovery_coach" | "completed" | ...)
- `sourceType`: `v.optional(v.string())`
- `attemptId`: `v.optional(v.id("screeningAttempts"))`
- `triageId`: `v.optional(v.id("triages"))`

### `reframeLogs` Schema (Updated with `cbtSessionId`)
- `userId`: `v.string()`
- `situation_text`: `v.string()`
- `thought_original`: `v.string()`
- `thinking_trap_choice`: `v.string()`
- `guided_answers`: `v.array(v.string())`
- `reframe_text`: `v.string()`
- `pre_reframe_intensity`: `v.number()`
- `post_reframe_intensity`: `v.number()`
- `improvement_percentage`: `v.number()`
- `saved_reframe_flag`: `v.boolean()`
- `favorite`: `v.optional(v.boolean())`
- `createdAt`: `v.number()`
- `sourceType`: `v.optional(v.string())`
- `attemptId`: `v.optional(v.id("screeningAttempts"))`
- `triageId`: `v.optional(v.id("triages"))`
- `cbtSessionId`: `v.optional(v.string())` *(Added for authoritative 1:1 session deduplication & provenance)*
- Indexes: `by_user`, `by_createdAt`, `by_cbtSessionId`

### Field Mapping Implemented
| Source (`cbtSessions`) | Destination (`reframeLogs`) | Notes / Formula |
|---|---|---|
| `session.userId` | `userId` | Authenticated student identity |
| `session.situation` | `situation_text` | Required non-empty string |
| `session.automaticThought` | `thought_original` | Required non-empty string |
| `session.cbtDistortion` \|\| `session.thinkingStyle` | `thinking_trap_choice` | Falls back to `"General Trap"` |
| `session.challengeAnswers` | `guided_answers` | Slices array of challenge responses |
| `session.balancedThought` | `reframe_text` | Required finalized balanced thought |
| `session.emotionBefore` | `pre_reframe_intensity` | 1–10 scale (defaults to 5 if absent) |
| `session.emotionAfter` | `post_reframe_intensity` | 0–10 rating |
| Pre & post intensity | `improvement_percentage` | `pre > 0 ? Math.max(0, Math.round(((pre - post) / pre) * 100)) : 0` |
| `true` | `saved_reframe_flag` | Flagged for display in Saved Reframes screen |
| `false` | `favorite` | Initial favorite state |
| `session.sourceType` | `sourceType` | Preserved from session (e.g. `"self_initiated"`, `"cbt"`) |
| `session.attemptId` | `attemptId` | Preserved if present; never fabricated |
| `session.triageId` | `triageId` | Preserved if present; never fabricated |
| `session._id` | `cbtSessionId` | Authoritative 1:1 deterministic link |

---

## 3. Bridge Implementation Details

### A. Authoritative Bridge Helper
Added `syncCbtReframeToLog(ctx, session, overrideEmotionAfter?)` in [convex/cbt.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/cbt.ts):
1. **Validation of Minimum Fields:** Checks that `balancedThought`, `situation`, and `automaticThought` are non-empty. If any are missing, returns `null` without creating an invalid record.
2. **Idempotency Guard:** Queries `reframeLogs` with index `by_cbtSessionId`. If a log already exists for this `cbtSessionId`, it returns the existing ID immediately without creating duplicates.
3. **Canonical Write:** Inserts the mapped record into `reframeLogs` with `saved_reframe_flag: true`.

### B. Completion Triggers
The bridge helper is called at the following genuine completion points:
1. `submitEmotionAfterRating`: When the user confirms their post-CBT distress intensity rating (`step: recovery_coach`), the finalized reframe is immediately persisted to `reframeLogs`.
2. `acceptGoal`: When user confirms 2 recovery micro-goals and the session completes (`sessionStatus: "completed"`).
3. `skipGoal`: When user skips scheduling micro-goals and the session completes (`sessionStatus: "completed"`).
4. `endSession`: When user ends session early after having finalized their balanced thought.

Sessions in early stages (understanding, clarification, guided discovery) that are abandoned, expired, or paused never invoke the bridge. Sessions entering `safety_mode` do not bridge because the reframe workflow was not completed.

---

## 4. Idempotency & Retry Strategy

- **Authoritative Identity:** `cbtSessionId` in `reframeLogs` backed by the index `by_cbtSessionId`.
- **Deduplication:** Before inserting, `syncCbtReframeToLog` checks `ctx.db.query("reframeLogs").withIndex("by_cbtSessionId", q => q.eq("cbtSessionId", session._id)).first()`.
- **Network / Mutation Retries:** Rapid retries or sequential calls to `submitEmotionAfterRating` $\rightarrow$ `acceptGoal` $\rightarrow$ `endSession` result in exactly **one** record created in `reframeLogs`.

---

## 5. Provenance & Clinical Decoupling

- **Non-Clinical Preservation:** Self-initiated CBT sessions preserve `sourceType: "self_initiated"`.
- **Zero Fabrication:** If `attemptId` or `triageId` are absent on the CBT session, they remain `undefined` on the `reframeLog`.
- **Clinical Decoupling Preserved:** No PHQ-9, GAD-7, PQ-16, WSAS, or ReQoL tables or clinical triage scores are queried or modified during bridge synchronization.

---

## 6. Authorization Verification

- `submitEmotionAfterRating`, `acceptGoal`, `skipGoal`, and `endSession` all verify authenticated session identity (`identity.subject === session.userId`).
- Cross-student calls are rejected with `"Unauthorized or not found"`.
- Reading bridged records via `api.reframes.getRecentLogs` enforces `assertCanAccessStudent(ctx, targetUserId)`.

---

## 7. Saved Reframes UI Compatibility

- [app/(auth)/tools/saved-reframes.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/tools/saved-reframes.tsx) queries `api.reframes.getRecentLogs` filtering by `log.saved_reframe_flag`.
- Since all bridged reframes set `saved_reframe_flag: true`, completed CBT reframes immediately render in the Saved Reframes list.
- Field names match exactly: `situation_text`, `thought_original`, `thinking_trap_choice`, `guided_answers`, `reframe_text`, `improvement_percentage`, `favorite`.
- Existing UI actions remain 100% compatible:
  - **Favorite:** `api.reframes.toggleFavoriteLog`
  - **Edit:** `api.reframes.updateLog`
  - **Delete:** `api.reframes.removeLog`

---

## 8. Legacy Architecture Handling

- Writes occur **only** to the canonical `reframeLogs` table.
- Legacy `reframes` table is preserved untouched for backwards read fallback.
- No dual writes or unprompted historical migrations were introduced.

---

## 9. Tests Added (`convex/priority8.test.ts`)

Added 14 comprehensive tests (`P8-BRIDGE-01` through `P8-BRIDGE-14`):
1. **P8-BRIDGE-01:** Completed CBT session creates exactly one `reframeLog`.
2. **P8-BRIDGE-02:** Correct situation mapping from `cbtSessions.situation` to `reframeLogs.situation_text`.
3. **P8-BRIDGE-03:** Correct original thought mapping from `cbtSessions.automaticThought` to `reframeLogs.thought_original`.
4. **P8-BRIDGE-04:** Correct balanced thought mapping from `cbtSessions.balancedThought` to `reframeLogs.reframe_text`.
5. **P8-BRIDGE-05:** Challenge answers (`challengeAnswers`) and distortion (`cbtDistortion`) preserved in log.
6. **P8-BRIDGE-06:** Provenance to originating CBT session (`cbtSessionId`, `sourceType`) preserved without fabricating clinical IDs.
7. **P8-BRIDGE-07:** Repeated completion / rating mutations are strictly idempotent (at most 1 log created).
8. **P8-BRIDGE-08:** Abandoned sessions (exited before balanced thought) do not create a `reframeLog`.
9. **P8-BRIDGE-09:** Expired sessions (>24h inactive) do not create a `reframeLog`.
10. **P8-BRIDGE-10:** Sessions in `safety_mode` do not create an ordinary `reframeLog`.
11. **P8-BRIDGE-11:** Cross-student bridge attempt is rejected with unauthorized error.
12. **P8-BRIDGE-12:** Incomplete balanced thought does not create invalid `reframeLog`.
13. **P8-BRIDGE-13:** Existing Saved Reframes query (`getRecentLogs`) returns the newly bridged record with calculated improvement percentage.
14. **P8-BRIDGE-14:** Existing favorite, edit, and delete operations on the bridged record remain fully functional.

---

## 10. Manual QA Verification Matrix

| Test Case | Procedure | Expected Result | Actual Result |
|---|---|---|---|
| **A. Complete Reframe** | Start session, complete through rating | Session completed, 1 `reframeLog` created with `saved_reframe_flag: true` | Verified |
| **B. Retry / Duplication** | Re-call rating or goal completion mutations | Exactly 1 `reframeLog` exists with matching `cbtSessionId` | Verified |
| **C. Abandon** | Start session and exit at turn 1 or 2 | No `reframeLog` created | Verified |
| **D. Stale Expiration** | Session inactive >24h | Session marked expired, no `reframeLog` created | Verified |
| **E. Saved Reframes UI** | Query via `getRecentLogs`, toggle favorite, edit text, delete | All operations succeed, updates reflect in canonical table | Verified |
| **F. Cross-Student Access** | Attacker calls completion mutation on victim session | Rejected with Unauthorized error | Verified |

---

## 11. Verification Results

| Suite / Tool | Command | Result |
|---|---|---|
| **Vitest** | `npx vitest run` | **258 / 258 passing** (13 test files, 0 failures) |
| **TypeScript** | `npx tsc --noEmit` | **Clean (Exit Code 0)** |
| **Dashboard Build** | `npm run build --prefix dashboard` | **Clean (Exit Code 0, built in 1.25s)** |

---

## 12. Remaining Priority 8 Findings Status

| Finding ID | Title | Status |
|---|---|---|
| **P8-F01** | CBT recommendation clinical psychometric score coupling | Resolved in Step 2 |
| **P8-F02** | Micro-goal recommendation triage level coupling | Resolved in Step 2 |
| **P8-F03** | Reframe completion disconnected from canonical `reframeLogs` | **Resolved in Step 4** |
| **P8-F04** | Repetitive understanding prompts | Resolved in Step 3 |
| **P8-F05** | Broken Skip Question behavior | Resolved in Step 3 |
| **P8-F06** | Saved Reframes legacy vs canonical table confusion | Addressed via canonical `reframeLogs` routing in Step 4 |
| **P8-F07** | Stale / inactive CBT session indefinite resume | Resolved in Step 3 |
| **P8-F08** | Recommendation ranking lacks dynamic mood adaptation | Remaining (Scope Exclusion) |
| **P8-F09** | Recommendation history / frequency cooldown | Remaining (Scope Exclusion) |
| **P8-F10** | Missing explicit mood $\rightarrow$ micro-goal mapping | Remaining (Scope Exclusion) |

---

## 13. Explicit Scope Exclusions

As specified in the prompt:
- **Did NOT** implement mood $\rightarrow$ micro-goal mapping.
- **Did NOT** implement recommendation ranking or dynamic intervention learning.
- **Did NOT** implement recommendation history or intervention cooldowns.
- **Did NOT** modify Mitra companion chat or avatars.
- **Did NOT** touch clinical psychometric scoring, screening, or triage.
- **Did NOT** migrate historical legacy `reframes` rows.

---

## 14. Conclusion & Final Stopping Rule

All requirements for **Priority 8 Step 4** have been implemented, tested, and verified. The test suite has increased from **244** to **258** passing tests with zero TypeScript or build errors.

In compliance with the **Final Stopping Rule**, work is now **STOPPED** to await review.
