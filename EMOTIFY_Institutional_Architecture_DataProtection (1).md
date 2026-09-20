# EMOTIFY — Institutional Architecture for Schools & Colleges
*Counsellor Portal, Session Management, Report Uploads & Data Protection Framework*

---

## PART 1: THREE-TIER SYSTEM ARCHITECTURE

Your app needs to become three connected products, not one:

```
┌─────────────────────┐      ┌──────────────────────┐      ┌───────────────────────┐
│   STUDENT APP        │─────▶│  COUNSELLOR PORTAL     │─────▶│  INSTITUTION DASHBOARD │
│  (mobile, what        │      │  (web dashboard,       │      │  (Principal/SWT/       │
│  we've designed        │      │  used by school/       │      │  District nodal        │
│  so far)               │      │  college counsellor)   │      │  officer)              │
└─────────────────────┘      └──────────────────────┘      └───────────────────────┘
        │                              │                              │
        └──────────────┬───────────────┴──────────────┬───────────────┘
                        ▼                              ▼
                ┌───────────────┐            ┌──────────────────┐
                │  Encrypted DB   │            │  Audit Log System  │
                │  (student data,  │            │  (who accessed what,│
                │  session notes)  │            │  when)              │
                └───────────────┘            └──────────────────┘
```

This maps directly onto your Government Order's School Wellness Team (SWT) structure — Principal → Counsellor/Coordinator → Teachers/Parents/Peer Monitors — so the app's role hierarchy should mirror that existing chain of responsibility rather than inventing a new one.

---

## PART 2: COUNSELLOR PORTAL — CORE FEATURES

### 2.1 Student Risk Dashboard (Landing Page)

| Section | What It Shows |
|---|---|
| 🔴 Urgent Alerts | Students flagged for suicide risk (PHQ-9 Item 9) or psychosis risk (PQ-16) — sorted by time since flag, with countdown showing hours remaining before mandatory escalation |
| 🟠 Needs Check-in | Students in Moderate/Severe band awaiting scheduled counsellor contact |
| 🟡 Trending Down | Students whose weekly emotion/intensity data shows a worsening pattern (even if not yet flagged severe) |
| 🟢 Stable/Improving | Students on self-help track, shown collapsed by default |

**Each student card shows (NOT full raw scores by default — summary first, click to expand):**
- Alias/ID (never full name on the summary view — protects privacy even from casual screen exposure)
- Current triage level
- Days since last counsellor contact
- One-line trend note: *"Anxiety intensity down 2 weeks running"* or *"3 skipped check-ins this week"*

### 2.2 Individual Student Case File (click into a student)

- Full de-identified history: PHQ-9/GAD-7 trend graphs, emotion check-in patterns, MicroGoal completion rate, CBT session summaries (thinking patterns encountered, belief-rating trends)
- **Session Notes tab** — counsellor's own daily/weekly session write-ups (see 2.3)
- **Psychiatric Reports tab** — uploaded external reports (see 2.4)
- **Follow-up Scheduler tab** — booking + reminders (see 2.5)
- **Referral tab** — for routing to DEIC/DMHP/Medical College Psychiatry per your GO's existing referral network

### 2.3 Daily/Session Notes Upload

**Simple structured form (not free-form only — structured fields help with data consistency and later analysis):**

| Field | Type |
|---|---|
| Session date & duration | Auto-filled/editable |
| Session type | Dropdown: Scheduled check-in / Crisis response / Follow-up / Parent consultation |
| Presenting concern (brief) | Short text |
| Risk level assessed | Dropdown: Low / Moderate / High / Critical |
| Intervention used | Multi-select: CBT discussion / Referral made / Safety plan created / Psychoeducation / Other |
| Next steps | Short text |
| Attachment (optional) | File upload — for scanned notes, assessment printouts |

**Why structured + free text combo:** Pure free text is hard to search/analyze later for the quarterly reporting your GO requires (Table 3: monitoring indicators); pure structured forms lose nuance counsellors need to capture. This hybrid gives you both.

### 2.4 Psychiatric/External Report Upload

- Counsellor or authorized referral partner (DMHP psychiatrist, Medical College) uploads PDF/scanned reports
- Tagged to student case file, timestamped, access-restricted to assigned counsellor + supervising psychiatrist only (not visible to teachers, SWT general members, or parents unless explicitly shared)
- Version-controlled — old reports archived, not deleted, in case of review needs

### 2.5 Session Booking System

**For the student (in student app):**
> "Would you like to talk to a counsellor?" → Shows available slots → Student picks a time → Confirmation + reminder notification

**For the counsellor (in portal):**
- Calendar view of all bookings across their assigned students
- Auto-blocked slots for urgent cases (system reserves emergency slots daily, not fully bookable by routine requests)
- Reschedule/cancel with auto-notification to student
- No-show tracking (gentle, not punitive — flags pattern for outreach, doesn't penalize student)

### 2.6 Follow-Up Reminders (Automated)

Per your GO's own timelines:
- Moderate cases → auto-reminder to counsellor at Week 2 and Week 4
- Severe cases → auto-reminder within 24–48 hours
- Psychosis-flagged → auto-reminder within 7 days
- If counsellor doesn't acknowledge within these windows → auto-escalate to supervisor (matches your original EMOTIFY doc's escalation rule)

---

