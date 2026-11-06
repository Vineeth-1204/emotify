# EMOTIFY — Phase 0 Audit: Source-of-Truth Reference Document

**Project:** EMOTIFY — Avatar-First UX Transformation  
**Phase:** Phase 0 (Audit & Source of Truth)  
**Deliverable per Spec:** A single reference doc containing the emoji inventory, emotion/intensity vocabulary, activity category list, platform constraints, screen inventory, and populated data dictionaries.

---

## 0.1 Emoji Inventory & Proposed SVG Replacement Checklist

Total student-facing emoji occurrences audited: **163** across **all 14 files**.

### Complete 14-File Breakdown (Exact Sum = 163)
| File Location | Emoji Count | Summary of Usages |
|---|---|---|
| `app/(auth)/tools/companion.tsx` | **45** | Starter prompt buttons, contextual chip tags, mood status chips, reactions |
| `app/(auth)/tools/microgoals.tsx` | **39** | Mood chips, goal timing buttons, reward coins/stars, badge shelf, feeling shift icons |
| `constants/Screening.ts` | **24** | Emotion catalog icons, intervention recommendation tags |
| `app/(auth)/tools/emotion-map.tsx` | **15** | Emotion category chips, action tags (breathing, JPMR, goals), insights icon |
| `app/(auth)/(tabs)/index.tsx` | **10** | Quick check tool cards, check-in accents, attendance modal icon |
| `app/(auth)/tools/reframe.tsx` | **9** | Grounding 5 senses icons, counsellor notice bell, celebration title |
| `app/(auth)/(tabs)/tools.tsx` | **7** | Catalog card category icons, empty state plant |
| `app/(auth)/onboarding/welcome.tsx` | **6** | Hero sprout, disclaimer clipboard, 4 feature bullet icons |
| `app/(auth)/tools/recovery-plan.tsx` | **3** | Coin token, streak flame, AI tip lightbulb |
| `app/(auth)/(tabs)/profile.tsx` | **1** | Encouragement footer plant |
| `app/(auth)/(tabs)/_layout.tsx` | **1** | High-risk triage warning banner |
| `app/(auth)/onboarding/consent.tsx` | **1** | Checkbox agreement indicator |
| `app/(auth)/onboarding/emergency.tsx` | **1** | Safety contact callout info icon |
| `app/(auth)/tools/appointments.tsx` | **1** | Booking confirmation celebration icon |
| **Total** | **163** | **100% accounted for across all 14 student-facing files** |

*(Note: In addition, backend `convex/alerts.ts` contains 3 emojis and `convex/companion.ts` contains 1 emoji in server strings, which are audited and will be cleaned as part of the widened lint scope).*

