# PRIORITY 6 — STUDENT HOME REWORK & MITRA HUMAN AVATAR SYSTEM REPORT

**Product:** Emotify Student Mental-Health Platform (Production-Bound)  
**Execution Phase:** Priority 6  
**Date:** September 27, 2026  
**Status:** COMPLETE & VERIFIED  

---

## 1. Executive Summary

Priority 6 successfully replaces the legacy creature/blob companion representation with a clean, culturally neutral, empathetic, modern **human-type avatar system** (Girl / Boy variants) and reworks the **Student Home** into a safe, calm, uncrowded, and clinically sound entry point into the student's wellbeing journey.

All modifications strictly adhered to non-negotiable clinical safety, authorization, provenance, and data-integrity guardrails:
- **Zero changes** to PHQ-9, GAD-7, or PQ-16 psychometric scoring.
- **Zero changes** to clinical triage algorithms, thresholds, or emergency classifications.
- **Zero modifications** to historical clinical or screening records.
- **Zero raw AI conversation data** exposed on the longitudinal clinical timeline.
- **Authoritative conversation store preserved:** `aiCompanionLogs` remains the sole active conversation store; legacy `companionMessages` duplicate writes remain permanently prevented.
- **Identity isolation preserved:** Avatar and custom companion name preferences are stored cleanly on the canonical `users` document under `mitraPreferences`. Companion customization does NOT alter the student's conversational identity, reset memory, or generate duplicate records.
- **Verification:** 127/127 tests passing (+13 new Priority 6 automated tests), 0 TypeScript errors (`tsc --noEmit`), and clean counselor dashboard production build (`vite build`).

---

## 2. Existing Home Audit

Prior to Priority 6, the Student Home (`app/(auth)/(tabs)/index.tsx`) presented several architectural challenges:
1. **Mood Check-in Decoupling:** The Home inline mood check-in only wrote to high-frequency `emotionLogs` and cached a local string in `SecureStore`, bypassing the authoritative `dailyCheckins` table established in Priority 5.
2. **Missing Crisis Pathways:** When a student was flagged as high-risk/severe by screening triage (`isSevere = true`), the Home did not provide an immediate, accessible safety banner or direct crisis hotline/grounding shortcuts.
3. **Blob Companion Representation:** The hero card rendered an abstract creature illustration that did not reflect the client requirement for an approachable human-type student companion.
4. **Hardcoded Defaults:** Companion references were largely static or lacked seamless multi-locale integration.

---

## 3. Existing Mitra Architecture Audit

1. **State & Preferences:**
   - Companion state was partially managed in `AvatarContext.tsx` with AsyncStorage keys (`@emotify_avatar_name`).
   - The backend `users` schema did not have a dedicated, validated `mitraPreferences` structure.
2. **Conversation Stream:**
   - In Priority 5 Step 2, `aiCompanionLogs` was established as the sole authoritative table for Mitra dialogues.
   - Changing companion attributes must not re-initialize conversation history or fork `aiCompanionLogs`.

---

## 4. Architectural Decisions