## PART 3: INSTITUTION DASHBOARD (Principal / SWT / District Nodal Officer Level)

This layer should show **only aggregated, de-identified data** — never individual student details, to prevent misuse at the administrative level.

| Metric | Example View |
|---|---|
| % students screened this term | 82% |
| % flagged Moderate/Severe | 14% |
| Average counsellor response time (Severe cases) | 1.3 days |
| MicroGoal engagement rate | 68% weekly active |
| Number of active SWT-coordinated referrals to DEIC/DMHP | 6 this quarter |

This directly feeds your GO's **Table 3 (Monitoring Indicators)** — quarterly reporting becomes a button-click export instead of manual compilation.

---

## PART 4: DATA PROTECTION FRAMEWORK

Since this involves minors' mental health data — one of the most sensitive data categories under Indian law — this needs to be treated as seriously as a hospital EMR, not a typical consumer app.

### 4.1 Legal Basis (India-Specific)

- **Digital Personal Data Protection Act (DPDP), 2023** — governs consent, processing, and children's data specifically. Under DPDP, processing a child's (under 18) personal data requires **verifiable parental/guardian consent**, and explicitly prohibits behavioural monitoring/targeted advertising toward children.
- **This directly affects your onboarding flow** — the "mandatory emergency contact" you already require is good, but you'll also need a **separate parental consent step** for students under 18 before any data processing begins, not just an emergency contact.

*(I'd recommend having this reviewed by a lawyer familiar with DPDP's children's-data provisions specifically — the rules are still being operationalized via rules/notifications, so getting current legal guidance matters more than general best practice here.)*

### 4.2 Technical Safeguards

| Safeguard | Implementation |
|---|---|
| Encryption at rest | AES-256 for database, especially PHQ-9/GAD-7 scores, session notes, psychiatric reports |
| Encryption in transit | TLS 1.3 for all app↔server communication |
| Pseudonymization | Student-facing IDs are aliases; real name/contact mapping stored in a separate, more restricted table |
| Role-based access control (RBAC) | Teacher sees only aggregate/alert-level data; Counsellor sees full case file for assigned students only; Psychiatrist sees only referred cases; Principal/SWT sees only de-identified aggregates |
| Audit logging | Every access to a student's case file logged: who, when, what was viewed/edited — immutable log, matches your original EMOTIFY doc's alert-tracking design |
| Data minimization | Don't collect more than needed — e.g., don't store raw free-text CBT responses longer than necessary for the therapeutic purpose; consider auto-summarizing/archiving after a defined period |

### 4.3 Data Retention & Deletion

- Define a clear retention policy (e.g., active student data retained through enrollment + 1 year post-graduation for continuity of care, then archived/anonymized)
- Provide a **parent/adult-student data deletion request mechanism** (right to erasure, a DPDP requirement)
- Backup data should follow the same encryption/access standards as live data — this is a common gap

### 4.4 Consent Architecture (Multi-Layered)

| Consent Type | From Whom | For What |
|---|---|---|
| Parental/guardian consent | Parent (if student <18) | Data processing, app usage, counsellor contact |
| Student assent | Student | Age-appropriate explanation + agreement (even if parent already consented — respects student autonomy per ethical guidelines) |
| Data-sharing consent | Parent + Student | Specifically for sharing with external psychiatrist/DMHP if referral needed |
| Research/anonymized data use consent | Parent + Student (opt-in, separate from core app consent) | Only if you plan to use aggregated data for research/improvement — must be separately opted into, never bundled |

### 4.5 Breach Response Plan (must exist before launch, not after)

- Defined incident response team and timeline
- DPDP requires breach notification to the Data Protection Board and affected individuals — have this workflow ready, not improvised
- Regular penetration testing given the sensitivity of data involved

---

## PART 5: HOW THIS CONNECTS TO YOUR EXISTING GOVERNMENT FRAMEWORK

Your app shouldn't operate as a parallel system — it should plug directly into what your uploaded GO already mandates:

- **School Wellness Team (SWT)** structure → maps to your Institution Dashboard's user roles
- **RBSK/DEIC/DMHP referral network** → your Referral tab should generate the same line-list format already used in NALAM app, so data isn't duplicated across systems
- **Quarterly data review by IMH (Institute of Mental Health)** → your Institution Dashboard's export function should match the exact indicators in your GO's Table 3
- **1098/14416 helpline integration** → already built into your student-facing crisis flow; counsellor portal should log if these were used, for continuity of care

---

## PART 6: RECOMMENDED NEXT STEPS

1. **Get DPDP-specific legal review** before building the consent/data architecture — this is the one area where getting it wrong has real legal consequences, not just UX consequences.
2. **Pilot with ONE institution first** (per your Government Order's existing pilot-friendly structure) before scaling — lets you stress-test the counsellor workflow before district-wide rollout.
3. **Involve an actual school/college counsellor in portal design review** — their day-to-day workflow constraints (how many students they manage, how much time per case) should shape the UI, not just clinical logic.
4. **Define data-sharing MOUs** with DEIC/DMHP/Medical College partners before the Referral tab goes live — the tech is the easy part; the inter-agency data-sharing agreement is usually the slower piece.

Would you like me to go deeper into any one section — for example, the exact database schema for the Counsellor Portal, or a role-permission matrix table you can hand directly to your developer?