### Detailed Line-by-Line Inventory
| File Location | Line | Current Emoji | Semantic Purpose / Context | Proposed SVG Replacement |
|---|---|---|---|---|
| `app/(auth)/(tabs)/_layout.tsx` | 55 | ⚠️ | High-risk triage/counsellor alert banner | `ShieldAlertIcon.tsx` (`/assets/system/safety.svg`) |
| `app/(auth)/(tabs)/index.tsx` | 401 | 🗺️ | Quick Check / Emotion Map tool icon | `EmotionMapIcon.tsx` (`/assets/system/emotion-map.svg`) |
| `app/(auth)/(tabs)/index.tsx` | 402 | 🧘 | Relax Now / JPMR tool icon | `RelaxIcon.tsx` (`/assets/activities/breathing.svg`) |
| `app/(auth)/(tabs)/index.tsx` | 403 | 🧠 | Reframe Thoughts tool icon | `ReframeIcon.tsx` (`/assets/activities/journaling.svg`) |
| `app/(auth)/(tabs)/index.tsx` | 404 | 🎯 | MicroGoals habits tool icon | `TargetIcon.tsx` (`/assets/system/progress.svg`) |
| `app/(auth)/(tabs)/index.tsx` | 436 | 🌟 | Alert confirmation "Mood Logged!" | Vector checkmark or Mitra happy spark token |
| `app/(auth)/(tabs)/index.tsx` | 459 | 🌟 | Inline check-in alert confirmation | Vector checkmark or Mitra happy spark token |
| `app/(auth)/(tabs)/index.tsx` | 491 | 👋 | User greeting wave | Avatar welcoming wave gesture or subtle text |
| `app/(auth)/(tabs)/index.tsx` | 524 | 🌟 | Inline check-in title accent | Subdued vector spark/star token |
| `app/(auth)/(tabs)/index.tsx` | 810 | 🌟 | Modal header accent | Subdued vector spark/star token |
| `app/(auth)/(tabs)/index.tsx` | 901 | 🙏 | Attendance thank-you modal icon | Mitra encouraging posture or warm heart SVG |
| `app/(auth)/(tabs)/profile.tsx` | 177 | 🌱 | Encouragement footer badge | `SproutProgressIcon.tsx` (`/assets/system/progress.svg`) |
| `app/(auth)/(tabs)/tools.tsx` | 91 | 🗺️ | Emotion mapping catalog card | `EmotionMapIcon.tsx` (`/assets/system/emotion-map.svg`) |
| `app/(auth)/(tabs)/tools.tsx` | 101 | 🧑 | AI Companion catalog card | `MitraHeadIcon.tsx` (`/assets/avatar/calm.svg`) |
| `app/(auth)/(tabs)/tools.tsx` | 111 | 🧘 | JPMR catalog card | `RelaxIcon.tsx` (`/assets/activities/breathing.svg`) |
| `app/(auth)/(tabs)/tools.tsx` | 121 | 🧠 | Reframe catalog card | `ReframeIcon.tsx` (`/assets/activities/journaling.svg`) |
| `app/(auth)/(tabs)/tools.tsx` | 131 | 🎯 | MicroGoals catalog card | `TargetIcon.tsx` (`/assets/system/progress.svg`) |
| `app/(auth)/(tabs)/tools.tsx` | 141 | 📅 | Appointments catalog card | `CalendarIcon.tsx` (`/assets/system/counsellor.svg`) |
| `app/(auth)/(tabs)/tools.tsx` | 215 | 🌱 | Empty category illustration | `EmptyStateIcon.tsx` (`/assets/system/empty-state.svg`) |
| `app/(auth)/onboarding/consent.tsx` | 66 | ✓ | Checkbox agreement indicator | Native SVG checkmark |
| `app/(auth)/onboarding/emergency.tsx` | 71 | 💡 | Info callout banner | Info circle vector icon |
| `app/(auth)/onboarding/welcome.tsx` | 40 | 🌱 | Welcome hero badge | `WelcomeSproutIcon.tsx` |
| `app/(auth)/onboarding/welcome.tsx` | 48 | 📋 | Disclaimer card title | Info document vector icon |
| `app/(auth)/onboarding/welcome.tsx` | 66 | 🧠 | Feature: Understand emotions | `BrainVectorIcon.tsx` |
| `app/(auth)/onboarding/welcome.tsx` | 67 | 📊 | Feature: Track wellbeing | `ChartVectorIcon.tsx` |
| `app/(auth)/onboarding/welcome.tsx` | 68 | 🛠️ | Feature: Helpful coping tools | `ToolsVectorIcon.tsx` |
| `app/(auth)/onboarding/welcome.tsx` | 69 | 🤝 | Feature: Connect to support | `HandshakeVectorIcon.tsx` |
| `app/(auth)/tools/appointments.tsx` | 381 | 🎉 | Booking confirmation celebration | `SuccessBadgeIcon.tsx` (`/assets/system/success.svg`) |
| `app/(auth)/tools/companion.tsx` | 40 | 😰 | Starter prompt: Stressed | `StressIcon.tsx` (`/assets/emotions/stress.svg`) |
| `app/(auth)/tools/companion.tsx` | 41 | 📅 | Starter prompt: Day review | `CalendarIcon.tsx` (`/assets/system/reminder.svg`) |
| `app/(auth)/tools/companion.tsx` | 42 | 🔥 | Starter prompt: Motivate | `EnergyIcon.tsx` (`/assets/activities/walking.svg`) |
| `app/(auth)/tools/companion.tsx` | 43 | 💬 | Starter prompt: Talk | `ChatIcon.tsx` (`/assets/activities/talking.svg`) |
| `app/(auth)/tools/companion.tsx` | 59–69 | 🫂, 🌿, 💭, 🙏, 🎵, ✨ | Contextual chips (breathe, reflect, gratitude, music) | Matching custom SVG activity icons |
| `app/(auth)/tools/companion.tsx` | 149–163 | 😌, 😊, 😢, 😰, 😡, 🤪, 🎨, ❤️, 🕊️, 🤢 | Companion mood indicator badges | Official 8 emotion SVG icons (`/assets/emotions/`) |
| `app/(auth)/tools/companion.tsx` | 394 | 📋 | Alert title: Copied | Vector checkmark or toast |
| `app/(auth)/tools/companion.tsx` | 434 | 🌟 | Alert title: Mood Logged | Vector checkmark |
| `app/(auth)/tools/companion.tsx` | 444–450 | ❤️, 😴, 🌿 | Conversational memory prompt accents | Clean typography without emoji |
| `app/(auth)/tools/companion.tsx` | 460 | 🌟 | Check-in title accent | Clean typography |
| `app/(auth)/tools/companion.tsx` | 464–467 | 😌, 🙂, 😔, 😰 | In-chat mood buttons | Reusable SVG Emotion cards |
| `app/(auth)/tools/companion.tsx` | 729 | ❤️, 👍, 😮, 😢, 🙏 | In-chat message reaction bar | Clean SVG reaction shapes (heart, thumbs-up, etc.) |
| `app/(auth)/tools/emotion-map.tsx` | 19–26 | 😰, 😢, 😡, 🍃, 🥱, ❓, ☀️, 🫥 | Local feature emotion tags | Official E01–E08 SVGs (`/assets/emotions/`) |
| `app/(auth)/tools/emotion-map.tsx` | 278 | 📔 | Alert: Journal Saved | Vector checkmark |
| `app/(auth)/tools/emotion-map.tsx` | 636 | 🫁 | Recommended action: Breathing | `BreathingIcon.tsx` (`/assets/activities/breathing.svg`) |
| `app/(auth)/tools/emotion-map.tsx` | 648 | 🧘 | Recommended action: JPMR | `RelaxIcon.tsx` (`/assets/activities/breathing.svg`) |
| `app/(auth)/tools/emotion-map.tsx` | 660 | 🎯 | Recommended action: MicroGoals | `TargetIcon.tsx` (`/assets/system/progress.svg`) |
| `app/(auth)/tools/emotion-map.tsx` | 672 | ⏰ | Recommended action: Reminder | `ClockIcon.tsx` (`/assets/system/reminder.svg`) |
| `app/(auth)/tools/emotion-map.tsx` | 726 | 💡 | Wellness insights header | Vector lightbulb or subtle badge |
| `app/(auth)/tools/emotion-map.tsx` | 829 | 🫁 | Guided breathing modal title | `BreathingIcon.tsx` |
| `app/(auth)/tools/microgoals.tsx` | 18–24 | 😊, 🙂, 😐, 😔, 😣, 😴, 😡 | Mood selector chips | Reusable SVG Emotion cards |
| `app/(auth)/tools/microgoals.tsx` | 157, 178 | ⏰, 😴 | Alert titles: Goal Scheduled / Snoozed | Native modal / toast without emoji |
| `app/(auth)/tools/microgoals.tsx` | 389–401 | 🪙, 🔥, ❄️ | Currency / streak / freeze icons | Custom vector tokens (`CalmCoin.tsx`, `Flame.tsx`, `Ice.tsx`) |
| `app/(auth)/tools/microgoals.tsx` | 439 | 🌅 | Morning Check-in header | `SunRiseIcon.tsx` |
| `app/(auth)/tools/microgoals.tsx` | 546 | 🗓️ | Weekly missions header | `CalendarMissionIcon.tsx` |
| `app/(auth)/tools/microgoals.tsx` | 585 | 💰, ⭐ | Reward banner: Coins & XP | Custom SVG coin & star vectors |
| `app/(auth)/tools/microgoals.tsx` | 600, 624, 639 | 🏆, 🏅 | Monthly challenge & badge icons | Custom SVG Trophy & Medal vectors |
| `app/(auth)/tools/microgoals.tsx` | 665, 681 | 📊, 🧠 | Analytics headers | Custom vector icons |
| `app/(auth)/tools/microgoals.tsx` | 687–690, 867–869 | 😐, 😊, ☹️ | Feeling shift indicators (Better/Same/Worse) | Custom vector outcome indicators |
| `app/(auth)/tools/microgoals.tsx` | 694, 749 | 🎯 | Goal title prefix | Goal category SVG badge |
| `app/(auth)/tools/microgoals.tsx` | 707 | 📝 | History timeline header | Timeline vector icon |
| `app/(auth)/tools/microgoals.tsx` | 770 | ⏰ | Schedule button text | Clock vector icon |
| `app/(auth)/tools/microgoals.tsx` | 806–811 | ⚡, ⏰, 🌅, 🌙 | Time offset buttons | Clean typography / vector timing badges |
| `app/(auth)/tools/microgoals.tsx` | 889 | 🎉 | Celebration title | `CelebrationBadge.tsx` (`/assets/system/success.svg`) |
| `app/(auth)/tools/recovery-plan.tsx` | 152, 158 | 🪙, 🔥 | Reward coin & streak indicators | Custom vector tokens |
| `app/(auth)/tools/recovery-plan.tsx` | 260 | 💡 | AI recommendation note | Vector lightbulb icon |
| `app/(auth)/tools/reframe.tsx` | 537 | 🔔 | Counsellor alert notice | Vector notification bell |
| `app/(auth)/tools/reframe.tsx` | 618–622 | 🖐️, 👉, 👂, 🌸, 👅 | 5-4-3-2-1 Grounding sensory step icons | Custom sensory SVG set (Eye, Touch, Ear, Scent, Taste) |
| `app/(auth)/tools/reframe.tsx` | 689, 690 | 🎯, 🕊️ | Win-list / gentle skip messages | Custom microgoal icon / Mitra soft encouragement |
| `app/(auth)/tools/reframe.tsx` | 883 | 🎉 | Reflection completed title | `SuccessBadgeIcon.tsx` |
| `constants/Screening.ts` | 117–187 | 😊, 😌, 😔, 😟, 😡, 😳, 😞, 😴 | Emotion catalog emoji properties | Converted to SVG component mapping |
| `constants/Screening.ts` | 205–257 | 🌬️, 🧘, ❤️, 🌿, 🌸, ⭐ | Recommendations student-facing labels | Pure clean typography + SVG references |

