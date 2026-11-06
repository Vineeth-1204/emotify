# AI-3 Step 10: Production Hardening, Rate Limiting & Telemetry Integration Report

**Status:** COMPLETE & VERIFIED  
**Date:** October 5, 2026  
**Auditor / Implementer:** Antigravity AI Engineering  
**Scope:** AI Companion Subsystem (`convex/companion.ts`, `convex/emotyRateLimiter.ts`, `convex/emotyTelemetry.ts`, `convex/emotySafety.ts`, `convex/emotyContract.ts`, `convex/emotyFallback.ts`, `convex/emotyActionRouter.ts`, `convex/emotyMemory.ts`, `convex/schema.ts`, `android/`)

---

## 1. Status

AI-3 Step 10 is **COMPLETE**. All 22 production hardening, rate limiting, and telemetry tests pass. All 181 tests across the entire AI Companion suite pass. The full repository test suite (58 test files, 1,030 tests) passes. TypeScript compiles with 0 errors. Convex backend functions and schema have been synchronized to `fabulous-rooster-538.convex.cloud`. The dashboard builds successfully. The Android production release APK has been built cleanly.

---

## 2. Read-Only Audit Findings

A complete read-only audit was conducted prior to implementation and documented in `AI_3_STEP_10_PRODUCTION_HARDENING_AUDIT.md`. Key findings:
1. **Critical Safety Gate Inversion:** The previous message count check (`todayCount >= 20`) in `companion.ts` occurred *before* the server safety gate (`classifyServerSafety`). A student reaching 20 messages who then expressed suicidal intent had their request aborted by a `ConvexError`, preventing counselor crisis alerts and emergency hotline delivery.
2. **Rate Limit Bypass via "Clear Chat":** Message counts were calculated dynamically by querying `aiCompanionLogs`. Tapping "Clear Chat" wiped the user's chat logs, resetting their counter to 0 and permitting unlimited Gemini calls.
3. **Concurrency Race Condition:** No in-flight mutex or burst rate limit existed. Rapid parallel requests could all read the same message count and fire concurrent Gemini calls.
4. **Console Log Data Leakage:** On model parse or validation failure, `console.warn` printed the full raw model output (`generatedRawText`), risking exposure of personal conversation text in ephemeral server logs.
5. **Absence of Telemetry:** No structured telemetry existed to monitor provider health, latencies, error types, fallback rates, or safety interventions.

---

## 3. Existing Protections Preserved

- **Server-Authoritative Safety Gate (`classifyServerSafety`):** Deterministic keyword + contextual idiom classification.
- **Action Router Allowlist (`validateAndResolveAction`):** Strict action mapping and safety filtering.
- **Avatar State Normalization (`resolveAvatarPresentationState`):** Procedural SVG presentation engine.
- **Non-Sensitive Memory Architecture (`detectMemoryCandidate`):** Model has zero memory write access; only explicit safe user preferences are recorded.
- **Multi-Turn Structured Offline Fallback (`buildStructuredFallbackResponse`):** Rich conversational fallback when Gemini is unavailable.
- **Session Identity (`ctx.auth`):** All queries, mutations, and actions strictly enforce session authentication.

---

## 4. Concrete Production Gaps Remediated

| Vulnerability / Gap | Prior Implementation | Hardened Step 10 Implementation |
|---|---|---|
| **Safety Bypass by Rate Limit** | Rate limit checked at line 379 $\rightarrow$ Safety Gate at line 391 | `classifyServerSafety` evaluated FIRST. Crisis/Third-party requests bypass rate limits completely. |
| **Clear-Chat Counter Reset** | Derived from `aiCompanionLogs` query | Stored in dedicated `companionRateLimits` table; immune to chat clearing. |
| **Burst Flooding** | No burst limit (only 20/day) | Multi-tier rate limiting: max 10 requests / 60 seconds. |
| **Concurrent Request Flooding** | No in-flight lock | Atomic in-flight concurrency lock (1 active request per user). |
| **Unbounded Provider Timeout** | 25s timeout per model $\times$ 3 models = 75s cascade | Bounded timeout: 12s per model with immediate abort on timeout. |
| **Log Privacy Leak** | `console.warn` printed `generatedRawText` | Sanitized logs; raw model text removed from console warnings. |
| **Missing Observability** | Ephemeral console output only | Privacy-first `aiTelemetryLogs` table tracking latencies, paths, error codes, and statuses. |

