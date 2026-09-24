import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager } from 'react-native';

import en from './locales/en.json';
import hi from './locales/hi.json';
import ta from './locales/ta.json';
import te from './locales/te.json';

export const LANGUAGE_STORAGE_KEY = '@emotify_app_language';

export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
  isRTL?: boolean;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English', isRTL: false },
  { code: 'hi', name: 'Hindi', nativeName: 'हिंदी', isRTL: false },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', isRTL: false },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', isRTL: false },
];

export const DEFAULT_LANGUAGE = 'en';

const resources = {
  en: { translation: en },
  hi: { translation: hi },
  ta: { translation: ta },
  te: { translation: te },
};

// Initialize i18next synchronously with default, then restore async stored language
i18n
  .use(initReactI18next)
  .init({
    compatibilityJSON: 'v4',
    resources,
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: {
      escapeValue: false, // React handles escaping
    },
    react: {
      useSuspense: false,
    },
  });

/**
 * Loads the user's persisted language selection from AsyncStorage,
 * falling back to English.
 */
export async function loadSavedLanguage(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved && SUPPORTED_LANGUAGES.some((lang) => lang.code === saved)) {
      if (i18n.language !== saved) {
        await i18n.changeLanguage(saved);
      }
      return saved;
    }
  } catch (e) {
    console.warn('[i18n] Failed to load saved language:', e);
  }
  return DEFAULT_LANGUAGE;
}

/**
 * Changes the active language and persists the choice to AsyncStorage.
 */
export async function setAppLanguage(languageCode: string): Promise<void> {
  try {
    const target = SUPPORTED_LANGUAGES.find((lang) => lang.code === languageCode);
    const validCode = target ? target.code : DEFAULT_LANGUAGE;
    await i18n.changeLanguage(validCode);
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, validCode);

    // RTL handling
    if (target?.isRTL && !I18nManager.isRTL) {
      I18nManager.forceRTL(true);
    } else if (!target?.isRTL && I18nManager.isRTL) {
      I18nManager.forceRTL(false);
    }
  } catch (e) {
    console.warn('[i18n] Failed to change language:', e);
  }
}

export default i18n;