1. **Canonical Schema Extension:**
   - Extended `users` table in [`convex/schema.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/schema.ts) with `mitraPreferences`:
     ```typescript
     mitraPreferences: v.optional(v.object({
       name: v.string(),
       avatarGender: v.string(), // "female" | "male"
       avatarVariant: v.optional(v.string()),
       updatedAt: v.optional(v.number()),
     }))
     ```
   - **No duplicate profile tables:** Reused canonical `users` table to maintain 3NF normalization.
2. **Safe Defaults:**
   - Server-enforced defaults: `avatarGender: "female"` (Girl), `name: "Mitra"`.
   - Client-enforced fallback: `MitraAvatar` and `useAvatar()` default gracefully to `female` and `Mitra` even if data is missing or network is offline.
3. **Data Sanitization & Validation:**
   - Backend validation in `updateMitraPreferences` strictly limits gender to `"female" | "male"`.
   - Names are trimmed, control characters (`[\x00-\x1F\x7F]`) are stripped, length is capped at 30 characters, and empty/whitespace inputs fall back to `"Mitra"`.
4. **Daily Check-in Integration:**
   - Home now binds to `api.microGoals.getTodayCheckin` and `api.microGoals.submitMorningCheckin`.
   - Both high-frequency `emotionLogs` and daily `dailyCheckins` are recorded with date-boundary safety.

---

## 5. Files Changed

| File | Type | Changes Made |
| :--- | :--- | :--- |
| [`convex/schema.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/schema.ts) | Backend Schema | Added `mitraPreferences` validator to canonical `users` table. |
| [`convex/users.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/users.ts) | Backend API | Added `getMitraPreferences`, `updateMitraPreferences`, and updated `completeOnboarding` with preferences. |
| [`components/avatar/MitraAvatar.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/components/avatar/MitraAvatar.tsx) | Component | Replaced creature SVG with high-fidelity Girl/Boy human vector companion system with 12 facial states. |
| [`context/AvatarContext.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/context/AvatarContext.tsx) | State Context | Added `avatarGender`, `setAvatarGender`, `setMitraPreferences`, and synchronized offline AsyncStorage with Convex. |
| [`app/(auth)/onboarding/welcome.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/onboarding/welcome.tsx) | Screen | Added optional "Meet Your Companion" card with Girl/Boy switcher and name customization. |
| [`app/(auth)/(tabs)/profile.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/(tabs)/profile.tsx) | Screen | Upgraded companion card and modal with live preview, Girl/Boy selection, and persistent rename. |
| [`app/(auth)/(tabs)/index.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/(tabs)/index.tsx) | Screen | Reworked Student Home: human `MitraAvatar`, daily checkin sync, crisis support card, and calm layout. |
| [`app/(auth)/tools/companion.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/(auth)/tools/companion.tsx) | Screen | Synchronized companion chat header with user's selected `avatarGender` and dynamic `avatarName`. |
| [`i18n/locales/en.json`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/i18n/locales/en.json) | Localization | Added companion customization & safety UI keys in English. |
| [`i18n/locales/hi.json`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/i18n/locales/hi.json) | Localization | Added companion customization & safety UI keys in Hindi. |
| [`i18n/locales/ta.json`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/i18n/locales/ta.json) | Localization | Added companion customization & safety UI keys in Tamil. |
| [`i18n/locales/te.json`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/i18n/locales/te.json) | Localization | Added companion customization & safety UI keys in Telugu. |
| [`convex/mitra_avatar.test.ts`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/mitra_avatar.test.ts) | Automated Tests | 13 comprehensive integration and unit tests covering all Priority 6 requirements. |

---

## 6. Mitra Preference Model

Stored within canonical `users` document:
```typescript
mitraPreferences: {
  name: string;           // default: "Mitra", sanitized, max 30 chars
  avatarGender: string;   // "female" | "male", default: "female"
  avatarVariant?: string; // "default"
  updatedAt?: number;     // timestamp ms
}
```

### Access Control:
- Query: `api.users.getMitraPreferences` validates `assertCanAccessStudent(ctx, targetUserId)`. Students can read only their own preferences; counselors and admins can read assigned students.
- Mutation: `api.users.updateMitraPreferences` validates `assertCanAccessStudent(ctx, targetUserId)`. Students can modify only their own companion preferences.

---

## 7. Default Behavior Matrix

| User Action | Resulting Gender | Resulting Name |
| :--- | :--- | :--- |
| **New user (no action)** | `female` (Girl) | `"Mitra"` |
| **User selects Boy, leaves name empty** | `male` (Boy) | `"Mitra"` |
| **User enters "Aria", leaves avatar untouched** | `female` (Girl) | `"Aria"` |
| **User selects Boy and enters "Rohan"** | `male` (Boy) | `"Rohan"` |
| **User enters empty string or whitespace** | Unchanged or `female` | `"Mitra"` |
| **User sends invalid avatar string (e.g., "alien")** | `female` (Girl) | Unchanged or `"Mitra"` |
| **User logs out and logs in on new device** | Persisted preference | Persisted preference |

---

## 8. Avatar Implementation Details

The new [`components/avatar/MitraAvatar.tsx`](file:///d:/Projects/EmotifyApp/Emotify-Clerk/components/avatar/MitraAvatar.tsx) uses pure React Native SVG vector artwork designed specifically for Emotify:
- **Design Language:** Warm, friendly, approachable, culturally neutral, age-neutral youth characters.
- **Variants:**
  - **Girl (`female`):** Gentle soft-auburn ponytail styling, calm empathetic expressive eyes.
  - **Boy (`male`):** Natural short-tapered hair styling, friendly approachable presentation.
- **Facial States Supported:**
  - `idle`, `happy`, `calm`, `listening`, `thinking`, `sad`, `worried`, `angry`, `tired`, `breathing`, `celebrating`, `supportive`.
- **Motion & Accessibility:**
  - Integrates `AccessibilityInfo.isReduceMotionEnabled()` to disable looping breathing/sway animations for students with vestibular sensitivities.
  - Full `accessibilityLabel` and `accessibilityRole="image"` support.

---

## 9. Student Home Content Organization

The reworked Home (`app/(auth)/(tabs)/index.tsx`) delivers an intentional, calm hierarchy:
1. **Header:** Personalized student greeting, date, and Calm Points balance.
2. **Mitra Hero Card:** Displays the student's chosen human avatar (`avatarGender`), current companion name (`avatarName`), conversational dialogue bubble, quick chat entry pill, and weekly growth streak.
3. **Safety / Crisis Pathway Card:** Appears prominently whenever triage indicates elevated distress (`isSevere = true`), providing 1-tap links to the 988 Crisis Lifeline, counselor appointments, and calming breathing tools.
4. **Daily Mood Check-in:** 4-card illustrated check-in (Good, Calm, Low, Heavy) with intensity selector, synchronized directly with `dailyCheckins`.
5. **Wellbeing Balance:** Humanized progress gauges showing Emotional Balance and Mind Calmness percentages.
6. **Clinical Appointments:** Live schedule overview and countdown for accepted appointments.
7. **Quick Support Tools:** Clear cards for Body Scan, JPMR, Cognitive Reframe, and MicroGoals.

---

## 10. Automated Test Results

Ran full vitest test suite (`npx vitest run`):

```text
 ✓ convex/authz.test.ts (9 tests)
 ✓ convex/dashboard_timeline.test.ts (12 tests)
 ✓ convex/longitudinal.test.ts (8 tests)
 ✓ convex/provenance.test.ts (7 tests)
 ✓ convex/authorization.test.ts (12 tests)
 ✓ convex/mitra_avatar.test.ts (13 tests)
 ✓ convex/cbt.test.ts (2 tests)
 ✓ convex/timeline.test.ts (20 tests)
 ✓ convex/hardening.test.ts (17 tests)
 ✓ convex/screening.test.ts (17 tests)
 ✓ convex/auth.test.ts (10 tests)

 Test Files  11 passed (11)
      Tests  127 passed (127)
   Duration  6.77s
```

### Priority 6 Specific Test Coverage (`convex/mitra_avatar.test.ts`):
- `MITRA-01`: New user receives default Girl ('female') and 'Mitra' name.
- `MITRA-02`: User can select Boy avatar and persist preference.
- `MITRA-03`: User can select Girl avatar and persist preference.
- `MITRA-04`: User can set and change companion custom name.
- `MITRA-05`: Missing or whitespace-only name falls back safely to 'Mitra'.
- `MITRA-06`: Invalid avatar value falls back safely to 'female'.
- `MITRA-07`: Name validation strips control characters and enforces 30 character limit.
- `MITRA-08`: Changing avatar or name does NOT create new conversation or duplicate messages in `aiCompanionLogs`.
- `MITRA-09`: Student A cannot read Student B's Mitra preferences (Access denied / Unauthorized).
- `MITRA-10`: Student A cannot update Student B's Mitra preferences.
- `MITRA-11`: Authorized counselor can read student's Mitra preferences.
- `HOME-01`: Daily check-in integrates with `dailyCheckins` and `getTodayCheckin`.
- `ONBOARDING-01`: `completeOnboarding` persists optional `mitraPreferences`.

---

## 11. Typecheck and Build Verification

1. **TypeScript Typecheck (`npx tsc --noEmit`):**
   - **Result:** 0 errors across entire repository.
2. **Dashboard Production Build (`npm run build` in `dashboard/`):**
   - **Result:** Success (`tsc -b && vite build` built in 775ms with 0 errors).

---

## 12. Classification of Deliverables

### IMPLEMENTED
- Human-type vector avatar component with Girl and Boy variants and 12 facial states.
- Canonical `users.mitraPreferences` schema and backend APIs (`getMitraPreferences`, `updateMitraPreferences`).
- Safe default handling (Girl + "Mitra") on both client and server.
- Optional companion customization card during onboarding (`welcome.tsx`).
- In-app companion customization modal in Profile settings (`profile.tsx`).
- Student Home rework with human companion hero, crisis safety card, and daily check-in integration.
- Localization in English, Hindi, Tamil, and Telugu for all companion and safety UX keys.
- Comprehensive automated test suite (13 new tests, 127 total tests passing).

### READY BUT NOT IMPLEMENTED
- Multi-variant skin tone or apparel customization (architecture is primed via `avatarVariant`, but not requested in Priority 6 scope).
- Voice response gender matching (voice models currently select from 5 emotional tone presets: calm, warm, grounded, empathetic, uplifting).

### BLOCKED / REQUIRES CLINICAL OR PRODUCT APPROVAL
- None within Priority 6 scope.

---

## 13. Recommended Next Priority 6 / Priority 7 Step

- **Recommendation:** Proceed to end-to-end device testing of the Student Home on Android/iOS emulators and real devices to observe micro-interactions, keyboard handling during companion renaming, and offline daily check-in caching under flight mode conditions.