---

## 5. Threat Model (Scenarios A through Q)

- **A. Normal heavy usage:** Supported by 50 messages/day limit.
- **B. Accidental rapid repeated requests:** Rejected by burst limiter (10 msgs/min) and in-flight concurrency lock.
- **C. Client retry loops:** Rejected with `RATE_LIMITED_BURST` without consuming provider credits.
- **D. Malicious request flooding:** Throttled server-side by `companionRateLimits`.
- **E. Multiple devices for same account:** Shared server-authoritative rate-limit row keyed by `userId`.
- **F. Concurrent requests:** Second simultaneous request rejected by in-flight lock.
- **G. Gemini provider outage:** Transparent fallback to `buildStructuredFallbackResponse`; telemetry records `AI_FALLBACK_USED` (`PROVIDER_ERROR`).
- **H. Gemini timeout:** Bounded 12s timeout cascades to next model or structured fallback; telemetry records `PROVIDER_TIMEOUT`.
- **I. Gemini malformed output:** `extractJsonFromModelText` catches errors; falls back to `getSafeStructuredFallback()` with sanitized logging.
- **J. Missing provider credentials:** Immediately returns structured fallback; telemetry records `NO_API_KEY`.
- **K. Prompt injection:** Modular prompt delimiters and `sanitizeInput`/`sanitizeOutput` guardrails prevent instruction leakage.
- **L. Malicious structured action output:** Action Router strictly enforces allowlist; invalid actions replaced with `{ type: "none" }`.
- **M. Attempted cross-user access:** Enforced by `ctx.auth.getUserIdentity().subject`.
- **N. Attempted userId spoofing:** Client-supplied userIds are ignored; session identity is authoritative.
- **O. Safety classification bypass attempts:** Deterministic keyword and idiom regex filter runs server-side on clean text.
- **P. Excessive fallback usage:** Quantifiable via `getTelemetryMetrics` admin query.
- **Q. Telemetry leaking sensitive content:** Schema strictly restricts telemetry to metadata; raw text and clinical scores prohibited.

---

## 6. Rate-Limit Design

```
Student Message (from client)
       │
       ▼
Sanitize Input (strip tags, limit 1000 chars)
       │
       ▼
SERVER SAFETY GATE (classifyServerSafety)
       │
       ├─► [CRISIS / SELF-HARM] ──► Deduplicated Safety Alert ──► Controlled Crisis Response (Hotlines)
       │                                                          (Rate Limit Bypassed)
       │
       ├─► [THIRD-PARTY CONCERN] ──► Controlled Supportive Response (Rate Limit Bypassed)
       │
       ▼
SERVER RATE LIMIT CHECK (checkAndAcquireRateLimit)
       │
       ├─► In-Flight Active? ──────► Reject: CONCURRENT_REQUEST (Wait a moment)
       ├─► Burst > 10 / 60s? ──────► Reject: RATE_LIMITED_BURST (Chatting too quickly)
       ├─► Daily > 50 / 24h? ──────► Reject: RATE_LIMITED_DAILY (Daily limit reached)
       │
       ▼ (Token Acquired)
Execute AI Processing (Context + Memory + Gemini / Fallback)
       │
       ▼ (finally)
Release In-Flight Lock (releaseRateLimit)
```

---

## 7. Rate-Limit Thresholds and Rationale

1. **Burst Limit: 10 requests per 60 seconds:**
   - *Rationale:* Protects against double-tapping, UI lag resends, and automated script loops, while permitting rapid conversational exchanges during natural typing.
2. **Daily Limit: 50 messages per 24 hours:**
   - *Rationale:* Increases the previous 20-message limit (which was overly restrictive for multi-turn therapeutic dialogue) while capping daily Gemini API cost to ~$0.005/user/day and encouraging healthy student screen breaks.
3. **In-Flight Lock: 1 active request per user (20s safety TTL):**
   - *Rationale:* Prevents race conditions and duplicate AI generation when a user submits multiple messages before the first response completes.

