/**
 * PokeMarket — Card Grade Helper
 *
 * Helpers for displaying / validating PSA / BGS / CGC grade chips and
 * PSA cert numbers. The actual PSA-spec price reference is a separate
 * concern (see `psaPriceService.ts` — to be added when a paid API
 * source is wired in).
 */

import { CardGrade, GradingInfo } from '../types';
import { C } from '../theme';

// ── Human-readable label per grade ──────────────────────────────────────────
export const GRADE_LABEL: Record<CardGrade, string> = {
  raw: 'Raw (NM)',
  psa10: 'PSA 10',
  psa95: 'PSA 9.5',
  psa9: 'PSA 9',
  psa8: 'PSA 8',
  psa7: 'PSA 7',
  bgs95: 'BGS 9.5',
  bgs10: 'BGS 10 (Black Label)',
  bgs9: 'BGS 9',
  bgs8: 'BGS 8',
  cgc10: 'CGC 10',
  cgc95: 'CGC 9.5',
  cgc9: 'CGC 9',
  other_graded: 'Graded',
};

/**
 * The graders a seller can choose from, and the grades each of them
 * issues. PSA 9.5 and CGC 9.5 are the ones people forget, so they are
 * here rather than left out.
 */
export const GRADERS = [
  { id: 'PSA', grades: ['psa10', 'psa95', 'psa9', 'psa8', 'psa7'] as CardGrade[] },
  { id: 'BGS', grades: ['bgs10', 'bgs95', 'bgs9', 'bgs8'] as CardGrade[] },
  { id: 'CGC', grades: ['cgc10', 'cgc95', 'cgc9'] as CardGrade[] },
] as const;

/** The grade a slider-style picker should start on for a grader. */
export function defaultGradeFor(graderId: string): CardGrade {
  const grader = GRADERS.find((g) => g.id === graderId);
  return grader ? grader.grades[0] : 'raw';
}

/** Every grade a grader offers, in one flat list. */
export function gradesFor(graderId: string): CardGrade[] {
  const grader = GRADERS.find((g) => g.id === graderId);
  return grader ? [...grader.grades] : [];
}

/** The numeric grade behind a CardGrade, e.g. psa95 → 9.5. */
export function gradeNumber(grade: CardGrade): number | undefined {
  const m = /^([a-z]+)(\d+)?/.exec(grade);
  if (!m) return undefined;
  const prefix = m[1];
  const digits = m[2];
  if (!digits) return undefined;
  const n = Number(digits);
  if (prefix === 'psa' || prefix === 'bgs' || prefix === 'cgc') {
    // psa95 means 9.5, bgs95 means 9.5.
    return digits.length === 2 ? n / 10 : n;
  }
  return n;
}

// ── Chip colors per grade (background + text) ───────────────────────────────
export const GRADE_CHIP: Record<CardGrade, { bg: string; text: string; border: string }> = {
  raw:         { bg: 'rgba(136,136,204,0.15)', text: C.textSecondary, border: C.borderActive },
  psa10:       { bg: 'rgba(255,60,60,0.18)',   text: '#FF6B7A', border: C.action },
  psa95:       { bg: 'rgba(255,107,53,0.18)',  text: '#FF8A5C', border: C.warn },
  psa9:        { bg: 'rgba(212,175,55,0.18)',  text: C.gold, border: C.gold },
  psa8:        { bg: 'rgba(0,200,150,0.15)',   text: C.up, border: C.up },
  psa7:        { bg: 'rgba(136,136,204,0.15)', text: C.textSecondary, border: C.textSecondary },
  bgs95:       { bg: 'rgba(255,60,60,0.18)',   text: '#FF6B7A', border: C.action },
  bgs10:       { bg: 'rgba(139,92,246,0.20)',  text: '#A78BFA', border: C.violet }, // Black Label — special violet
  bgs9:        { bg: 'rgba(212,175,55,0.18)',  text: C.gold, border: C.gold },
  bgs8:        { bg: 'rgba(0,200,150,0.15)',   text: C.up, border: C.up },
  cgc10:       { bg: 'rgba(255,107,53,0.18)',  text: '#FF8A5C', border: C.warn },
  cgc95:       { bg: 'rgba(212,175,55,0.18)',  text: C.gold, border: C.gold },
  cgc9:        { bg: 'rgba(0,200,150,0.15)',   text: C.up, border: C.up },
  other_graded:{ bg: 'rgba(136,136,204,0.15)', text: C.textSecondary, border: C.textSecondary },
};

// ── Default grade for a new listing ──────────────────────────────────────────
export const DEFAULT_GRADE: CardGrade = 'raw';

/**
 * Build a GradingInfo from user input. Returns null if input is invalid.
 */
export function makeGrading(
  grade: CardGrade,
  certNumber?: string,
): GradingInfo {
  const grader = grade.startsWith('psa') ? 'PSA'
              : grade.startsWith('bgs') ? 'BGS'
              : grade.startsWith('cgc') ? 'CGC'
              : 'Other';
  const gradeValue = gradeNumber(grade);
  const info: GradingInfo = { grade };
  if (grade !== 'raw') info.grader = grader as any;
  if (gradeValue != null) info.gradeValue = gradeValue;
  if (certNumber && certNumber.trim()) info.certNumber = certNumber.trim();
  return info;
}

/**
 * Validate a PSA cert number (PSA cert numbers are 7-10 digits).
 * Returns true if it looks plausible. BGS cert numbers are alphanumeric
 * (8-12 chars) and not validated here.
 */
export function isPlausibleCert(grade: CardGrade, cert: string | undefined): boolean {
  if (!cert) return true; // optional
  if (grade === 'raw' || grade === 'other_graded') return true;
  if (grade.startsWith('psa')) {
    return /^\d{7,10}$/.test(cert.trim());
  }
  if (grade.startsWith('bgs')) {
    return /^[A-Z0-9]{8,12}$/i.test(cert.trim());
  }
  if (grade.startsWith('cgc')) {
    return /^\d{6,12}$/.test(cert.trim());
  }
  return true;
}

/**
 * Format the grade chip (label + optional cert) for display.
 *   - "PSA 10"  → just label
 *   - "PSA 10 · cert 12345678"  → label + cert
 *   - "Raw (NM)"  → just label
 */
export function formatGradeChip(info: GradingInfo | undefined): string {
  if (!info) return GRADE_LABEL.raw;
  const base = GRADE_LABEL[info.grade];
  if (info.certNumber) return `${base} · cert ${info.certNumber}`;
  return base;
}

/**
 * For buyers/sellers: a card with PSA 10 is worth MORE than raw NM.
 * We don't have live PSA-10 prices yet (see psaPriceService TODO), but
 * we expose a multiplier hint so UI can warn "PSA 10 expected price: 5× raw".
 *
 * Defaults are conservative industry estimates; can be tuned later.
 */
export const GRADE_PREMIUM_HINT: Record<CardGrade, number> = {
  raw:          1.0,
  psa10:        5.0,   // raw → PSA 10 is typically 3-10× depending on card
  psa95:        3.0,
  psa9:         1.8,
  psa8:         1.3,
  psa7:         1.1,
  bgs95:        4.5,
  bgs10:        7.0,   // BGS 10 Black Label — extreme premium
  bgs9:         1.6,
  bgs8:         1.2,
  cgc10:        4.0,
  cgc95:        2.8,
  cgc9:         1.7,
  other_graded: 1.5,
};
