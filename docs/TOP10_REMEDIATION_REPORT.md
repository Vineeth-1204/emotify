# Emotify: Top 10 Remediation Report

Branch: `claude/blissful-knuth-04nxs0` · PR: https://github.com/Vineeth-1204/emotify/pull/1
Baseline audited: `origin/main` @ `0709df0`

## Status at a glance

| # | Audit action | Status |
|---|---|---|
| 1 | Rotate the JWT signing key and remove it from source | **FIXED in code.** Needs your deployment steps (section A) |
| 2 | Close the exploitable endpoints | **FIXED** |
| 3 | Fix the companion crisis classifier | **FIXED** (English/Hinglish). Native-script patterns need review (section C) |
| 4 | Every safety alert notifies staff, with a source link; no capped alert view | **FIXED** |
| 5 | One crisis-number configuration; log emergency-screen dismissals | **FIXED** (Tele-MANAS 14416 + 112). Clinical sign-off still advised |
| 6 | PHQ-9 wording decision + versioning | **FIXED** (reverted to validated wording, version stored per attempt) |
| 7 | Server-side session validation | **FIXED** |
| 8 | Internalise companion helpers; auth on TTS | **FIXED** |
| 9 | Complete user deletion; atomic screening follow-up | **FIXED** |
| 10 | Counsellor caseloads, dashboard login, request queue, CI | **FIXED** |
| — | Remove WSAS / ReQoL-10 (product requirement) | **FIXED** (needs a one-time data purge, section A) |

**Verification (final run):**
- **Tests:** 1125 passed in 63 files, up from 1062 at baseline.
- **Type checks:** Convex `tsc` reports 0 errors, and the full Expo app `tsc` reports 0 errors.
- **Dashboard:** `tsc -b && vite build` succeeds.
- **GitHub CI on the PR:** both jobs green.

---

## A. What you need to configure (deployment requirement)

The backend now refuses to sign or accept logins until **`JWT_PRIVATE_JWK`** is set on the deployment. Deploying without it does not fail, but every login returns *"Server misconfiguration: JWT_PRIVATE_JWK is not set."* and `/.well-known/jwks.json` returns HTTP 500. It fails closed, so no insecure fallback exists.

Do this **once per deployment**. Dev and prod must each get their **own** key.

1. **Generate and set the key.** Never paste it anywhere else and never commit it:
   ```bash
   node scripts/generate-jwt-key.mjs > /tmp/emotify-jwt.json
   npx convex env set JWT_PRIVATE_JWK "$(cat /tmp/emotify-jwt.json)"            # dev
   npx convex env set JWT_PRIVATE_JWK "$(cat /tmp/emotify-jwt.json)" --prod     # prod: run the generator again first
   rm /tmp/emotify-jwt.json
   ```
   - **Value:** a single-line JSON private RSA key with a `kid` such as `emotify-2026-10-07-xxxxxxxx`. It contains the secret fields `d`, `p` and `q`, so treat it like a password.
   - **Already provided by Convex:** `CONVEX_SITE_URL`. No other new variables are required.
   - **Order:** set the key **before** deploying this branch. That avoids a window in which logins fail.
2. **Deploy** this branch (`npx convex deploy`).
3. **Run the one-time cleanups** on each deployment:
   ```bash
   npx convex run users:clearLegacyTempPasswords '{}'
   npx convex run users:redactLegacyTrashEntries '{}'
   npx convex run screening:purgeRetiredInstrumentData '{}'
   ```
4. **Expect everyone to sign in again.** Every token issued before this version is rejected for three independent reasons:
   - it was signed with the old key, whose `kid` is `static-key-1` and which is no longer published;
   - it has no session id;
   - its stored session row is discarded on first check.
5. **Create counsellor accounts** (Dashboard, then Students, then Add User, then Counsellor) and assign each student from their detail page. Until a student is assigned, their safety alerts go to every counsellor plus the admins.
6. **Run the live verification** (section B).

Because the old private key is in public git history, **the rotation in step 1 is mandatory**, not optional.

## B. Deployment verification

**What was verified here.** This environment has no credentials for your Convex deployment. Its network policy also blocks the local Convex backend download: `version.convex.dev` and the GitHub release assets return 403. Instead, `convex/deployment_verification.test.ts` (7 tests, all passing) runs the full flow in-process:
- It uses a key produced by the real `scripts/generate-jwt-key.mjs`.
- It verifies every token the way Convex does for the provider in `auth.config.ts`:
  - OIDC discovery at `CONVEX_SITE_URL`;
  - JWKS lookup by `kid`;
  - RS256 signature;
  - `iss`, `aud` and `exp`.