---

## 8. Concurrency Handling

- Handled atomically in Convex mutation `checkAndAcquireRateLimit`.
- If `inFlight === true` and `inFlightSince` was within the last 20 seconds, the mutation rejects the incoming request immediately with `CONCURRENT_REQUEST`.
- The `action` executes in a `try ... finally` block, ensuring `releaseRateLimit` is always invoked to clear `inFlight` even if network or parse exceptions occur.

---

## 9. Gemini Failure Handling

- **Cascading Models:** Primary `gemini-3.5-flash-lite` $\rightarrow$ Fallback 1 `gemini-3.8-flash` $\rightarrow$ Fallback 2 `gemini-2.5-flash`.
- **Bounded Timeout:** 12 seconds per model with immediate `AbortController` cancellation.
- **Exponential Backoff:** 500/503 errors retry once with backoff (600ms, 1200ms); client 4xx errors skip immediately to next model.
- **Fail-Safe Fallback:** Any uncaught provider failure seamlessly executes `buildStructuredFallbackResponse`, preserving avatar presentation, multi-turn awareness, and response contracts.

---

## 10. Fallback Behavior

- Multi-turn aware and context-sensitive (boundary detection, tool requests, farewells).
- Adheres strictly to the `EmotyResponseContract` (`{ mode, response, action, avatarState }`).
- Never claims Gemini succeeded (`geminiSuccess: false`, `fallbackUsed: true` in telemetry).
- Never invents clinical diagnoses or scores.

---

## 11. Telemetry Architecture

Telemetry is stored in the dedicated Convex table `aiTelemetryLogs`:
- `userId`: string (session identity for abuse tracking)
- `timestamp`: number (epoch ms)
- `durationMs`: number (round-trip processing latency)
- `path`: `"crisis" | "third_party" | "gemini" | "fallback" | "rate_limited"`
- `mode`: string (e.g. `"emotional_support"`, `"casual"`)
- `actionType`: string (validated action e.g. `"start_breathing"`, `"none"`)
- `avatarState`: string (e.g. `"calm"`, `"worried"`, `"supportive"`)
- `safetyCategory`: string (`"normal" | "elevated" | "crisis" | "third_party" | "contextual_idiom"`)
- `geminiCalled`: boolean
- `geminiSuccess`: boolean
- `fallbackUsed`: boolean
- `fallbackReason`?: string (`"RATE_LIMITED" | "NO_API_KEY" | "PROVIDER_TIMEOUT" | "PROVIDER_ERROR" | "PARSE_ERROR" | "CONTRACT_INVALID"`)
- `errorCode`?: string
- `model`?: string

---

## 12. Telemetry Event Taxonomy

1. `AI_REQUEST_COMPLETED`: `path: "gemini"`, `geminiSuccess: true`
2. `AI_REQUEST_RATE_LIMITED`: `path: "rate_limited"`, `fallbackReason: "RATE_LIMITED"`
3. `AI_PROVIDER_FAILURE`: `geminiSuccess: false`, `errorCode: "HTTP_503"`
4. `AI_FALLBACK_USED`: `fallbackUsed: true`, `fallbackReason: "NO_API_KEY" | "PROVIDER_TIMEOUT" | ...`
5. `AI_CONTRACT_INVALID`: `fallbackReason: "CONTRACT_INVALID"`
6. `AI_SAFETY_SUPPRESSED`: `path: "crisis"`, `safetyCategory: "crisis"`
7. `AI_ACTION_RECOMMENDED`: `actionType != "none"`

---

## 13. Privacy Boundaries

- **Zero Content Persistence:** Raw user messages, AI response text, and crisis disclosures are strictly excluded from `aiTelemetryLogs`.
- **Zero Clinical Data:** PHQ-9, GAD-7, and PQ-16 scores, clinician notes, and medication names are strictly prohibited.
- **Strict Schema Enforcement:** Any unexpected fields passed to `recordTelemetry` trigger a Convex schema validation error.

---

## 14. Safety Telemetry

