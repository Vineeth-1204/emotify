# Priority 11 — Step 5A Implementation & Hardening Report
# Student Telemetry Query Bounding + Patient ID Counter

## 1. Status

**IMPLEMENTATION & HARDENING REVIEW COMPLETE**
- **New Tests Added**: 24 focused tests in `convex/priority11_step5a.test.ts` (including `P11-5A-ID-11` and `P11-5A-ID-12`)
- **Total Test Suite**: **412 / 412 passing (100%)** across 21 test files (baseline increased from 388)
- **TypeScript**: **Clean (0 errors)** via `npx tsc --noEmit`
- **Dashboard Production Build**: **Clean (0 errors)** via `npm --prefix dashboard run build`
- **Zero Regression**: Priorities 2–10 behavioral, clinical, and security guarantees remain strictly intact.
- **Step 5B**: **NOT STARTED**.

---

## 2. Hardening Review 1: Patient Counter Concurrency & OCC Proof

### The Question / Investigation
Can two simultaneous first-ever registrations both initialize the counter and receive the same patient ID under Convex?

### In-Depth Convex OCC Transaction Model Analysis
1. **Mutation Serializability & Conflict Detection**:
   Convex mutations execute in a software transactional memory (STM) environment with Optimistic Concurrency Control (OCC). Each transaction tracks:
   - **Document reads**: specific document IDs accessed.
   - **Index range queries**: exact index ranges evaluated by `.withIndex("by_name", q => q.eq("name", "patientId"))`.
   - **Document writes**: inserts, updates, and deletes.
2. **Range Query Dependency**:
   When Transaction 1 (T1) and Transaction 2 (T2) execute concurrently on an uninitialized counter:
   - Both transactions query `counters` using `.withIndex("by_name", q => q.eq("name", "patientId"))`.
   - Convex records an index read constraint on the range `name == "patientId"`.
   - If T1 commits first, it inserts `{ name: "patientId", value: nextValue }`. This insert writes a key that falls directly within the `name == "patientId"` index range that T2 read.
   - When T2 attempts to commit, Convex detects that the index range evaluated by T2 has been modified by T1.
   - **T2 cannot commit.** Convex rejects T2 with an OCC conflict and automatically restarts T2.
   - On retry, T2 observes the committed counter document inserted by T1, takes the increment branch, patches the document, and receives `nextValue + 1`.
3. **Hardened Multi-Record Invariant in Code (`convex/users.ts`)**:
   Even though OCC prevents concurrent conflicting commits, `allocateNextPatientId` was hardened defensively to eliminate any single-point-of-failure or split-brain state:
   - Instead of `.first()`, it executes `.collect()` to inspect all records matching `name == "patientId"`.
   - If multiple records ever exist (e.g. from an out-of-band manual script or concurrent seed), it deterministically calculates `Math.max(...counterDocs.map(d => d.value))`, deletes all duplicate records, patches the surviving document to `maxValue + 1`, and returns `maxValue + 1`.
   - Monotonicity and uniqueness are preserved under all scenarios.

### Concurrency Regression Tests Added
- `P11-5A-ID-11: concurrent first initialization cannot allocate duplicate patient IDs`:
  Executes simultaneous registrations using `Promise.all([registerStudent(...), registerStudent(...)])` against a fresh database. Verifies:
  - Both registrations succeed.
  - Registration 1 receives `"101"` and Registration 2 receives `"102"` (or vice-versa).
  - IDs are distinct (`idA !== idB`).
  - Exactly one counter document exists in `counters` table with `value: 102`.
- `P11-5A-ID-12: defensive recovery if duplicate counter documents exist`:
  Simulates a corrupt database with two conflicting counter records (`value: 105` and `value: 110`). Verifies that `allocateNextPatientId` detects the conflict, deletes the extra record, advances to `111`, and resolves the table to a single authoritative document.

---

## 3. Hardening Review 2: Exhaustive Audit of `getAllAttempts` Callers

### Complete Call Tree Audit
A search across all frontend screens, backend endpoints, and test suites was conducted for `api.screening.getAllAttempts` and `getAllAttempts`:

| Caller Location | Component / File | Purpose | Requires Unbounded History? | Compatible with `.take(20)`? |
|---|---|---|---|---|
| Frontend Mobile UI | `app/(auth)/(tabs)/profile.tsx` | Export student screening data | **NO** — uses `api.screening.getAll` (separate query) | Yes |
| Frontend Dashboard | `dashboard/src/pages/PatientDetail.tsx` | Counselor view of past screening assessments | **NO** — uses `api.screening.getAll` (separate query) | Yes |
| Test Suite | `convex/screening.test.ts:310` | Verifies newest attempts returned in descending order | **NO** — tests 2 attempts | **YES** |
| Step 5A Test Suite | `convex/priority11_step5a.test.ts` | Validates bounded history & authorization | **NO** — tests 20-record bound | **YES** |