---

## 0.2 Emotion & Intensity Backend API Taxonomy

### 8-Emotion Backend Taxonomy → 4-Card Home Screen Mapping

The backend clinical model operates on 8 distinct emotions (`E01`–`E08`). To satisfy Section 8's low-cognitive-load principle ("SEE → TAP → FEEL → DO") on the Home screen, 4 primary card clusters are displayed. Below is the strict, deterministic mapping:

| Home Screen Card | Primary Backend Enum & Code | Collapsed / Secondary Emotions | Mitra Avatar Reaction State | Where Secondary Emotions Surface in UI | Downstream Triage & Alert Impact |
|---|---|---|---|---|---|
| **Good** | `happy` (`E01`) | Joyful, excited, energized | `avatar-happy` | Expressed directly on Home. | Normal self-help / positive reinforcement. |
| **Calm** | `calm` (`E02`) | Peaceful, settled | `avatar-calm` | Expressed directly on Home. | Normal self-help / maintenance. |
| **Low** | `sad` (`E03`) | `guilty` (`E07`), `tired` (`E08`) | `avatar-sad` | When selected, Mitra's speech bubble can offer a 1-tap chip: *"Low mood, exhausted, or hard on yourself?"* Full E03/E07/E08 SVGs appear in Emotion Map (`tools/emotion-map`) and CBT Step 3 (`tools/reframe`). | Maps to depression symptom tracking. Stored as `sad` by default, or specific subtype if chipped. |
| **Heavy** | `worried` (`E04`) | `angry` (`E05`), `embarrassed` (`E06`) | `avatar-worried` (tense posture) | When selected, Mitra asks: *"Worry, frustration, or feeling exposed?"* Full E04/E05/E06 SVGs appear in Emotion Map and CBT Step 3. | High intensity on "Heavy" flags anxiety/stress intervention. If paired with clinical risk, routes to Safety priority. |