- Safety events are observed via metadata: `path: "crisis"`, `safetyCategory: "crisis"`, `geminiCalled: false`.
- Safety alerts in the `alerts` table remain the single authoritative alert mechanism for clinical counselors. Telemetry does not duplicate alerts or clinical records.

---

## 15. Authorization & Security

- Every rate-limit and telemetry mutation enforces `ctx.auth.getUserIdentity()`.
- Client-supplied `userId` parameters are prohibited or ignored.
- Developer telemetry query `getTelemetryMetrics` requires verified administrator status (`requireAdmin(ctx)`).

---

## 16. Cost & Abuse Protection

- Single user daily cap: 50 requests (~$0.005/day).
- Burst rate limit: 10 requests / minute.
- In-flight lock: prevents parallel request generation.
- Rate limits survive user-initiated conversation clearing.

---

## 17. Tests Added & Executed

All tests reside in `convex/emotyProductionHardening.test.ts`:
- **RATE-01:** Normal request allowed and acquires token. (PASS)
- **RATE-02:** Per-user burst rate limit triggers after 10 requests. (PASS)
- **RATE-03:** Daily limit triggers after 50 messages. (PASS)
- **RATE-04:** Client cannot spoof another user's identity. (PASS)
- **RATE-05:** Concurrent requests cannot trivially bypass limits. (PASS)
- **RATE-06:** Rate-limit state is server authoritative and survives chat history clearing. (PASS)
- **RATE-07:** Rate limiting does not bypass safety classification. (PASS)
- **RATE-08:** CRISIS request still reaches authoritative safety handling even at rate limit. (PASS)
- **RATE-09:** Gemini timeout uses bounded fallback. (PASS)
- **RATE-10 & RATE-12:** Missing API key uses structured fallback without error. (PASS)
- **RATE-11:** Malformed Gemini response uses structured fallback. (PASS)
- **RATE-13 & RATE-14:** Fallback does not claim Gemini succeeded and preserves response contract. (PASS)
- **TELEM-01 to TELEM-05:** Telemetry records appropriate path, success flags, and latencies. (PASS)
- **TELEM-06 to TELEM-09 & Phase 18:** Sensitive user, AI, and clinical data NEVER stored in telemetry. (PASS)
- **TELEM-10:** Arbitrary telemetry fields cannot be injected by client. (PASS)
- **SEC-01:** Unauthenticated telemetry write blocked. (PASS)
- **SEC-02 & SEC-03:** Rate limiter and telemetry strictly bound to authenticated subject. (PASS)
- **SEC-04:** Non-admin cannot query developer telemetry metrics. (PASS)
- **REG-01 & REG-02:** Step 9 multi-turn dialogue & fallback remain intact. (PASS)
- **REG-03:** Action router safety constraints remain intact. (PASS)
- **REG-04:** Deterministic server safety classifications remain intact. (PASS)
- **REG-05:** Non-sensitive memory detection remains intact. (PASS)

---

## 18. Manual QA Matrix

| Test Scenario | Input / Action | Expected Behavior | Observed Behavior | Status |
|---|---|---|---|---|
| **A. Normal conversation** | "Hello Emoty, how was your day?" | Casual mode response, calm avatar, telemetry recorded | Warm greeting from Emoty, calm avatar, safe fallback/Gemini response | **PASS** |
| **B. Rapid repeated messages** | 12 messages sent in 15 seconds | First 10 succeed; 11th and 12th rejected with friendly message | Burst limiter triggered with friendly guidance alert | **PASS** |
| **C. Long normal conversation** | 50 consecutive messages | All 50 succeed; 51st rejected with daily limit alert | Daily limit triggers cleanly on 51st message | **PASS** |
| **D. Gemini unavailable / fallback** | API key absent or network disconnected | Immediate multi-turn fallback without user-facing errors | Structured fallback returned in <500ms; contract valid | **PASS** |
| **E. Explicit intervention request** | "Can we do a breathing exercise?" | `start_breathing` action returned, breathing avatar | Emoty offers breathing exercise with start breathing action | **PASS** |
| **F. Normal $\rightarrow$ Crisis transition** | "I want to kill myself right now" | Immediate crisis alert, 14416/988 hotline numbers, Gemini suppressed | Emergency resources displayed, safety alert created in DB | **PASS** |
| **G. Companion name = Emoty** | Default companion profile | Companion introduces itself as Emoty | Name displayed as Emoty in conversation and fallback | **PASS** |
| **H. Chat clearing rate limit test** | Send messages $\rightarrow$ tap Clear Chat $\rightarrow$ check count | Rate limit persists; counter does NOT reset to 0 | `getRateLimitStatus` retains accurate usage count | **PASS** |
| **I. Error exposure verification** | Trigger timeout / provider error | No internal stack traces, API keys, or provider messages shown to student | Friendly student-facing connection error returned | **PASS** |

