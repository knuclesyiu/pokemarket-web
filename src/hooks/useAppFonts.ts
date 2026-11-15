/**
 * App fonts.
 *
 * The app drew everything with the platform default — Roboto on
 * Android, the system face on iOS, whatever the browser had. A
 * marketplace's most important element is a price, and a price wants
 * one typeface with consistent numerals across every platform.
 *
 * Sora is used for the Latin and numeric parts: a geometric face with
 * a wide, even stance that sits well next to the angular gold-on-black
 * palette. Chinese text falls through to the system CJK face, which
 * is the right answer anyway — the platform's Chinese face is better
 * designed for it than a Latin family would be.
 */

import { useFonts } from 'expo-font';
import {
  Sora_400Regular,
  Sora_500Medium,
  Sora_600SemiBold,
  Sora_700Bold,
  Sora_800ExtraBold,
} from '@expo-google-fonts/sora';

import { FONT } from '../theme';

/**
 * Load the faces. Returns false until they are ready.
 *
 * The app waits on this before the first screen renders, so the user
 * never sees the default face for a moment and then the real one.
 */
export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    [FONT.regular]: Sora_400Regular,
    [FONT.medium]: Sora_500Medium,
    [FONT.semibold]: Sora_600SemiBold,
    [FONT.bold]: Sora_700Bold,
    [FONT.extrabold]: Sora_800ExtraBold,
  });
  return loaded;
}
