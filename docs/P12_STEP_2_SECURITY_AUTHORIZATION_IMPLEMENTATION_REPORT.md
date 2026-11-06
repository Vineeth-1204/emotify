# P12 — Counselor Interaction & Longitudinal Tracking
## Step 2: Security & Authorization Defect Remediation Implementation Report

**Project:** Emotify  
**Priority:** P12 — Counselor Interaction & Longitudinal Tracking  
**Phase:** Step 2 — Security & Authorization Defect Remediation  
**Date:** October 3, 2026  
**Status:** Complete  

---

## 1. Objective

The objective of P12 Step 2 is to remediate the three security and authorization defects identified during the P12 Step 1 comprehensive read-only audit:
1. Enable institutional counselors (`role === "counsellor"`) to accept/reject pending student-created appointments without weakening student ownership boundaries.
2. Enable authorized counselors and administrators to complete student follow-up tasks on their behalf, while maintaining strict ownership validation that prevents students from completing other students' follow-ups.
3. Explicitly verify role authorization and document existence on `counsellorRequests.updateStatus`.
4. Provide comprehensive regression tests verifying all authorization boundaries across students, counselors, admins, and unauthenticated callers.

---

## 2. Audit Findings Addressed

From `P12_STEP_1_COMPREHENSIVE_AUDIT.md`:
- **Defect 1 (`convex/appointments.ts:updateAppointmentStatus`)**: Appointment status acceptance strictly checked `isCallerAdmin = caller.role === "admin"`, locking out institutional counselors when accepting pending student-booked appointments.
- **Defect 2 (`convex/followUps.ts:markComplete`)**: Follow-up completion compared `followUp.userId !== identity.subject`, which directly locked out counselors attempting to complete follow-ups with or on behalf of students.
- **Defect 3 (`convex/counsellorRequests.ts:updateStatus`)**: Document existence check was missing before mutation, and return confirmation was unstandardized.

---

## 3. Appointment Authorization Changes

### File: `convex/appointments.ts`
**Endpoint**: `updateAppointmentStatus`

#### Before:
```typescript
const caller = await ctx.db.get(identity.subject as Id<"users">);
if (!caller) throw new Error("User not found");

const isCallerAdmin = caller.role === "admin";

// In completed phase, anyone can mark it complete (usually user)
if (args.status !== "completed") {
  if (appt.createdBy === "user" && !isCallerAdmin && appt.status === "pending") {
     throw new Error("Unauthorized: Receiver must accept/reject.");
  }
  if (appt.createdBy === "admin" && isCallerAdmin && appt.status === "pending") {
     throw new Error("Unauthorized: Receiver must accept/reject.");
  }
}
```

#### After:
```typescript
const caller = await getAuthenticatedUser(ctx);
if (!caller) throw new Error("User not found");

const isCallerStaff = caller.role === "admin" || caller.role === "counsellor";

// Non-staff callers (students) may only interact with their own appointments
if (!isCallerStaff) {
  const isStudentOwner =
    caller._id === appt.userId ||
    (caller.clerkId && caller.clerkId === appt.userId);
  if (!isStudentOwner) {
    throw new Error("Unauthorized: Cannot access or modify another user's appointment.");
  }
}

// Only allow receiver to accept/reject if it's pending/waiting
// E.g. if createdBy=user, staff (counsellor/admin) can accept/reject.
// If createdBy=admin, user (student owner) can accept/reject.
if (args.status !== "completed") {
  if (appt.createdBy === "user" && !isCallerStaff && appt.status === "pending") {
    throw new Error("Unauthorized: Receiver must accept/reject.");
  }
  if (appt.createdBy === "admin" && isCallerStaff && appt.status === "pending") {
    throw new Error("Unauthorized: Receiver must accept/reject.");
  }
}
```

#### Authorization Rule:
- **Counselor / Admin**: Authorized to accept or reject pending appointments created by students (`createdBy: "user"`).
- **Student Owner**: Authorized to accept or reject appointments created by staff (`createdBy: "admin"`). Denied from accepting their own pending appointments (`createdBy: "user"`).
- **Unrelated Student**: Denied with `"Unauthorized: Cannot access or modify another user's appointment."`
- **Unauthenticated**: Denied with `"Unauthenticated"`.