#### Raw Backend Contracts (Unedited)
1. **`emotionLogs` table:**
   - `emotion`: `v.string()` (e.g., `"happy"`, `"calm"`, `"sad"`, `"worried"`, `"angry"`, `"embarrassed"`, `"guilty"`, `"tired"`).
   - `bodyRegions`: `v.array(v.string())`.
   - `preIntensity`: `v.optional(v.number())` (1–10).
   - `postIntensity`: `v.optional(v.number())` (1–10).
   - `createdAt`: `v.number()`.

2. **`emotionMaps` table:**
   - `emotionLabel`: `v.string()`.
   - `selectedRegions`: `v.array(v.string())`.
   - `bodyRatings`: `v.array(v.object({ region: v.string(), intensity: v.number() }))`.
   - `averageIntensity`: `v.number()`.
   - `suggestedAction`: `v.string()`.

3. **`cbtSessions` table:**
   - `situation`: `v.optional(v.string())`.
   - `automaticThought`: `v.optional(v.string())`.
   - `emotion`: `v.optional(v.string())`.
   - `emotionBefore`: `v.optional(v.number())` (0–10).
   - `beliefScore`: `v.optional(v.number())` (0–100%).
   - `emotionAfter`: `v.optional(v.number())` (0–10).
   - `currentStep`: `v.string()`.
   - `sessionStatus`: `v.string()`.