- It then drives each flow using **only verified claims**.

| Flow | Result |
|---|---|
| Generator output is a complete private JWK; JWKS publishes only the public half (no `d/p/q/dp/dq/qi`) | PASS |
| Fresh login → token verifies → `getCurrentUser` returns the student | PASS |
| Logout → token still cryptographically valid but refused server-side (queries, mutations, `checkSessionActive`) | PASS |
| Re-login → new token works, previous token revoked | PASS |
| Admin deactivates student → access revoked + login blocked; reactivation → fresh login works | PASS |
| Forged token (foreign key) rejected; after key rotation, old-key tokens fail (`kid` not published) and new logins verify | PASS |
| Token `iss`/`aud` match `auth.config.ts` | PASS |
| Safety:<br>• PHQ-9 item 9 gives a suicide flag, an alert and a follow-up<br>• A companion crisis message gives a controlled response and an alert, without calling the model<br>• An emergency-screen dismissal is recorded<br>• A `critical_risk` notification reaches the admin<br>• Anonymous calls are refused | PASS |

**Run this against your real deployment after section A.** `scripts/verify-deployment.mjs` runs the same checks against the live backend. Use a **dedicated test student**, never a real one:
```bash
CONVEX_URL=https://<deployment>.convex.cloud \
VERIFY_STUDENT_MOBILE=<test student> VERIFY_STUDENT_PASSWORD=<…> \
VERIFY_ADMIN_MOBILE=<admin> VERIFY_ADMIN_PASSWORD=<…> \
VERIFY_SAFETY=1 \
node scripts/verify-deployment.mjs
```
- **Checks it runs:**
  - OIDC/JWKS are served and the key is rotated (the script fails if `kid` is still `static-key-1`);
  - no private fields are published;
  - fresh login is accepted by Convex itself;
  - a forged token is refused;
  - anonymous writes are refused;
  - re-login revokes the old token;
  - logout revokes;
  - deactivation and reactivation behave correctly (with admin credentials);
  - the safety flow works (with `VERIFY_SAFETY=1`).
- **Safety flow is for DEV only.** It creates a real alert that you then resolve in the dashboard.
- **Admin side effect:** signing in as the admin signs that admin out of other devices.
- **Output:** the script prints PASS/FAIL lines and exits non-zero on any failure. It never prints tokens or keys.

## C. Native-script crisis patterns: review required

`convex/emotySafety.ts → NATIVE_SCRIPT_CRISIS_PATTERNS` (Hindi, Tamil, Telugu) and the Hinglish entries in `GENERIC_CRISIS_PATTERNS` were written without a native speaker. I ran a probe set through the live classifier. **Every row below needs native-speaker and clinical-lead review before relying on these patterns.**

**Detected correctly:**
- **Hindi:** मैं मरना चाहता हूँ, मुझे मरना है, आत्महत्या करना चाहती हूँ, खुद को खत्म कर दूंगा, जीना नहीं चाहता
- **Hinglish:** mujhe marna hai, mar jaana chahta hoon, jeena nahi chahta
- **Tamil:** சாக வேண்டும், தற்கொலை செய்து கொள்ள போகிறேன்
- **Telugu:** చనిపోవాలని ఉంది, ఆత్మహత్య చేసుకుంటాను
- **Benign/negation, correctly not flagged:**
  - Hindi "died laughing" idiom
  - Hindi "I do not want to die"
  - Hinglish exam hyperbole "fail hua toh mar jaunga"

**Missed: these are crisis statements classified as `normal`. Highest priority.**

| Language | Phrase | Meaning |
|---|---|---|
| Hindi | मुझे जीना नहीं है | I don't want to live (colloquial) |
| Hindi | मुझे मर जाना चाहिए | I should die |
| Hindi | मैं अपनी जान दे दूंगा | I will give up my life |
| Hindi | मैं नींद की गोलियां खा लूंगा | I will take sleeping pills |
| Hindi | मैं फांसी लगा लूंगा | I will hang myself |
| Hinglish | mujhe nahi jeena | I don't want to live |
| Hinglish | main apni jaan de dunga | I will give up my life |
| Tamil | எனக்கு சாகணும் / செத்துப் போகணும் | I want to die (colloquial) |
| Tamil | வாழ விருப்பமில்லை | No wish to live |
| Telugu | నాకు బతకాలని లేదు | I don't want to live |
| Telugu | చచ్చిపోవాలనుకుంటున్నాను | I want to die (colloquial) |
| Tanglish / Tenglish | enaku saaganum / naaku chanipovalani undi | Romanized Tamil/Telugu: **not covered at all** |

