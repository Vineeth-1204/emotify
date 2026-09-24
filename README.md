# Emotify — Mental Wellbeing & AI Companion App

[![React Native](https://img.shields.io/badge/React_Native-0.74+-61DAFB?logo=react&logoColor=black)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-SDK_54-000020?logo=expo&logoColor=white)](https://expo.dev/)
[![Convex](https://img.shields.io/badge/Backend-Convex-FF5722?logo=convex&logoColor=white)](https://convex.dev/)
[![Clerk](https://img.shields.io/badge/Auth-Clerk-6C47FF?logo=clerk&logoColor=white)](https://clerk.com/)
[![ElevenLabs](https://img.shields.io/badge/Voice-ElevenLabs_TTS-black?logo=elevenlabs&logoColor=white)](https://elevenlabs.io/)

**Emotify** is a comprehensive, mobile-first mental wellbeing platform and empathetic AI companion designed to provide personalized emotional support, mood logging, clinical assessment tracking, breathing exercises, and natural voice interaction.

---

## Current App Status & Features

### 1. Interactive AI Companion ("Broski")
- **Customizable Avatar**: Users can rename their companion at any time; the personalized name reflects throughout the app, dialogs, and messages.
- **Empathetic Conversational AI**: Integrated with Google Gemini (with rule-based fallback) delivering compassionate, context-aware responses based on user check-ins.
- **One-Tap Quick Actions**: Quick prompts (Tell me more, Breathe, Reflect, Gratitude) for immediate therapeutic interaction.
- **Dynamic Avatar Animation**: The companion avatar reacts dynamically when listening, thinking, and speaking.

### 2. ElevenLabs Text-to-Speech (TTS) Voice Engine
- **Server-Side TTS Integration**: All ElevenLabs synthesis requests route through a secure Convex action (`convex/tts.ts`). **The ElevenLabs API key is never exposed to the client.**
- **Curated Voice Selection**:
  - **Calm** (*Rachel*): Gentle, relaxed, and soothing.
  - **Warm** (*Elli*): Friendly, expressive, and reassuring.
  - **Grounded** (*Adam*): Deep, steady, and anchoring.
  - **Empathetic** (*Antoni*): Soft, compassionate, and understanding.
  - **Uplifting** (*Bella*): Bright, optimistic, and supportive.
- **Instant Voice Previews**: Users can sample each voice before selecting. Multiple audio instances are managed cleanly without overlapping.
- **Voice Persistence**: Selected voice and mute/unmute state are persisted locally across app restarts.
- **Smart Disk Caching**: Audio clips and previews are cached locally in the app's cache directory (`emotify_tts/`), minimizing ElevenLabs API token usage.
- **Non-Blocking Architecture**: Text responses appear instantly. Speech generates in the background; failures gracefully degrade to text-only mode without interrupting the conversation.
- **Read-Aloud Controls**: Every message bubble features a dedicated speaker button to re-play voice narration on demand.

### 3. Complete Multilingual Localization
- **Supported Languages**: English (`en`), Hindi (`hi`), Tamil (`ta`), and Telugu (`te`).
- **Reactive Locale Switching**: Instant language switching across all screens without reloading or restarting the app.
- **Context-Decoupled Speech**: Language and voice persona are decoupled—ElevenLabs' `eleven_multilingual_v2` model articulates responses in any supported language with the user's chosen voice persona.

### 4. Mental Health Assessment & Tracking
- **Clinical Screenings**: Standardized PHQ-9 (Depression) and GAD-7 (Anxiety) questionnaires.
- **User-Friendly Results**: Results are presented with reassuring, compassionate language, actionable guidance, and visual scores—eliminating intimidating clinical acronyms and raw jargon.
- **Tracking & Analytics**: Mood entries, check-in history, and score progressions displayed in the **Insights** tab.

### 5. Wellbeing Toolkit
- **Interactive Breathing Exercise**: Guided 4-7-8 breathing pacer with visual animations and haptic feedback.
- **Daily Reflection & Gratitude**: Structured journaling prompts to promote mindfulness.
- **Emergency Crisis Support**: Readily accessible crisis hotline contact shortcuts.

---

## Architecture & Technology Stack

```text
┌─────────────────────────────────────────────────────────────┐
│                   React Native Mobile App                   │
│          (Expo SDK 54, Expo Router, TypeScript)             │
│                                                             │
│   ┌────────────────────┐   ┌────────────────────────────┐   │
│   │   LanguageContext  │   │        VoiceContext        │   │
│   │   (en, hi, ta, te) │   │  (expo-av + disk cache)    │   │
│   └────────────────────┘   └────────────────────────────┘   │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
       Clerk Authentication            Convex API (Backend)
               │                               │
               ▼                               ▼
       User Profile & Auth        ┌───────────────────────────┐
                                  │   Convex Cloud Actions    │
                                  │                           │
                                  │   • Chat & Mood DB        │
                                  │   • elevenlabs TTS Action │
                                  │   • Assessment Records    │
                                  └─────────────┬─────────────┘
                                                │
                                                ▼
                                      ElevenLabs API
                                  (eleven_multilingual_v2)
```

| Layer | Technology |
|---|---|
| **Framework** | React Native (Expo SDK 54, Expo Router v3) |
| **Backend & Database** | [Convex](https://convex.dev) Cloud Database & Serverless Actions |
| **Authentication** | [Clerk](https://clerk.com) (`@clerk/clerk-expo`) |
| **Text-to-Speech** | ElevenLabs API (`eleven_multilingual_v2`) |
| **Audio Engine** | `expo-av` with custom lifecycle manager |
| **Local Storage** | `@react-native-async-storage/async-storage` |
| **Caching** | `expo-file-system/legacy` |
| **Languages** | TypeScript, React Native |

---

## Directory Structure

```text
Emotify-Clerk/
├── app/                              # Expo Router navigation
│   ├── (auth)/                       # Authenticated routes
│   │   ├── (tabs)/                   # Bottom tab navigator
│   │   │   ├── index.tsx             # Home screen (Check-in, Companion card)
│   │   │   ├── tools.tsx             # Wellbeing tools & exercises
│   │   │   ├── insights.tsx          # Progress & mood analytics
│   │   │   └── profile.tsx           # Profile & voice settings
│   │   ├── tools/
│   │   │   └── companion.tsx         # AI Companion chat screen with Voice
│   │   └── screening.tsx             # Wellbeing assessments (PHQ-9/GAD-7)
│   ├── (public)/                     # Public login & onboarding
│   └── _layout.tsx                   # Root layout with Providers
├── components/
│   └── voice/
│       └── VoiceSettingsModal.tsx    # Voice selection & preview bottom sheet
├── constants/
│   └── Voices.ts                     # Curated ElevenLabs voice configurations
├── context/
│   ├── LanguageContext.tsx           # Multilingual localization context
│   └── VoiceContext.tsx              # Audio playback & voice state context
├── convex/
│   ├── _generated/                   # Convex client bindings
│   ├── tts.ts                        # Secure ElevenLabs backend TTS actions
│   ├── users.ts                      # User management & profile mutations
│   ├── mood.ts                       # Mood tracking queries & mutations
│   └── schema.ts                     # Convex data schema
├── i18n/
│   └── locales/                      # Localization translation dictionaries
│       ├── en.json                   # English
│       ├── hi.json                   # Hindi
│       ├── ta.json                   # Tamil
│       └── te.json                   # Telugu
├── services/
│   └── tts/
│       ├── audioPlayer.ts            # expo-av sound lifecycle manager
│       ├── ttsService.ts             # Audio fetcher & disk caching
│       └── types.ts                  # TTS type declarations
└── package.json
```

---

## Security Architecture

1. **No API Secret Leakage**:
   - `ELEVENLABS_API_KEY` is kept exclusively on the server in Convex environment variables.
   - The React Native mobile client never receives or stores the API key.
2. **Environment File Guarding**:
   - `.gitignore` strictly ignores `.env`, `.env.*`, and `.env*.local`.
   - `.env.example` is committed as a template for development variables.
3. **Audio Cache Isolation**:
   - Generated audio files are stored in the application's isolated sandboxed cache directory (`FileSystem.cacheDirectory + "emotify_tts/"`).
4. **Input Validation**:
   - Text inputs sent to TTS are length-capped and sanitized against injections.

---

## Getting Started

### Prerequisites
- Node.js (v18+)
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- Android Studio / JDK 17 (for Android native builds)
- A [Convex](https://convex.dev) account
- An [ElevenLabs](https://elevenlabs.io) API key

### 1. Installation

Clone the repository and install dependencies:
```bash
git clone https://github.com/Vineeth-1204/emotify.git
cd emotify
npm install
```

### 2. Environment Setup

Create `.env.local` in the project root:
```env
EXPO_PUBLIC_CONVEX_URL=https://your-convex-deployment.convex.cloud
EXPO_PUBLIC_CONVEX_SITE_URL=https://your-convex-deployment.convex.site
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```

### 3. Configure ElevenLabs Secret in Convex

Set your ElevenLabs secret key on your Convex backend:
```bash
npx convex env set ELEVENLABS_API_KEY your_elevenlabs_api_key
```
*(Or add it via Convex Dashboard > Settings > Environment Variables).*

### 4. Start Convex Dev Backend

```bash
npx convex dev
```

### 5. Run the Application

Start the Expo Metro bundler:
```bash
npm run start
```

Run on an Android device:
```bash
npm run android
```

---

## Building Android Release APK

To compile a standalone release APK:
```bash
cd android
./gradlew assembleRelease
```
The generated APK will be output to:
`android/app/build/outputs/apk/release/app-release.apk`

---

## License

This project is licensed under the MIT License.
