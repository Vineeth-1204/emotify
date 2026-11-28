# Emotify — AI-Powered Mental Wellbeing & Clinical Care Platform

[![React Native](https://img.shields.io/badge/React_Native-0.81-61DAFB?logo=react&logoColor=black)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-SDK_54-000020?logo=expo&logoColor=white)](https://expo.dev/)
[![Convex](https://img.shields.io/badge/Backend-Convex-FF5722?logo=convex&logoColor=white)](https://convex.dev/)
[![Google Gemini](https://img.shields.io/badge/AI-Google_Gemini-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Emotify** is a comprehensive, privacy-first mental wellbeing platform designed for students and institutions. It bridges daily emotional care and clinical intervention by pairing an empathetic, voice-dictated AI companion (**Emotify**) with an institutional clinical dashboard for counsellors and administrators—enabling daily mood check-ins, structured Cognitive Behavioral Therapy (CBT), proactive risk detection, and seamless appointment workflows.

---

## 🌟 Key Features

### 📱 1. Mobile Experience (Students & Users)

* **Empathetic AI Companion ("Emotify")**:
  * Powered by Google Gemini with empathetic safety guardrails and contextual emotional understanding.
  * Generates intelligent, compassionate text replies tailored to the user's emotional state.
  * Personalized companion identity: Users can customize their companion's name at any time (default: *Emoty*).
  * Dynamic reactive avatar reacting with visual states (idle, listening, thinking, speaking).
  * One-tap quick actions for grounding: *Tell me more*, *Breathe*, *Reflect*, and *Gratitude*.
* **On-Device Voice Input (Speech-to-Text)**:
  * Integrated with `expo-speech-recognition` for fast, hands-free voice dictation.
  * Enables natural voice input across companion conversations, CBT thought records, and free-text reflections.
  * Privacy-respecting: audio processing occurs directly on-device without streaming microphone audio to third-party speech servers.
* **Cognitive Behavioral Therapy (CBT) Module**:
  * **Structured Thought Records**: Step-by-step guidance to capture triggering situations, automatic negative thoughts, and emotional intensity.
  * **Cognitive Distortion Identification**: Categorizes thinking traps (all-or-nothing thinking, catastrophizing, overgeneralization, emotional reasoning).
  * **Thought Reframing & Positive Growth**: Prompts users to develop balanced, compassionate perspectives and track shift in emotional intensity.
* **Wellbeing & Mindfulness Toolkit**:
  * **4-7-8 Breathing Pacer**: Visual, rhythmic breathing animations paired with haptic feedback for real-time de-escalation and stress reduction.
  * **Gratitude & Daily Journaling**: Guided reflection prompts to cultivate emotional grounding.
  * **Emergency Crisis Support**: Immediate, one-tap hotline dialing for 24/7 human crisis intervention.
* **Clinical Screenings & Longitudinal Insights**:
  * Standardized **PHQ-9** (Depression) and **GAD-7** (Anxiety) assessments with compassionate, non-stigmatizing results presentation.
  * Longitudinal mood history, check-in streaks, factor analytics, and clinical score progression charts.
* **Complete Multilingual Support**:
  * Instant, reactive runtime language switching across all screens without app reload.
  * Supported languages: **English (`en`)**, **Hindi (`hi`)**, **Tamil (`ta`)**, and **Telugu (`te`)**.
* **Reliable Push Notifications**:
  * End-to-end push delivery powered by **Expo Push Service & Firebase Cloud Messaging (FCM v1)**.
  * Dedicated Android notification channels: `appointments`, `reminders`, `important`, and `default`.
  * Routine morning and evening daily check-in reminders and scheduled session updates.
  * Privacy-safe lockscreen copy keeping personal emotional context hidden until the app is unlocked.
  * Built-in diagnostics with live token status and in-app "Send test notification" control in user Profile.
* **Biometric Security & Session Privacy**:
  * Biometric login (Fingerprint / Face ID via `expo-local-authentication`).
  * Cryptographic session tokens (RS256 JWT) signed by Convex and verified against Convex JWKS.

---

### 💻 2. Clinical & Administrative Web Dashboard (Staff & Counsellors)

* **Caseload Management**: Real-time student-to-counsellor assignments, active caseload tracking, and assignment transfer history.
* **Clinical Timeline & Screening Trajectories**: Detailed longitudinal profiles tracking students' mood check-ins, CBT exercises, and screening scores over time.
* **Alerts Center & Risk Triage**: Automated alert triggers for elevated clinical scores, distress patterns, and critical keywords.
* **Appointment Scheduling**: Full session lifecycle management: slot creation, appointment confirmations, rescheduling, and automated mobile push notification triggers.
* **AI Safety Oversight**: Companion dialogue monitoring for safety compliance, sentiment verification, and risk auditing.
* **Audit Trail & Telemetry**: Full security audit logging for student record access and built-in beta feedback reporting.

---

## 🏗️ Architecture & Technology Stack

```text
┌────────────────────────────────────────────────────────────────────────┐
│                             CLIENT LAYER                               │
│                                                                        │
│   📱 React Native Mobile App (Expo 54)   💻 Web Dashboard (Vite/React) │
│   • Expo Router v6 & TypeScript          • React 19 & Tailwind CSS     │
│   • On-Device Speech Dictation (STT)     • Longitudinal Clinical Timelines│
│   • Biometrics (SecureStore/LocalAuth)   • Appointment & Alert Center  │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    ▼                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         CONVEX BACKEND                                 │
│                                                                        │
│   • Reactive Cloud Database (Users, Mood, PushTokens, Appointments)    │
│   • RS256 JWT Session Auth & Token Verification (JWKS)                 │
│   • Google Gemini Companion AI Action (`convex/aiCompanion.ts`)        │
│   • Push Notification Engine & FCM v1 Dispatcher                       │
│   • Automated Crons: Daily Check-In Reminders & Caseload Monitoring    │
└──────────────┬─────────────────────────────┬───────────────────────────┘
               │                             │
               ▼                             ▼
┌─────────────────────────────┐ ┌────────────────────────────────────────┐
│      AI & CLOUD SERVICES    │ │         PUSH DELIVERY PIPELINE         │
│  • Google Gemini API        │ │  Convex Action → Expo Push API         │
│  • Vercel (Dashboard Host)  │ │       → Firebase Cloud Messaging (FCM) │
│                             │ │       → Android System Notification    │
└─────────────────────────────┘ └────────────────────────────────────────┘
```

| Component | Technology |
|---|---|
| **Mobile Framework** | React Native 0.81, Expo SDK 54, Expo Router v6, TypeScript 5.9 |
| **Mobile Speech Input** | `expo-speech-recognition` (on-device speech-to-text dictation) |
| **Mobile UI & Animations** | React Native Reanimated 4, Rive Animations, Lucide & Expo Vector Icons |
| **Web Dashboard** | React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons |
| **Backend & Database** | [Convex](https://convex.dev) Reactive Serverless Platform & Database |
| **AI Companion** | Google Gemini API with emotional safety guardrails |
| **Push Notifications** | Expo Notifications, Firebase Cloud Messaging (FCM v1), Android Channels |
| **Authentication** | Mobile Phone / Password with Convex-issued RS256 JWTs & Biometric Authentication |
| **Local Storage** | `@react-native-async-storage/async-storage` & `expo-secure-store` |
| **Internationalization** | `i18next` & `react-i18next` (English, Hindi, Tamil, Telugu) |

---

## 📂 Project Structure

```text
Emotify-Clerk/
├── app/                        # Expo Router mobile app screens
│   ├── (auth)/                 # Authenticated screens
│   │   ├── (tabs)/             # Home (Check-in), Tools, Insights, Profile
│   │   ├── tools/              # Companion chat, Breathing pacer, CBT modules
│   │   └── screening.tsx       # Standardized PHQ-9 & GAD-7 assessments
│   ├── (public)/               # Public onboarding, login & registration
│   └── _layout.tsx             # Root mobile provider tree & notification handler
├── common/                     # Cross-platform business logic, CBT schemas, dictation
├── components/                 # Reusable UI widgets, breathing pacer, PushStatusRow
├── context/                    # LanguageContext, AvatarContext, MoodThemeContext
├── convex/                     # Convex Backend
│   ├── schema.ts               # Database schema (users, appointments, pushTokens, etc.)
│   ├── users.ts                # Session management, authentication, passwords
│   ├── aiCompanion.ts          # Google Gemini chat actions & prompt engineering
│   ├── pushNotifications.ts    # Expo/FCM push delivery, channels & diagnosis
│   ├── routines.ts             # Scheduled routine check-ins & reminders
│   └── appointments.ts         # Clinical appointment booking & status management
├── dashboard/                  # Staff & Counsellor Web Dashboard (React + Vite)
│   ├── src/pages/              # Overview, Patients, Alerts, Sessions, Analytics
│   └── src/components/         # Caseload charts, risk indicators, calendar
├── hooks/                      # Custom hooks (`usePushNotifications`, `useDictation`, `useAppAuth`)
├── i18n/locales/               # Translation files (`en.json`, `hi.json`, `ta.json`, `te.json`)
└── utils/                      # Notifications, security, formatting helpers
```

---

## 🚀 Getting Started

### Prerequisites
* **Node.js** (v18 or v20 LTS)
* **npm** or **yarn**
* **Expo CLI** & **EAS CLI** (`npm install -g eas-cli`)
* **Android Studio & JDK 17** (for local Android compilation)
* A [Convex](https://convex.dev) account

---

### 1. Installation

Clone the repository and install dependencies:
```bash
git clone https://github.com/Vineeth-1204/emotify.git
cd emotify
npm install

# Install dashboard dependencies
cd dashboard
npm install
cd ..
```

---

### 2. Environment Configuration

Create `.env.local` in the project root:
```env
EXPO_PUBLIC_CONVEX_URL=https://<your-convex-deployment>.convex.cloud
EXPO_PUBLIC_CONVEX_SITE_URL=https://<your-convex-deployment>.convex.site
```

Create `dashboard/.env.local`:
```env
VITE_CONVEX_URL=https://<your-convex-deployment>.convex.cloud
VITE_CONVEX_SITE_URL=https://<your-convex-deployment>.convex.site
```

---

### 3. Configure Convex Backend Secrets

Set the required environment secrets on your Convex deployment:

```bash
# AI Engine
npx convex env set GEMINI_API_KEY <your-gemini-api-key>

# Live Push Notification Delivery
npx convex env set EXPO_PUSH_LIVE true

# (Optional) Expo Access Token if enhanced security is enabled in Expo
npx convex env set EXPO_ACCESS_TOKEN <your-expo-access-token>

# JWT Private Key for Session Auth (generated via scripts/generate-jwt-key.mjs)
npx convex env set JWT_PRIVATE_JWK "<private-key-json>"
```

*(Note: For production deployments, pass `--prod` to `npx convex env set`).*

---

### 4. Running the Development Environment

1. **Start Convex backend**:
   ```bash
   npx convex dev
   ```

2. **Run Mobile App (Expo Metro)**:
   ```bash
   npx expo start
   ```
   *Press `a` to open on an Android emulator or scan the QR code via Expo Go / Development Client.*

3. **Run Staff Web Dashboard**:
   ```bash
   cd dashboard
   npm run dev
   ```

---

## 📦 Building the Android APK

### Option A: Cloud Build via EAS (Recommended)
Generate an installable preview APK directly on Expo's cloud build infrastructure:
```bash
eas build --profile preview --platform android
```
*When complete, scan the terminal QR code or open the build link to install the `.apk` on any Android device.*

### Option B: Local Native Gradle Build
Compile a standalone release APK on your local machine:
```bash
cd android
./gradlew assembleRelease
```
*The resulting APK will be generated at:*  
`android/app/build/outputs/apk/release/app-release.apk`

---

## 🩺 Diagnostic Utilities

Verify your push notification pipeline, registered device tokens, and backend delivery status:
```bash
# Check on dev deployment:
npx convex run pushNotifications:diagnosePush '{}'

# Check on production deployment:
npx convex run --prod pushNotifications:diagnosePush '{}'
```

---

## 🔒 Security & Privacy

* **Zero Client Secrets**: All proprietary API keys (Gemini, Firebase credentials) are securely stored in serverless Convex environments.
* **On-Device Speech Processing**: Voice dictation runs through local Android speech recognition services without streaming raw audio to external third-party endpoints.
* **Privacy-Safe Push Notifications**: Push notification lockscreen banners display neutral reminders without exposing private clinical or emotional context.
* **Session Guarding**: Every client mutation checks for an active session ID (`sid`). Expired, revoked, or replaced sessions are invalidated immediately.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
