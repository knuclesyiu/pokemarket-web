/**
 * PokeMarket — design tokens.
 *
 * The colours used to be re-declared inside every screen, which meant
 * the same dark purple was spelled six different ways and a change to
 * the brand red had to be hunted down by hand. This file is the one
 * place a colour, a radius or a type step is written down.
 *
 * The palette is the "Obsidian Gallery" the app has always used: a
 * near-black violet ground, a gold that only appears where money or
 * rarity is involved, and a single hot red reserved for actions that
 * move the user forward.
 */

import type { TextStyle } from 'react-native';

export const C = {
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
} as const;

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
export const SHADOW = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
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
} as const;

/** Market direction colour for a 24h change. */
export function changeColor(change: number): string {
  if (change > 0) return C.up;
  if (change < 0) return C.down;
  return C.textTertiary;
}