---

## 4. Follow-Up Authorization Changes

### File: `convex/followUps.ts`
**Endpoint**: `markComplete`

#### Before:
```typescript
export const markComplete = mutation({
  args: { id: v.id("followUps") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const followUp = await ctx.db.get(args.id);
    if (!followUp) throw new Error("Follow-up not found");

    if (followUp.userId !== identity.subject) {
      throw new Error("Unauthorized: Cannot complete follow-up for another user.");
    }

    await ctx.db.patch(args.id, { completed: true });
  },
});
```

#### After:
```typescript
export const markComplete = mutation({
  args: { id: v.id("followUps") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated: Login required.");

    const followUp = await ctx.db.get(args.id);
    if (!followUp) throw new Error("Follow-up not found");

    const caller = await getAuthenticatedUser(ctx);
    if (!caller) throw new Error("User not found");

    const isStaff = caller.role === "admin" || caller.role === "counsellor";
    const isOwner =
      followUp.userId === String(caller._id) ||
      (caller.clerkId && followUp.userId === caller.clerkId) ||
      followUp.userId === identity.subject;

    if (!isStaff && !isOwner) {
      throw new Error("Unauthorized: Cannot complete follow-up for another user.");
    }

    await ctx.db.patch(args.id, { completed: true });
    return { success: true };
  },
});
```

#### Authorization Rule:
- **Student**: Allowed to complete their own follow-ups (`isOwner === true`). Denied from completing another student's follow-up.
- **Counselor / Admin**: Allowed to complete follow-ups belonging to any institutional student (`isStaff === true`).
- **Unauthenticated**: Denied with `"Unauthenticated: Login required."`

---

## 5. Counselor Request Authorization Changes

### File: `convex/counsellorRequests.ts`
**Endpoint**: `updateStatus`

#### Before:
```typescript
export const updateStatus = mutation({
  args: {
    requestId: v.id("counsellorRequests"),
    status: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCounselorOrAdmin(ctx);

    await ctx.db.patch(args.requestId, {
      status: args.status,
      notes: args.notes,
      updatedAt: Date.now(),
    });
  },
});
```

#### After:
```typescript
export const updateStatus = mutation({
  args: {
    requestId: v.id("counsellorRequests"),
    status: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCounselorOrAdmin(ctx);

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("Counsellor request not found");
    }

    await ctx.db.patch(args.requestId, {
      status: args.status,
      notes: args.notes,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
```

#### Authorization Rule:
- Uses `requireCounselorOrAdmin(ctx)`:
  - Counselor (`role === "counsellor"`): Allowed.
  - Admin (`role === "admin"`): Allowed.
  - Student (`role === "patient"`): Denied with `"Unauthorized: Counselor or Admin access required."`
  - Unauthenticated: Denied with `"Unauthenticated: Login required."`

---

## 6. Canonical Identity Handling

All authorization checks adhere strictly to the P4 canonical identity model:
1. Callers are resolved server-side through `getAuthenticatedUser(ctx)`, which first queries by canonical Convex `_id` (`identity.subject as Id<"users">`), and falls back to `by_clerkId` for legacy compatibility.
2. Ownership checks compare the document's student identifier (`appt.userId` or `followUp.userId`) against both the canonical `users._id` and `clerkId`.
3. No client-supplied IDs are trusted for authorization; caller identity is established purely from `ctx.auth.getUserIdentity()`.

---

## 7. Security Review

A thorough code audit of the modified mutations confirmed:
- **No Privilege Escalation**: Non-staff callers are strictly blocked from counselor/admin functions.
- **No Cross-Student Leakage**: Students cannot inspect, modify, or accept appointments or follow-ups of other students.
- **No Caller-Controlled IDs**: All role checks query the server-side `users` record corresponding to the verified auth session token.
- **Guaranteed Authentication**: Every mutation rejects unauthenticated requests with clean error descriptions.

