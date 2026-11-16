/**
 * PokeMarket — localisation.
 *
 * The app's strings were written inline, in Traditional Chinese, in
 * every screen. They live in one table now, keyed by the text that
 * used to be in the screen, so a lookup returns the right translation
 * and a string that was missed falls back to itself rather than to
 * blank.
 *
 * `t()` reads the language that is active right now, so it can be
 * called from anywhere — including a module-level constant — without
 * a hook. The screens that show the text subscribe to the appearance
 * context, so a change of language re-renders them.
 */
import { STRINGS } from './strings';

export type Language = 'zh-HK' | 'zh-CN' | 'en';

export { STRINGS };

let currentLanguage: Language = 'zh-HK';

/** The language the strings are being shown in right now. */
export function getCurrentLanguage(): Language {
  return currentLanguage;
}

/** Switch the language the strings are shown in. */
export function setCurrentLanguage(language: Language): void {
  currentLanguage = language;
}

/**
 * The translation of a source string.
 *
 * A string that is not in the table comes back unchanged — the
 * Traditional Chinese text stays, which is better than a blank.
 */
export function t(
  source: string,
  params?: Record<string, string | number>,
): string {
  const entry = STRINGS[source];
  const text = entry ? entry[currentLanguage] || source : source;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}
