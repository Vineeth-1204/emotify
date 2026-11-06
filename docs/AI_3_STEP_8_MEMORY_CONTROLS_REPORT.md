# EMOTIFY AI-3 STEP 8: USER MEMORY & PREFERENCE CONTROLS REPORT

## 1. Status
**Status:** COMPLETED & LOCKED (All Gates Passed)  
**Date:** October 4, 2026  
**Implementation Phase:** AI-3 Step 8 — User Memory & Preference Controls  

---

## 2. Existing Profile Architecture Inspected
Inspection of the existing profile architecture in [app/(auth)/(tabs)/profile.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/%28auth%29/%28tabs%29/profile.tsx) revealed:
- **Signature Header:** Student avatar initials, alias, and account status.
- **Wellness Identity Section:** Personal style, mood pattern, energy pattern, and wellness goals.
- **Companion Customization Section:** Avatar preview, customize name/gender modal, and AI Voice configuration toggles.
- **Account Details Section:** Campus, department, year, gender, and emergency contact details.
- **Settings & Security Section:** Biometric login toggle and multi-language picker.
- **Help & Support Section:** Direct emergency helpline and crisis calling card.
- **Data Management Export Section:** Local CSV export for screening history.

**Placement Decision:**  
The Emoty Preferences section was integrated directly after the **Companion Customization Section** in `profile.tsx` as a dedicated card. This naturally links the companion's persona with its conversational personalization settings without cluttering account or security sections.

---

## 3. UI Location Selected & Visual Language
- **File:** [components/profile/EmotyPreferencesSection.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/components/profile/EmotyPreferencesSection.tsx)
- **Host Screen:** [app/(auth)/(tabs)/profile.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/%28auth%29/%28tabs%29/profile.tsx) (immediately following Companion Customization, preceding Account Details).
- **Styling:** Adheres strictly to the app's established design tokens from `Theme` and `useThemeColors`, utilizing card containers, soft border outlines, and reassurance badges.

---

## 4. Screens & Components Changed
1. **[common/emotyPreferencesConfig.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/common/emotyPreferencesConfig.ts) (New):**
   - Provides human-readable category and value formatters.
   - Defines preset items for controlled selection without free-form injection.
   - Defines category metadata (labels, icons, descriptions).
2. **[components/profile/EmotyPreferencesSection.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/components/profile/EmotyPreferencesSection.tsx) (New):**
   - Reactive list of active preferences using `useQuery(api.emotyMemory.listUserPreferences)`.
   - Distinct reassurance banner communicating separation from clinical records.
   - Individual remove/deactivate action with confirmation.
   - Clear All action with explicit destructive confirmation.
   - Modal bottom sheet with category tabs and preset choices for controlled adjustment.
   - Controlled Chosen Name input with strict validation (2–25 chars, alphanumeric/spaces only).
