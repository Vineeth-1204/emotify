# Emotify Localization & Multilingual Architecture Guide

## 1. Overview & Architecture

Emotify implements a scalable, native localization architecture powered by [`i18next`](https://www.i18next.com/) and [`react-i18next`](https://react.i18next.com/) optimized for React Native (Expo). The localization system decouples all user-facing strings from business and UI logic, providing:

- **Instant Runtime Language Switching:** UI re-renders immediately across all mounted navigation stacks and screens upon language change without requiring an app reload or state reset.
- **Persistence via AsyncStorage:** User language preference is saved to persistent device storage (`@emotify_language`) and reloaded automatically on app startup.
- **Zero-Crash Resilient Fallback:** Automatically falls back from `Requested Language -> English (en) -> Translation Key`. If a key is missing in any language, English is served seamlessly.
- **RTL & Unicode Ready:** Built to support both LTR (English, Hindi, Tamil, Telugu, etc.) and RTL languages (Arabic, Urdu) with `I18nManager` hooks in place.
- **Type-Safe Context Provider:** Custom `LanguageProvider` and `useLanguage()` hook expose `{ language, setLanguage, t, supportedLanguages, activeLanguageOption }` globally.

---

## 2. Directory Structure

All localization resources and logic live within the root `/i18n` and `/context` directories:

```
Emotify-Clerk/
├── i18n/
│   ├── index.ts               # Core i18next configuration, init, storage & helpers
│   └── locales/
│       ├── en.json            # English (Default & Fallback source of truth)
│       ├── hi.json            # Hindi (हिन्दी)
│       ├── ta.json            # Tamil (தமிழ்)
│       └── te.json            # Telugu (తెలుగు)
├── context/
│   └── LanguageContext.tsx    # React Context Provider and useLanguage hook
└── LOCALIZATION.md            # Architecture documentation (this file)
```

---

## 3. Translation Key Conventions

Translation files use structured, semantic namespaces organized logically by feature, screen, or domain:

| Namespace | Purpose | Example Keys |
| :--- | :--- | :--- |
| `common` | Shared actions, buttons, and system states | `common.save`, `common.cancel`, `common.error` |
| `nav` | Bottom tab bar and navigation titles | `nav.home`, `nav.tools`, `nav.insights`, `nav.profile` |
| `auth` | Authentication screens, inputs, and validation | `auth.signIn`, `auth.email`, `auth.invalidCredentials` |
| `home` | Daily greeting, check-in cards, streak, and metrics | `home.greetingUser`, `home.moodPrompt`, `home.moodGood` |
| `profile` | Account, settings, security, and export data | `profile.title`, `profile.language`, `profile.exportBtn` |
| `tools` | Therapy Hub catalog, categories, and tool cards | `tools.title`, `tools.catMindfulness`, `tools.companionTitle` |
| `screening` | Clinical check-in questionnaires (PHQ-9, GAD-7) | `screening.title`, `screening.startCheck`, `screening.opt0` |
| `companion` | AI Companion chat, voice prompts, actions, safety | `companion.inputPlaceholder`, `companion.typing`, `companion.statusOnline` |
| `insights` | Journey charts, weekly progress, and activity stats | `insights.title`, `insights.calmPoints`, `insights.goalsMet` |
| `onboarding` | Welcome flow, consent, and safety notices | `onboarding.welcomeTitle`, `onboarding.getStarted` |

> [!IMPORTANT]
> **Anti-Pattern Warning:** Never use arbitrary keys like `text1`, `button2`, or `label3`. Always use semantic hierarchical keys like `section.element` (e.g. `auth.welcomeBack`, `tools.companionDesc`).

---

## 4. How to Use in Components

Import and consume the `useLanguage` hook anywhere in your component tree:

```tsx
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useLanguage } from "@/context/LanguageContext";

export function ExampleCard() {
  const { t } = useLanguage();

  return (
    <View>
      <Text>{t("home.moodPrompt")}</Text>
      <TouchableOpacity>
        <Text>{t("common.continue")}</Text>
      </TouchableOpacity>
    </View>
  );
}
```

---

## 5. Dynamic Text & Interpolation

Never concatenate translated strings with variables (`translate("welcome") + " " + name`). Use **i18next interpolation syntax** `{{variableName}}`.

### In Translation Resource (`en.json`):
```json
{
  "home": {
    "greetingUser": "{{greeting}}, {{name}}",
    "moodStreakDays": "{{count}} day check-in streak"
  },
  "companion": {
    "inputPlaceholder": "Message {{name}}..."
  }
}
```

### In UI Component:
```tsx
const { t } = useLanguage();

// Interpolating name and dynamic greeting:
<Text>{t("home.greetingUser", { greeting: "Good morning", name: "Alex" })}</Text>

// Interpolating counts:
<Text>{t("home.moodStreakDays", { count: 5 })}</Text>

// Interpolating dynamic avatar name:
<TextInput placeholder={t("companion.inputPlaceholder", { name: avatarName })} />
```

---

## 6. How to Add a New Translation Key

When introducing a new user-facing string:

1. Open `i18n/locales/en.json`.
2. Locate the appropriate category (e.g., `home`, `tools`, `profile`, or create a new section if adding a new feature).
3. Add the key and its English string:
   ```json
   "home": {
     "newFeatureCta": "Explore Daily Mindfulness"
   }
   ```
4. Add the corresponding key and translation to all supported languages:
   - `i18n/locales/hi.json`: `"newFeatureCta": "दैनिक माइंडफुलनेस का अन्वेषण करें"`
   - `i18n/locales/ta.json`: `"newFeatureCta": "தினசரி நினைவாற்றலை ஆராயுங்கள்"`
   - `i18n/locales/te.json`: `"newFeatureCta": "రోజువారీ మైండ్‌ఫుల్‌నెస్‌ని అన్వేషించండి"`
5. Consume in your component with `t("home.newFeatureCta")`.

---

## 7. How to Add a New Language

Adding a new language (e.g., Kannada `kn`, Bengali `bn`, Marathi `mr`, or French `fr`) requires 3 quick steps:

### Step 1: Create the Translation Dictionary
Create a new file under `i18n/locales/<lang-code>.json` (e.g. `i18n/locales/kn.json`).
Copy the key structure from `i18n/locales/en.json` and provide the translated values.

### Step 2: Register in `i18n/index.ts`
Import the new JSON file and add it to `resources` and `SUPPORTED_LANGUAGES`:

```ts
import kn from "./locales/kn.json";

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', isRTL: false },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', isRTL: false },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்', isRTL: false },
  { code: 'te', label: 'Telugu', nativeLabel: 'తెలుగు', isRTL: false },
  { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ', isRTL: false }, // New!
];

const resources = {
  en: { translation: en },
  hi: { translation: hi },
  ta: { translation: ta },
  te: { translation: te },
  kn: { translation: kn }, // New!
};
```

### Step 3: Done!
The Language Selector modal in **Profile > Settings** and on the **Login** screen will automatically list the new language in its native script with zero UI modifications.

---

## 8. Language Selection UI

The application provides two accessible entry points for changing language:
1. **Login Screen (`app/(public)/login.tsx`):**
   - Top-right Language Selector pill displaying the current language with a globe icon.
   - Users can choose their preferred language prior to signing in.
2. **Profile Screen (`app/(auth)/(tabs)/profile.tsx`):**
   - Under `SETTINGS & SECURITY`, the `App Language` row shows the active language.
   - Tapping it opens a sleek, themed modal displaying all supported languages with native labels and checkmark indicators.
   - Selecting any language updates state immediately and persists to `AsyncStorage`.

---

## 9. Developer Guidelines & Best Practices

1. **Zero-Emoji Compliance:** Translations must strictly adhere to the project's zero-emoji guideline. Use vector icons from `@expo/vector-icons` or SVG icons from `@/components/svg/` instead.
2. **Do Not Translate Technical Values:**
   - Do NOT translate database IDs, Convex mutation/query names, route paths (`/(auth)/(tabs)`), API error codes, or technical tokens.
   - Only translate text intended for human user consumption.
3. **No Concatenation:** Always use `{interpolation}` parameters.
4. **Text Expansion Budget:** Indian languages (Hindi, Tamil, Telugu) often have glyphs that require 15-30% more horizontal space than English.
   - Use flexible container constraints (`flexWrap: 'wrap'`, `minWidth`, `paddingHorizontal`).
   - Do NOT hardcode fixed narrow widths on buttons or labels.
5. **Fallbacks:** Never render raw fallback error strings. If a key is missing from a secondary language, `i18next` automatically renders the English equivalent.
