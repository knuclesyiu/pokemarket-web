/**
 * useTranslation — lightweight i18n hook using AuthContext language preference
 * No external i18next dependency needed.
 */
import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { translations, Language } from './translations';

export function useTranslation() {
  const { userProfile } = useAuth();
  const lang: Language = userProfile?.language ?? 'zh-HK';
  const t = translations[lang];

  const changeLanguage = useCallback(async (newLang: Language, updateProfile: (data: any) => Promise<void>) => {
    await updateProfile({ language: newLang });
  }, []);

  return { t, lang, changeLanguage };
}
