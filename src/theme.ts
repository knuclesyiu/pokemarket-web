/**
 * PokeMarket — design tokens.
 *
 * The colours used to be re-declared inside every screen, which meant
 * the same dark purple was spelled six different ways and a change to
 * the brand red had to be hunted down by hand. This file is the one
 * place a colour, a radius or a type step is written down.
 *
 * Two palettes live here. The dark one is the "Obsidian Gallery" the
 * app has always used: a near-black violet ground, a gold that only
 * appears where money or rarity is involved, and a single hot red
 * reserved for actions that move the user forward. The light one
 * keeps the same gold and the same red — they are the brand — and
 * darkens them far enough to stay readable on white.
 *
 * `C` is a live view of whichever palette is active, and `themed()`
 * rebuilds a screen's stylesheet when the palette changes. That is
 * what lets the theme switch without every screen having to know
 * about it.
 */

import { StyleSheet } from 'react-native';
import type { TextStyle } from 'react-native';

export interface Palette {
  void: string;
  surface: string;
  card: string;
  elevated: string;
  border: string;
  borderActive: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  textDisabled: string;
  gold: string;
  goldDim: string;
  goldEdge: string;
  action: string;
  actionPressed: string;
  actionDim: string;
  ruby: string;
  up: string;
  down: string;
  info: string;
  warn: string;
  violet: string;
  overlay: string;
}

export type ThemeName = 'dark' | 'light';

export const darkPalette: Palette = {
  void: '#080810',
  surface: '#0E0E1A',
  card: '#14142A',
  elevated: '#1C1C38',
  border: '#2A2A50',
  borderActive: '#3D3D70',
  text: '#F0F0FF',
  textSecondary: '#A0A0C8',
  textTertiary: '#6666AA',
  textDisabled: '#4A4A70',
  gold: '#D4AF37',
  goldDim: 'rgba(212,175,55,0.18)',
  goldEdge: 'rgba(212,175,55,0.45)',
  action: '#FF4060',
  actionPressed: '#E03050',
  actionDim: 'rgba(255,64,96,0.15)',
  ruby: '#FF4060',
  up: '#3DD68C',
  down: '#FF6B6B',
  info: '#4A90D9',
  warn: '#F5A623',
  violet: '#8B5CF6',
  overlay: 'rgba(4,4,10,0.82)',
};

/**
 * The light palette.
 *
 * The ground is a soft grey rather than pure white, so the cards read
 * as objects sitting on it. The gold and the red are darkened — the
 * dark palette's versions are tuned for a near-black ground and are
 * unreadable on white.
 */
export const lightPalette: Palette = {
  void: '#EFEFF4',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  elevated: '#F6F6FA',
  border: '#E2E2EA',
  borderActive: '#BDBDCF',
  text: '#14142A',
  textSecondary: '#55556E',
  textTertiary: '#8A8AA6',
  textDisabled: '#B8B8C8',
  gold: '#A97A0B',
  goldDim: 'rgba(169,122,11,0.13)',
  goldEdge: 'rgba(169,122,11,0.38)',
  action: '#E11D48',
  actionPressed: '#BE123C',
  actionDim: 'rgba(225,29,72,0.10)',
  ruby: '#E11D48',
  up: '#0E9F6E',
  down: '#DC2626',
  info: '#2563EB',
  warn: '#B45309',
  violet: '#7C3AED',
  overlay: 'rgba(20,20,42,0.45)',
};

let activePalette: Palette = darkPalette;
let activeThemeName: ThemeName = 'dark';

/**
 * The listeners that want to know when the palette changed.
 *
 * The theme is a module-level thing rather than React state, because
 * the root of the app sits *above* the provider that holds the
 * account's preferences — a context there would never reach it. An
 * external store reaches everything: the root subscribes to it, so a
 * change of palette re-renders the whole tree rather than the part
 * of it that happens to consume a context.
 */
const themeListeners = new Set<() => void>();