---

## 0.3 Microgoal / Activity Categories & Avatar Memory Audit

### Categories in Active Codebase (`convex/microGoals.ts`)
1. `Hydration` (`water`, `water_2l`)
2. `Exercise` (`stretch_5`, `walk_20`, `steps_5k`)
3. `Breathing` (`breathe`, `breathe_478`)
4. `Mindfulness` (`outside_brief`, `meditate_15`)
5. `Relaxation` (`music`, `jpmr_full`)
6. `Gratitude` (`gratitude_1`)
7. `Sleep` (`dim_screens`, `sleep_11`)
8. `Self Care` (`wash_face`)
9. `Journaling` (`journal_5`)
10. `Nutrition` (`nutrition_fruit`, `cook_healthy`)
11. `Study Balance` (`study_review`)
12. `Creativity` (`doodle_5`, `hobby_30`)
13. `Social Connection` (`friend_msg`, `friend_call`)
14. `Digital Detox` (`detox_2h`)

### Fields Tracked in Backend for Avatar Memory & Personalization
| Field | Type | Purpose in Avatar Memory (§15) |
|---|---|---|
| `goalId` | `string` | Identifies specific goal (e.g., `water`, `breathe_478`, `walk_20`) |
| `category` | `string` | Maps to activity type for category-based recommendations |
| `completed` | `boolean` | Indicates successful completion |
| `skipped` | `boolean` | Tracked non-punitively; avoids immediate re-push |
| `feelingAfter` | `string` | **Key effectiveness metric:** `"better"` \| `"same"` \| `"worse"`. If `"better"`, avatar says: *"Breathing helped last time. Try it again?"* |
| `completedAt` | `number` | Used to compute cooldown (exclude goals completed within last 48–72 hours to ensure freshness) |
| `createdAt` | `number` | Tracks when the goal was pushed |

