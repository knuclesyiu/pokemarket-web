/**
 * Appearance — the theme and the language, in one place.
 *
 * Both are per-account preferences: they are stored on the profile,
 * so they follow the person to another device.
 *
 * The provider sits inside the auth provider, because it needs the
 * profile. Its consumers re-render when either preference changes,
 * which is what makes a screen pick up the new palette or the new
 * language — a stylesheet built at module scope keeps the colours it
 * was built with, and a string read at module scope keeps the
 * language it was read in.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useAuth } from './AuthContext';
import { getCurrentLanguage, setCurrentLanguage, t, Language } from '../i18n';
import { getActiveTheme, setActiveTheme, ThemeName } from '../theme';

export interface AppearanceValue {
  theme: ThemeName;
  language: Language;
  t: (source: string) => string;
  setTheme: (theme: ThemeName) => void;
  setLanguage: (language: Language) => void;
}

const AppearanceContext = createContext<AppearanceValue | null>(null);

export function useAppearance(): AppearanceValue {
  return useContext(AppearanceContext)!;
}

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const { userProfile, updateProfile } = useAuth();
  const [theme, setThemeState] = useState<ThemeName>(
    () => userProfile?.theme ?? getActiveTheme(),
  );
  const [language, setLanguageState] = useState<Language>(
    () => userProfile?.language ?? getCurrentLanguage(),
  );

  // Adopt the account's preferences once the profile arrives.
  useEffect(() => {
    if (!userProfile) return;
    if (userProfile.theme && userProfile.theme !== theme) {
      setThemeState(userProfile.theme);
    }
    if (userProfile.language && userProfile.language !== language) {
      setLanguageState(userProfile.language);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.theme, userProfile?.language]);

  // The module-level readers follow the state.
  useEffect(() => {
    setActiveTheme(theme);
  }, [theme]);
  useEffect(() => {
    setCurrentLanguage(language);
  }, [language]);

  const setTheme = useCallback(
    (next: ThemeName) => {
      setThemeState(next);
      setActiveTheme(next);
      updateProfile({ theme: next }).catch(() => {});
    },
    [updateProfile],
  );

  const setLanguage = useCallback(
    (next: Language) => {
      setLanguageState(next);
      setCurrentLanguage(next);
      updateProfile({ language: next }).catch(() => {});
    },
    [updateProfile],
  );

  const value = useMemo<AppearanceValue>(
    () => ({ theme, language, t, setTheme, setLanguage }),
    [theme, language, setTheme, setLanguage],
  );

  return (
    <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
  );
}