**Over-triggered: classified as a student crisis when it is not.**

| Language | Phrase | Meaning | Why |
|---|---|---|---|
| Hindi | मेरा दोस्त आत्महत्या करना चाहता है | My friend wants to commit suicide | Third-party markers exist only in English, so Hindi/Hinglish/Tamil third-party talk becomes *student crisis* instead of *third-party concern* |
| Hinglish | mera dost marna chahta hai | My friend wants to die | Same |
| Tamil | என் நண்பன் தற்கொலை பற்றி பேசுகிறான் | My friend talks about suicide | Same |
| Hindi / Tamil / Telugu | आत्महत्या रोकथाम / தற்கொலை தடுப்பு / ఆత్మహత్య నివారణ | "Suicide prevention" | The bare word for *suicide* triggers crisis (English requires e.g. "commit/attempt suicide") |
| Telugu | నాకు చనిపోవాలని లేదు | I do **not** want to die | `చనిపోవాల` matches regardless of the negation |

**Decisions for the clinical lead:**
1. Should a bare native-script word for *suicide* trigger crisis (safer, noisier) or require a first-person verb?
2. What is the canonical list of colloquial first-person phrasings per language, including romanized Tamil and Telugu?
3. Which native-script third-party markers should downgrade to *third-party concern* (e.g. दोस्त/मेरा भाई, நண்பன்/நண்பி, స్నేహితుడు)?

Over-triggering errs on the safe side, so the misses table is the priority. I did not add patterns I could not validate. Once reviewers supply the phrase lists, each becomes a one-line regex plus a test.

## D. WSAS and ReQoL-10 removal (product requirement)

**Removed:**
- **Server scoring:** `WSAS_CONFIG`, `scoreWSASResponses`, `REQOL10_CONFIG` and `scoreReQoL10Responses` are gone from `convex/clinicalScoring.ts`. `InstrumentId` is now `phq9 | gad7 | pq16`.
- **Submission:** `submitScreeningAttempt` no longer accepts `wsas` or `reqol10` responses. The validator rejects them, and nothing about them is scored, stored or returned.
- **Read paths:** every query that returns attempts or legacy screenings strips old placeholder fields:
  - `getLatestAttempt`
  - `getLatestRawAttempt`
  - `getScreeningHistory`
  - `getAllAttempts`
  - `getAttemptById`
  - `getAttemptWithTriage`
  - `getLatest`
  - `getAll`
- **Client:**
  - the instrument definitions and type in `constants/Screening.ts`;
  - `interpretWSAS`;
  - the WSAS/ReQoL fields in `utils/triage|insights|microgoals`;
  - the CSV export columns;
  - the dashboard timeline tiles.

**Legacy data:** earlier versions wrote placeholder WSAS/ReQoL entries into **every** screening attempt. The schema keeps those fields as optional, marked `RETIRED`, only so existing documents still validate on deploy. Run `screening:purgeRetiredInstrumentData` (section A, step 3) to delete them. A later change can then drop the schema fields entirely.

**Tests:** scoring exports contain no WSAS/ReQoL; submissions carrying them are rejected; stored attempts contain only the three instruments; legacy data is never returned; the purge clears both tables and is internal-only.

---

## E. FIXED: detail by action

1. **JWT key.**
   - **Key moved out of source:** the private key was removed from source. Signing uses `JWT_PRIVATE_JWK`, the JWKS is derived from it, and the issuer is `CONVEX_SITE_URL`. `scripts/generate-jwt-key.mjs` creates keys.
   - **No clerkId tokens:** a legacy clerkId is no longer accepted as a token subject.
   - **Safer temporary passwords:** they are generated with `crypto.getRandomValues` and never stored in plain text.
2. **Exploitable endpoints.**
   - **Removed:** `patients.getPatients`, `triage.processTriage` and `screening.submitScreening`.
   - **Locked down:**
     - `patients.createPatient` is now admin-only;
     - `cbt.getRecentPatientGoals` is now internal;
     - `getAndClearTempPassword` was replaced by an internal cleanup job.