---

## 8. Tests Added

A dedicated regression test suite was created in `convex/p12_step2_security_authorization.test.ts` covering 14 discrete authorization test cases:

### Appointment Authorization
- **APPT-AUTH-01**: Counselor can accept a pending student-created appointment when authorized.
- **APPT-AUTH-02**: Counselor can reject a pending student-created appointment when authorized.
- **APPT-AUTH-03**: Admin can still accept/reject the appointment.
- **APPT-AUTH-04**: Unauthenticated caller is rejected.
- **APPT-AUTH-05**: Unauthorized student cannot accept another party's appointment, and student creator cannot accept their own pending request.

### Follow-Up Authorization
- **FOLLOWUP-AUTH-01**: Student can complete own follow-up.
- **FOLLOWUP-AUTH-02**: Student cannot complete another student's follow-up.
- **FOLLOWUP-AUTH-03**: Authorized counselor can complete student's follow-up.
- **FOLLOWUP-AUTH-04**: Admin can complete student's follow-up.
- **FOLLOWUP-AUTH-05**: Unauthenticated caller is rejected.

### Counselor Request Authorization
- **REQUEST-AUTH-01**: Counselor can update request status.
- **REQUEST-AUTH-02**: Admin can update request status.
- **REQUEST-AUTH-03**: Student cannot update request status.
- **REQUEST-AUTH-04**: Unauthenticated caller is rejected.

---

## 9. Focused Test Results

```
 RUN  v4.1.10 D:/Projects/EmotifyApp/Emotify-Clerk

 ✓ convex/p12_step2_security_authorization.test.ts (14 tests) 125ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
   Duration  906ms
```

---

## 10. Full Regression Test Results

```
 Test Files  37 passed (37)
      Tests  623 passed (623)
   Duration  12.48s
```
*Note: Test count increased from 609 to 623 (14 new authorization tests, 100% pass rate).*

---

## 11. TypeScript Result

```bash
npx tsc --noEmit
# Exit code: 0 (Clean, 0 errors)
```

---

## 12. Dashboard Build Result

```bash
npm run build
# Exit code: 0
# ✓ built in 857ms (Clean production bundle)
```

---

## 13. Files Modified

| File | Change |
|---|---|
| `convex/appointments.ts` | Updated `updateAppointmentStatus` to authorize counselors & admins while preventing cross-student appointment modifications. |
| `convex/followUps.ts` | Updated `markComplete` to allow counselors & admins to complete follow-ups alongside student owners. |
| `convex/counsellorRequests.ts` | Added document existence validation and standardized return payload on `updateStatus`. |
| `convex/p12_step2_security_authorization.test.ts` | New test file containing 14 regression test cases. |

---

## 14. Schema/Index Changes

**Zero schema changes. Zero index changes.**

---

## 15. Scope Verification

Confirmed:
- Did NOT modify `convex/schema.ts`
- Did NOT modify `dashboard/src/pages/PatientDetail.tsx`
- Did NOT modify counselor request UI or student SOS flow
- Did NOT modify follow-up dashboard UI
- Did NOT modify notifications or crons
- Did NOT modify P10 Mitra AI logic
- Did NOT modify clinical screening or triage logic

---

## 16. Remaining P12 Work

- **P12 Step 3**: Counselor Request Flow Alignment (re-pointing mobile SOS flow to create `counsellorRequests`, duplicate request prevention, counselor notifications, student request status UI).
- **P12 Step 4**: Appointment Lifecycle & Provenance Integration.
- **P12 Step 5**: Follow-Up Management System in Counselor Dashboard.
- **P12 Step 6**: Longitudinal Review Unification in `PatientDetail.tsx`.
- **P12 Step 7**: End-to-End Verification & Closure.

---

## 17. Conclusion

All audited security and authorization defects have been resolved with strict adherence to canonical identity, role-based boundaries, and zero regression across existing suites.

---

P12 STEP 2 — COMPLETE