---

## 0.4 Stack, Platform, Accessibility & Voice Confirmation

| Parameter | Specification | Execution Details |
|---|---|---|
| **Target Platforms** | Native Mobile (iOS & Android via Expo SDK 54 / React Native 0.81.5) + Web | Native driver required for animations. |
| **Animation Drivers** | `react-native-reanimated` (~4.1.1), `react-native-svg` (15.12.1) | Declarative SVG transforms. Concurrency budget: max 1 primary avatar + 1 secondary environmental animation. |
| **Reduced Motion API** | `AccessibilityInfo.isReduceMotionEnabled()` & `AccessibilityInfo.addEventListener('reduceMotionChanged', ...)` | Must use React Native's native `AccessibilityInfo` API. When enabled, Mitra bypasses looping transforms and displays static expressive SVG frames. |
| **Voice Interaction: TTS** | `expo-speech` (~14.0.8) | Mitra speaks short conversational prompts aloud. Optional button toggle ("Listen"). |
| **Voice Interaction: STT** | Official Speech Recognition (e.g., `expo-speech-recognition` / Web Speech API) | Student speech input. **Fallback rule (Section E):** If mic permission denied or device lacks STT, "Talk" button is completely hidden (never disabled). Check-in seamlessly drops to touch/text without losing state. |
| **Minimum Device Tier** | Mid-tier Android (~3 years prior: Android 11/12, 3GB RAM, octa-core 2.0 GHz) | Target: stable 60fps. Cold load < 150ms. |

---

## 0.5 Screen Inventory (Excessive Text & Emoji Audit Checklist)

All 16 student-facing screens audited:
1. `welcome.tsx` (6 emojis, 3 disclaimer paragraphs) → Converted to Mitra hero, 1-sentence reassurance, clean button.
2. `consent.tsx` (1 emoji, legal terms) → Legal disclosures in clean expandable card; Mitra guides assent.
3. `emergency.tsx` (1 emoji, explanation paragraphs) → 1 clear question: "Who is a grown-up you trust?"
4. `demographics.tsx` (0 emojis, form) → 1 question at a time.
5. `screening.tsx` (0 emojis, clinical titles/scores) → Non-clinical youth framing, 1 item per view, gentle mood summary without clinical jargon.
6. `_layout.tsx` (1 emoji, warning banner) → Replaced with `ShieldAlertIcon.tsx` and gentle reassurance.
7. `index.tsx` (10 emojis, multiple cards/modals) → Mitra central anchor, 4-card SVG emotion check-in, visual intensity pills, visual Calm Points token.
8. `tools.tsx` (7 emojis, category list) → SVG activity badges, visual tool preview cards.
9. `profile.tsx` (1 emoji, stats list) → Visual plant progress space, non-punitive streak metrics.
10. `companion.tsx` (45 emojis, chips/reactions) → Mitra dynamic SVG avatar, vector chips, short conversational prompts, optional voice.
11. `emotion-map.tsx` (15 emojis, 0-10 number stepper) → 4 visual intensity postures, dynamic Mitra reactions.
12. `jpmr.tsx` (0 emojis, 12 spoken paragraphs) → Mitra visual body tension/release and synchronized breathing cycles.
13. `reframe.tsx` (9 emojis, 8-step dialogue, 5 senses text) → 13-step full conversational flow with Mitra, interactive visual 5-4-3-2-1 grounding game.
14. `microgoals.tsx` (39 emojis, mood chips, rewards) → Large visual illustration card per goal, non-punitive skip, celebratory Mitra Calm Point award.
15. `recovery-plan.tsx` (3 emojis, goal lists) → Clean card layout with activity SVGs.
16. `appointments.tsx` (1 emoji, calendar modals) → Mitra supportive presence, clean vector calendar.