### Findings & Semantic Safety
1. **Zero UI Callers for `getAllAttempts`**: Neither the mobile student app nor the counselor dashboard invokes `api.screening.getAllAttempts`. All UI screens currently use `api.screening.getAll` (which filters by completed attempts).
2. **No Caller Requires Unbounded History**: No production caller relied on unbounded memory retrieval from `getAllAttempts`.
3. **Preserved Complete History Where Intended**: `api.screening.getAll` remains untouched and available for export workflows.
4. **Bounded History Endpoint Active**: The new dedicated query `api.screening.getScreeningHistory` with default limit 20 (and max 20) provides bounded access for longitudinal history.
5. **Conclusion**: Keeping `.take(20)` on `getAllAttempts` is completely safe and backwards compatible.

---

## 4. Student Mood Query Bounding (`convex/insights.ts`)

### Previous Query Pattern
`convex/insights.ts:getDailyStats` previously queried all historical daily check-ins for the student using the single-field index:
```typescript
const rawDailyCheckins = await Promise.all(
  Array.from(searchUserIds).map((id) =>
    ctx.db
      .query("dailyCheckins")
      .withIndex("by_userId", (q) => q.eq("userId", id))
      .collect()
  )
);
```
Every historical check-in since account inception was pulled into memory, sorted in V8, and filtered in JavaScript to extract the 7-day calendar window.

### New Bounded Query Pattern
When `args.referenceDate` is provided (`YYYY-MM-DD`), `getDailyStats` now derives the exact local calendar window `[referenceDate - 6 days, referenceDate]` and queries the existing compound index:
```typescript
let rawDailyCheckins: any[][] = [];

if (args.referenceDate && /^\d{4}-\d{2}-\d{2}$/.test(args.referenceDate)) {
  const [refY, refM, refD] = args.referenceDate.split("-").map(Number);
  const dStart = new Date(refY, refM - 1, refD - 6, 12, 0, 0);
  const startY = dStart.getFullYear();
  const startM = String(dStart.getMonth() + 1).padStart(2, "0");
  const startD = String(dStart.getDate()).padStart(2, "0");
  const startDateStr = `${startY}-${startM}-${startD}`;
  const endDateStr = args.referenceDate;

  rawDailyCheckins = await Promise.all(
    Array.from(searchUserIds).map((id) =>
      ctx.db
        .query("dailyCheckins")
        .withIndex("by_userId_and_dateStr", (q) =>
          q.eq("userId", id).gte("dateStr", startDateStr).lte("dateStr", endDateStr)
        )
        .collect()
    )
  );
} else {
  // Legacy fallback when no referenceDate is provided (preserves Priority 7 backward compatibility)
  rawDailyCheckins = await Promise.all(
    Array.from(searchUserIds).map((id) =>
      ctx.db
        .query("dailyCheckins")
        .withIndex("by_userId", (q) => q.eq("userId", id))
        .collect()
    )
  );
}
```

- **Index**: `by_userId_and_dateStr` (`["userId", "dateStr"]`).
- **No new indexes added**: Utilizes pre-existing index.

---

## 5. Full Validation Results

| Check | Target | Result | Status |
|---|---|---|---|
| **Focused Step 5A Tests** | `convex/priority11_step5a.test.ts` | **24 / 24 passing** (2.15s) | **PASS** |
| **Full Regression Suite** | `convex/*.test.ts` (21 files) | **412 / 412 passing** (7.50s) | **PASS** |
| **TypeScript Compilation** | `npx tsc --noEmit` | **0 errors / clean** | **PASS** |
| **Dashboard Build** | `npm --prefix dashboard run build` | **0 errors / built in 4.37s** | **PASS** |

---

## 6. Exact Files Changed

1. `convex/schema.ts` — Added `counters` table definition with `by_name: ["name"]`.
2. `convex/users.ts` — Replaced table scan with hardened, OCC-safe, self-healing `allocateNextPatientId()`.
3. `convex/screening.ts` — Added `.take(20)` bound to `getAllAttempts`; added bounded `getScreeningHistory` endpoint.
4. `convex/insights.ts` — Bound `recentDailyMood` query using `by_userId_and_dateStr` range query `[refDate - 6, refDate]`.
5. `convex/priority11_step5a.test.ts` — 24 focused regression tests covering counter allocation, OCC concurrency, mood bounding, and screening bounding.

---

## 7. Scope Guard Confirmation

- [x] **No Clinical Timeline changes** (`convex/timeline.ts` untouched).
- [x] **No pagination added** (cursor pagination deferred to Step 5D).
- [x] **No institutional rollup tables added** (deferred to Step 5E).
- [x] **No DAU/WAU/MAU changes** (deferred to Step 5F).
- [x] **No retention/pruning changes**.
- [x] **No institutional timezone changes** (`convex/dashboard.ts` untouched).
- [x] **No clinical scoring changes** (PHQ-9, GAD-7, PQ-16, WSAS, ReQoL-10 untouched).
- [x] **No triage changes**.
- [x] **No Mitra AI changes** (paused).
- [x] **No WSAS/ReQoL activation**.
- [x] **No Priority 12+ work**.
- [x] **CONFIRMATION: Step 5B was NOT started**.