3. **Crisis classifier.**
   - **Order:** first-person crisis is checked before idioms and third-party context.
   - **Coverage:** suicidal / thinking about suicide / overdose / don't want to live, Hinglish, and native script (see C).
   - **CBT and companion:** both run the server classifier before the model, and the model can only *raise* risk. The mock regex and client-side crisis patterns were replaced by the shared classifier.
4. **Alerts.**
   - **One path:** all safety alerts go through `insertSafetyAlert`, which records `source`/`sourceId` and notifies admins plus the assigned counsellor. The notification says "Student <patientId>", not the name.
   - **Full open list:** the staff alert list shows **every** open alert (pending/escalated/active/acknowledged) through an index, plus the recent resolved ones.
   - **Client:** the client-side `createAlert` call was removed.
5. **Crisis resources.**
   - **One config:** `common/crisisResources.ts` (Tele-MANAS 14416 / 1800-891-4416, emergency 112) is used in the app, the server and all four locales. 988, 911 and 741741 were removed.
   - **Dismissals logged:** dismissing the emergency screen keeps the X but is recorded on the open alert, shown on the clinical timeline and audit-logged.
6. **PHQ-9.**
   - **Wording:** reverted to the validated items, options and instruction.
   - **Versioning:** `PHQ-9.v1` is stored per attempt.
7. **Sessions.**
   - **Live sessions only:** tokens carry a `sid`. Every public query, mutation and action (through `convex/functions.ts`) honours the identity only while that session exists, belongs to the subject and has not expired, and the user is active.
   - **Revocation:** logout, deactivation, deletion and a new sign-in revoke the token immediately.
8. **Companion and TTS.**
   - **Internal helpers:** companion message writes, the rate limiter, telemetry and the context query are internal.
   - **TTS:** requires login and is rate-limited.
9. **Deletion and follow-ups.**
   - **Deletion:** purges 33 user-owned tables in batches that continue in the background. Credentials are wiped and access revoked immediately. Only a redacted tombstone is kept, and deleted students cannot be "restored".
   - **Atomic follow-up:** submitting a screening creates its follow-up and sets `screeningComplete` in the same transaction.
   - **Clinical follow-ups:** students cannot complete them.
10. **Counsellors.**
    - **Caseload model:** a `counsellorAssignments` table. Counsellors see only their caseload on every list, detail and aggregate endpoint; admins see everything.
    - **Dashboard:**
      - counsellor login;
      - a routed **Counsellor requests** queue;
      - admin-only actions hidden;
      - an assignment control on the student page;
      - counsellor account creation.
    - **CI:** `.github/workflows/ci.yml` runs the Convex `tsc`, all tests and the dashboard build. It is green on the PR.

## F. REMAINING (not in the Top 10 scope, or needs people outside engineering)

| Item | Owner | Notes |
|---|---|---|
| Configure `JWT_PRIVATE_JWK` per deployment, deploy, run cleanups, run `verify-deployment.mjs` | You | Section A/B |
| Native-script and romanized crisis phrase review | Native speakers + clinical lead | Section C. Misses are the priority |
| Clinical sign-off on crisis resources (Tele-MANAS 14416, 112) and the emergency-screen copy in all four locales | Clinical lead | Implemented as you decided; not clinically reviewed |
| Assign every existing student to a counsellor | Admin | Unassigned students alert all counsellors |
| Drop the retired WSAS/ReQoL schema fields | Engineering | After `purgeRetiredInstrumentData` has run on every deployment |
| Staff notifications for appointments / counsellor requests still include the student's name | Engineering | Safety alerts already use the patient ID |
| `scratch/` contains committed test scripts with a hard-coded login and a key-generation helper | Engineering | Recommend deleting `scratch/` |
| One session per user: signing in on a second device signs out the first | Product | Matches the original intent, now enforced; confirm it's desired |
| Root `package-lock.json` only installs with `--legacy-peer-deps` | Engineering | CI uses the flag; consider regenerating the lockfile |
| ~140 pre-existing dashboard ESLint errors (mostly `no-explicit-any`) | Engineering | Not gated in CI; unchanged by this work |
| Managed auth (Clerk / Convex Auth) | Future | Explicitly out of scope per your decision |
| UX Phase 2 (contextual Emoty companion) | Next phase | Not started, as instructed |
