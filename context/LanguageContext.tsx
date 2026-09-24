import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useTranslation as useI18nextTranslation } from 'react-i18next';
import i18n, {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  LanguageOption,
  loadSavedLanguage,
  setAppLanguage,
} from '@/i18n';

interface LanguageContextType {
  language: string;
  activeLanguageOption: LanguageOption;
  supportedLanguages: LanguageOption[];
  setLanguage: (code: string) => Promise<void>;
  t: (key: string, options?: Record<string, any>) => string;
  isRTL: boolean;
  isLoading: boolean;
}

const LanguageContext = createContext<LanguageContextType>({
  language: DEFAULT_LANGUAGE,
  activeLanguageOption: SUPPORTED_LANGUAGES[0],
  supportedLanguages: SUPPORTED_LANGUAGES,
  setLanguage: async () => {},
  t: (key: string) => key,
  isRTL: false,
  isLoading: true,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { t: i18nTranslate } = useI18nextTranslation();
  const [language, setLanguageState] = useState<string>(i18n.language || DEFAULT_LANGUAGE);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    loadSavedLanguage().then((saved) => {
      if (isMounted) {
        setLanguageState(saved);
        setIsLoading(false);
      }
    });

    const handleLanguageChanged = (lng: string) => {
      if (isMounted) {
        setLanguageState(lng);
      }
    };

    i18n.on('languageChanged', handleLanguageChanged);
    return () => {
      isMounted = false;
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, []);

  const handleSetLanguage = async (code: string) => {
    await setAppLanguage(code);
    setLanguageState(code);
  };

  const activeLanguageOption = useMemo(() => {
    return (
      SUPPORTED_LANGUAGES.find((lang) => lang.code === language) ||
      SUPPORTED_LANGUAGES[0]
    );
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      activeLanguageOption,
      supportedLanguages: SUPPORTED_LANGUAGES,
      setLanguage: handleSetLanguage,
      t: (key: string, options?: Record<string, any>) => i18nTranslate(key, options as any) as string,
      isRTL: !!activeLanguageOption.isRTL,
      isLoading,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [language, activeLanguageOption, isLoading, i18nTranslate]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