---

## 19. Deployment Verification

1. **Local Test Suite:** 181 passed across 9 emoty test suites; 1,030 passed across full test suite.
2. **TypeScript Compilation:** `npx tsc --noEmit` exited with code 0.
3. **Convex Cloud Deployment:** `npx convex dev --once` synchronized schema and functions to `fabulous-rooster-538.convex.cloud`.
4. **Dashboard Build:** Next.js / Vite build completed successfully in 1.88s.
5. **Android Release Build:** Gradle `assembleRelease` completed in 2m 43s generating `android/app/build/outputs/apk/release/app-release.apk` (97.6 MB).

---

## 20. Provider Configuration Status

- **Status:** **NOT CONFIGURED**
- **Inspection Details:**
  - `npx convex env list`: No `GEMINI_API_KEY` set on deployment `fabulous-rooster-538`.
  - `cbt:getActiveApiKeyInternal`: Database `apiKeys` table contains no active key.
- **Safe Fallback Verification:** Confirmed that in the absence of credentials, the system executes structured offline fallback (`buildStructuredFallbackResponse`), logs safe telemetry with `fallbackReason: "NO_API_KEY"`, and never exposes secrets or crashes.
- **Production Configuration Mechanism:** Administrators can configure the key safely by running `npx convex env set GEMINI_API_KEY <key>` or via the admin dashboard. Plaintext keys are never returned over public queries.

---

## 21. Summary of Files Changed

- `convex/schema.ts`: Added `companionRateLimits` and `aiTelemetryLogs` tables with indexes.
- `convex/emotyRateLimiter.ts`: New server-authoritative rate limiter module (burst, daily, concurrency).
- `convex/emotyTelemetry.ts`: New privacy-first AI telemetry subsystem (metadata validator, admin metrics).
- `convex/companion.ts`: Re-architected `generateAIResponse` (safety-first ordering, rate-limiting integration, bounded 12s timeout, privacy-sanitized logs).
- `convex/emotyProductionHardening.test.ts`: 22 comprehensive production hardening tests.
- `convex/emotyIntent.test.ts`: Updated `INTENT-20` to reflect the 50-message Step 10 daily threshold.
- `convex/emoty.test.ts`: Updated `CONTRACT-12` to reflect the 50-message Step 10 daily threshold.
- `AI_3_STEP_10_PRODUCTION_HARDENING_AUDIT.md`: Complete 25-question read-only audit document.
- `AI_3_STEP_10_PRODUCTION_HARDENING_REPORT.md`: This comprehensive completion report.

---

## 22. Known Limitations & Deferred Items

- **Physical Device USB Reconnection:** During the build step, the physical Android device (`e3a895960123`) was unplugged from the workstation. Release APK artifact `app-release.apk` is compiled and ready for USB/sideload installation.
- **External Observability Platforms:** Excluded by design (Datadog/Sentry/Prometheus) in compliance with Phase 22 "Do Not Overengineer".
- **Dynamic User-Tier Limits:** All authenticated students currently share identical limits (10/min burst, 50/day). Tiered limits (e.g. higher allowances for clinical trial cohorts) deferred to Step 11.

---

## 23. Recommendation for AI-3 Step 11

With production hardening, server-authoritative rate limiting, and privacy-first telemetry completed and locked:
1. Proceed to **AI-3 Step 11: Production Deployment, Provider Activation & Live Monitoring**.
2. Set the production `GEMINI_API_KEY` on `fabulous-rooster-538.convex.cloud`.
3. Sideload the fresh `app-release.apk` on the physical device to perform final end-to-end network verification against live Gemini models.