/** Subscribe to palette changes. Returns the unsubscribe function. */
export function subscribeTheme(listener: () => void): () => void {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

/** The current theme, for `useSyncExternalStore`. */
export function getThemeSnapshot(): ThemeName {
  return activeThemeName;
}

/** Which palette is active. */
export function getActiveTheme(): ThemeName {
  return activeThemeName;
}

/** The palette that is active right now. */
export function getActivePalette(): Palette {
  return activePalette;
}

/**
 * Switch the active palette.
 *
 * Called when the account's preference is read and when the user
 * changes it. The screens pick the new colours up on their next
 * render, which the change of preference itself causes.
 */
export function setActiveTheme(name: ThemeName): void {
  if (name === activeThemeName) return;
  activeThemeName = name;
  activePalette = name === 'light' ? lightPalette : darkPalette;
  themeListeners.forEach(listener => listener());
}

/**
 * The colour tokens, as a live view of the active palette.
 *
 * `C.text` reads whatever the palette says at the moment it is read,
 * so a component that renders after the theme changed gets the new
 * colour without anything having to be told.
 */
export const C: Palette = new Proxy({} as Palette, {
  get: (_target, key: string) =>
    (activePalette as unknown as Record<string, string>)[key],
});

/**
 * A stylesheet that follows the active palette.
 *
 * A stylesheet built at module scope freezes the colours it was built
 * with — the module is evaluated once, and the palette it read is the
 * palette of that moment. Wrapping the factory here means the sheet is
 * built again for whichever palette is active, and the build is
 * remembered per palette so it only happens once per theme.
 *
 *     const styles = themed((C) => StyleSheet.create({ ... }));
 */
export function themed<T extends Record<string, unknown>>(
  factory: (c: Palette) => T,
): T {
  // The cache belongs to this stylesheet, not to the palette. A cache
  // keyed by the palette alone is shared by every screen, so the
  // first screen to be read wins and every other screen reads its
  // styles out of the wrong sheet — which shows up as a screen with
  // no styles at all, and no error to point at it.
  const cache = new WeakMap<Palette, T>();

  return new Proxy({} as T, {
    get(_target, key: string) {
      let sheet = cache.get(activePalette);
      if (!sheet) {
        sheet = factory(activePalette);
        cache.set(activePalette, sheet);
      }
      return sheet[key];
    },
  });
}

/** Spacing scale. 4pt grid. */
export const SP = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const R = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

/**
 * The font family, once the fonts have loaded.
 *
 * `useFonts` leaves this null until then, and the app renders with
 * the platform default in that moment rather than a flash of the
 * wrong face. Latin text picks up the family; Chinese text falls
 * through to the system CJK face, which is what we want anyway.
 */
export const FONT = {
  regular: 'Sora_400Regular',
  medium: 'Sora_500Medium',
  semibold: 'Sora_600SemiBold',
  bold: 'Sora_700Bold',
  extrabold: 'Sora_800ExtraBold',
} as const;

/**
 * Type scale.
 *
 * `price` is the one that matters most — it is the thing a buyer
 * looks at. It gets tabular numerals so a column of prices lines up
 * on the decimal point, and tighter tracking so a long price does not
 * drift apart.
 */
/**
 * The type scale.
 *
 * Typed as TextStyle rather than `as const`, because `as const` makes
 * `fontVariant` a readonly tuple and React Native wants a mutable
 * array of its own union.
 */
export const T: Record<string, TextStyle> = {
  display: {
    fontSize: 32,
    fontWeight: '800',
    fontFamily: FONT.extrabold,
    letterSpacing: -0.8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: FONT.extrabold,
    letterSpacing: -0.4,
  },
  heading: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: FONT.bold,
    letterSpacing: -0.2,
  },
  body: { fontSize: 15, fontWeight: '500', fontFamily: FONT.regular },
  bodyStrong: { fontSize: 15, fontWeight: '700', fontFamily: FONT.semibold },
  small: { fontSize: 13, fontWeight: '500', fontFamily: FONT.regular },
  caption: { fontSize: 11, fontWeight: '600', fontFamily: FONT.semibold },
  overline: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: FONT.bold,
    letterSpacing: 1.2,
  },
  price: {
    fontSize: 17,
    fontWeight: '800',
    fontFamily: FONT.extrabold,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  priceLarge: {
    fontSize: 30,
    fontWeight: '800',
    fontFamily: FONT.extrabold,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  mono: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: FONT.semibold,
    fontVariant: ['tabular-nums'],
  },
} as const;

/** Elevation, kept in one place because shadow opacity is easy to overdo. */
export const SHADOW = themed((C) => ({
  card: {
    shadowColor: '#000',
    shadowOpacity: C.void === darkPalette.void ? 0.35 : 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  glow: {
    shadowColor: C.gold,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
}));

/** Market direction colour for a 24h change. */
export function changeColor(change: number): string {
  if (change > 0) return C.up;
  if (change < 0) return C.down;
  return C.textTertiary;
}