---

## Populated Section B Data Dictionaries

### B.1 Emotion Check-In Dictionary

| Backend Enum Value | Student-Facing Label (13–18) | Student-Facing Label (19–24) | Avatar State | SVG Asset Filename |
|---|---|---|---|---|
| `happy` (`E01`) | Good | Good | `avatar-happy` | `/assets/emotions/happy.svg` |
| `calm` (`E02`) | Calm | Calm | `avatar-calm` | `/assets/emotions/calm.svg` |
| `sad` (`E03`) | Low | Low | `avatar-sad` | `/assets/emotions/low-mood.svg` |
| `worried` (`E04`) | Worried | Anxious | `avatar-worried` | `/assets/emotions/worry.svg` |
| `angry` (`E05`) | Frustrated | Tense | `avatar-angry` | `/assets/emotions/anger.svg` |
| `embarrassed` (`E06`) | Self-conscious | Overwhelmed | `avatar-worried` (low) | `/assets/emotions/stress.svg` |
| `guilty` (`E07`) | Hard on myself | Regretful | `avatar-sad` | `/assets/emotions/low-mood.svg` |
| `tired` (`E08`) | Drained | Exhausted | `avatar-tired` | `/assets/emotions/fatigue.svg` |

### B.2 Intensity Dictionary

| Backend Numeric Scale (1–10) | Student-Facing Label | Avatar Posture | SVG / Animation Variant |
|---|---|---|---|
| `1 – 3` | A little | Relaxed, soft breathing | `avatar-calm` |
| `4 – 6` | Some | Slightly concerned, attentive posture | `avatar-worried` (low variant) |
| `7 – 8` | A lot | Visibly tense, tighter posture, faster breathing | `avatar-worried` (high variant) |
| `9 – 10` | Overwhelming | Clearly distressed → routes to Safety Check | `avatar-worried` (max) → `avatar-supportive` |

### B.3 Activity / Microgoal Dictionary

| Backend Category | Short Label (13–18) | Short Label (19–24) | SVG Asset | Avatar Accompanying State |
|---|---|---|---|---|
| `Hydration` | "Grab some water" | "Hydrate" | `/assets/activities/hydration.svg` | `avatar-encouraging` |
| `Exercise` | "Quick stretch?" | "Stretch" | `/assets/activities/stretching.svg` | `avatar-encouraging` |
| `Breathing` | "Breathe with me" | "2-min reset" | `/assets/activities/breathing.svg` | `avatar-breathing` |
| `Mindfulness` | "Look outside" | "Mindful pause" | `/assets/activities/grounding.svg` | `avatar-listening` |
| `Relaxation` | "Play calm music" | "Unwind" | `/assets/activities/breathing.svg` | `avatar-calm` |
| `Gratitude` | "Name 1 good thing" | "Gratitude note" | `/assets/system/positive-memory.svg` | `avatar-encouraging` |
| `Sleep` | "Dim screens" | "Wind down" | `/assets/activities/sleeping.svg` | `avatar-calm` |
| `Self Care` | "Splash cold water" | "Refresh" | `/assets/activities/hydration.svg` | `avatar-encouraging` |
| `Journaling` | "Jot it down" | "Write it out" | `/assets/activities/journaling.svg` | `avatar-listening` |
| `Nutrition` | "Grab a fruit" | "Healthy bite" | `/assets/activities/hydration.svg` | `avatar-encouraging` |
| `Study Balance` | "Study for 5 min" | "5-min focus" | `/assets/activities/studying.svg` | `avatar-encouraging` |
| `Creativity` | "Doodle 5 mins" | "Creative break" | `/assets/activities/hobby.svg` | `avatar-happy` |
| `Social Connection` | "Message a friend" | "Reach out" | `/assets/activities/talking.svg` | `avatar-encouraging` |
| `Digital Detox` | "Phone down 15 min" | "Digital break" | `/assets/system/reminder.svg` | `avatar-calm` |