3. **[app/(auth)/(tabs)/profile.tsx](file:///d:/Projects/EmotifyApp/Emotify-Clerk/app/%28auth%29/%28tabs%29/profile.tsx):**
   - Embedded `<EmotyPreferencesSection isReady={isReady} />` within the main scroll layout.
4. **[convex/emotyMemory.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/emotyMemory.ts):**
   - Added `USER_FACING_PREFERENCE_CATEGORIES` allowlist.
   - Added `listUserPreferences` query that filters strictly to active, non-expired personalization preferences and excludes conversation summaries or internal metadata.
5. **[convex/emotyMemoryControls.test.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/emotyMemoryControls.test.ts) (New):**
   - Added 16 focused unit and integration tests covering PREF-01 through PREF-16.

---

## 5. Available Preference Categories Exposed to User
Only explicit, frozen non-sensitive categories are exposed:
1. **Communication Style (`communication_preference`):**
   - Concise: "Keep responses concise" (Brief, direct responses that get straight to the point).
   - Detailed: "Detailed explanations" (Thoughtful explanations with extra context and depth).
   - Casual: "Casual and warm tone" (Friendly, relaxed everyday conversational style).
   - Supportive: "Gentle and encouraging" (Calm, supportive and validating tone).
2. **Support Preferences (`support_preference`):**
   - Breathing exercises: "Breathing exercises" (Box breathing, 4-7-8, or calming breathwork).
   - Grounding exercises: "5-4-3-2-1 Grounding" (Sensory grounding when overwhelmed).
   - Journaling: "Reflective journaling" (Guided reflection and written prompts).
   - Listening mode: "Active listening mode" (Listens first without rushing to solutions).
3. **Routine Timing (`routine_preference`):**
   - Morning: "Morning routine focus" (Setting intentions and goals early in the day).
   - Evening: "Evening reflection focus" (Winding down and reviewing the day at night).
4. **Goal Setting Style (`goal_preference`):**
   - Small steps: "Smaller achievable steps" (Micro-goals that avoid feeling overwhelmed).
   - Structured milestones: "Structured milestones" (Step-by-step milestones to track progress).
5. **Chosen Name (`chosen_name`):**
   - Controlled text input for preferred display name or nickname.

*Note: `conversation_summary` is strictly excluded from user-facing editable preferences.*

---

## 6. User Control Behavior & Copywriting

### 6.1. User-Facing Clarity
The UI communicates clear separation through prominent copy:
- **Title:** "Emoty Preferences"
- **Subtitle:** "These preferences help Emoty personalize your conversations and suggestions. They are separate from your mental-health assessments and counselor information."
- **Isolation Banner:** "Non-sensitive personalization only. Clinical screenings, triage, and counselor records are never stored here."

### 6.2. Individual Deletion
- Tapping the delete icon prompts:  
  `Remove "[Preference Value]" from your [category]?`
- Calling `api.emotyMemory.deleteUserMemory({ memoryId })` deletes the entry and immediately updates the UI via Convex reactive subscription.

### 6.3. Clear All Preferences
- Tapping "Clear All" displays an explicit confirmation dialog:  
  **Title:** "Clear Emoty preferences?"  
  **Message:** "This removes the preferences Emoty uses to personalize conversations. Your assessments, counselor information, and other app records are not affected."  
  **Buttons:** "Cancel" | "Clear preferences"  
- Calling `api.emotyMemory.clearAllUserMemories` wipes all personalization preferences for the user without touching clinical, screening, or counselor records.

---

## 7. Authorization Verification
- All queries (`listUserPreferences`) and mutations (`recordUserPreference`, `deleteUserMemory`, `clearAllUserMemories`) rely strictly on `ctx.auth.getUserIdentity()`.
- Client-supplied `userId` is never trusted or accepted from navigation parameters or payloads.
- Cross-user mutations are rejected with `Forbidden: Cannot modify another user's memory` or `Cannot delete another user's memory`.
- Unauthenticated queries return `[]`, and unauthenticated mutations throw `Unauthenticated`.

---

## 8. Clinical-Data Isolation Verification
- **Screening Data (`screenings`, `screeningAttempts`):** Completely untouched by preference mutations or clear-all operations.
- **Clinical Triage (`triages`):** Completely isolated; zero interaction with `emotyMemories`.
- **Safety Alerts (`alerts`, `safetyAlerts`):** Retain authoritative state and pending statuses.
- **Counselor Requests (`counsellorRequests`):** Preserved without modification.
- **Crisis Gate (`classifyServerSafety`):** CRISIS state completely suppresses model execution and delivers deterministic emergency resources (Tele-MANAS / 988) regardless of stored preferences.

---

## 9. Tests Added
16 focused tests in [convex/emotyMemoryControls.test.ts](file:///d:/Projects/EmotifyApp/Emotify-Clerk/convex/emotyMemoryControls.test.ts):
- **PREF-01:** Authenticated user can retrieve own preferences.
- **PREF-02:** User sees only active preferences.
- **PREF-03:** User can deactivate one preference.
- **PREF-04:** Deactivated preference disappears from active context.
- **PREF-05:** User can clear all Emoty preferences.
- **PREF-06:** Clear-all does not affect clinical tables (`triages`, `alerts`).
- **PREF-07:** Clear-all does not affect screening data (`screenings`).
- **PREF-08:** Clear-all does not affect counselor data (`counsellorRequests`).
- **PREF-09:** Cross-user preference access is rejected.
- **PREF-10:** Unauthenticated access is rejected.
- **PREF-11:** Only frozen memory categories are exposed (`listUserPreferences` excludes conversation summaries).
- **PREF-12:** Arbitrary category/key cannot be created from UI.
- **PREF-13:** Updating a preference uses existing deduplication behavior (updates in place).
- **PREF-14:** Removed preference is no longer injected into Context Manager.
- **PREF-15:** Memory context remains capped at 5 items / 500 characters.
- **PREF-16:** CRISIS behavior remains unchanged and suppresses Gemini.

---

## 10. Full Test & Build Verification Results

### 10.1. Step 8 Test Suite
```
Command: npx vitest run convex/emotyMemoryControls.test.ts
Result: 16 passed (16 tests)
```

### 10.2. All AI-3 Test Suites
```
Command: npx vitest run emoty
Result: 9 passed (9 files), 189 passed (189 tests, 0 failures)
- emotyAvatarVisual.test.ts (26 tests)
- emotyIntent.test.ts (20 tests)
- emoty.test.ts (14 tests)
- emotyActionRouter.test.ts (33 tests)
- emotyMemoryControls.test.ts (16 tests)
- emotyAvatar.test.ts (24 tests)
- emotyMemory.test.ts (20 tests)
- emotyContext.test.ts (15 tests)
- emotySafety.test.ts (21 tests)
```

### 10.3. Full Vitest Suite
```
Command: npx vitest run
Result: 55 passed (55 files), 980 passed (980 tests, 0 failures)
Duration: 17.78s
```

### 10.4. TypeScript Check
```
Command: npx tsc --noEmit
Result: 0 errors (clean exit code 0)
```

### 10.5. Counselor Dashboard Build
```
Command: npm run build (in dashboard)
Result: tsc -b && vite build
✓ 2409 modules transformed
✓ built in 932ms (clean exit code 0)
```

### 10.6. Android Release Build
```
Command: .\gradlew.bat assembleRelease (in android)
Result: BUILD SUCCESSFUL in 1m 2s (609 actionable tasks, clean exit code 0)
```

---

## 11. Files Changed
1. `common/emotyPreferencesConfig.ts` — Human-readable labels, preset definitions, and display formatters.
2. `components/profile/EmotyPreferencesSection.tsx` — User preferences card, list, actions, and selection modal.
3. `app/(auth)/(tabs)/profile.tsx` — Integrated `EmotyPreferencesSection` into the student profile screen.
4. `convex/emotyMemory.ts` — Added `USER_FACING_PREFERENCE_CATEGORIES` and `listUserPreferences` query.
5. `convex/emotyMemoryControls.test.ts` — 16 unit and integration tests (PREF-01 to PREF-16).

---

## 12. Known Limitations
- Preferences are configured via predefined presets and controlled inputs. Free-form text prompts are deliberately blocked to preserve safety and clinical isolation.
- Automatic multi-session conversation summarization remains deferred as noted in Step 7.

---

## 13. Explicit Confirmation on Deferred Work
- **Automatic conversation summarization:** Remains deferred.
- **RAG / Vector search / Embeddings:** Not implemented.
- **Proactive push notifications / reminders:** Not implemented.
- **Clinical data alterations:** Zero modifications to clinical tables, screening attempts, triage ratings, counselor requests, or safety alerts.
