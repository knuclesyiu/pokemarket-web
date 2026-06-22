/**
 * useTranslation — DEPRECATED stub.
 *
 * This hook was authored as a future-ready i18n helper, but no screen
 * currently consumes it. The app's UI strings remain hard-coded in
 * Traditional Chinese (zh-HK) inline with each component.
 *
 * If/when a real i18n migration is required, this file is the starting
 * point. Two things will need to happen:
 *   1. Replace inline strings with `t('key')` calls
 *   2. Wire useTranslation() into a top-level provider so it can read
 *      language from a context (e.g. I18nContext) instead of AuthContext
 *
 * For now, importing this from anywhere produces a deprecation warning.
 *
 * TODO(launch-2): proper i18n implementation. For MVP launch, hard-coded
 * zh-HK is acceptable.
 */
import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { translations, Language } from './translations';

export function useTranslation() {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn('[i18n] useTranslation() is not yet wired into any screen. ' +
      'See src/i18n/useTranslation.ts for migration notes.');
  }
  const { userProfile } = useAuth();
  const lang: Language = userProfile?.language ?? 'zh-HK';
  const t = translations[lang];

  const changeLanguage = useCallback(async (newLang: Language, updateProfile: (data: any) => Promise<void>) => {
    await updateProfile({ language: newLang });
  }, []);

  return { t, lang, changeLanguage };
}
