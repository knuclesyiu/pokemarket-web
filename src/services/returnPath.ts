/**
 * Where the user was, across a sign-in that leaves the page.
 *
 * A redirect sign-in — Google on a phone — comes back to the app root
 * without the query string it left with. The place the user was going
 * is kept here and put back when the app starts, so a seller who left
 * for Stripe's onboarding and had to sign in on the way back lands on
 * the seller screen instead of the home page.
 */

const KEY = 'pm:returnPath';

/** Remember the current query string, if there is one worth keeping. */
export function rememberReturnPath(): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.location.search) {
      window.sessionStorage.setItem(KEY, window.location.search);
    }
  } catch {
    // A browser with storage blocked — the path is simply not kept.
  }
}

/** Put the remembered query string back, if the redirect dropped it. */
export function restoreReturnPath(): void {
  if (typeof window === 'undefined') return;
  try {
    const saved = window.sessionStorage.getItem(KEY);
    if (!saved) return;
    window.sessionStorage.removeItem(KEY);
    if (!window.location.search) {
      window.history.replaceState(null, '', window.location.pathname + saved);
    }
  } catch {
    // As above — nothing to restore.
  }
}

/**
 * Whether the user came back for the seller onboarding screen.
 *
 * Stripe sends the seller to `?sellerOnboarding=refresh` when they
 * have to finish a step, and to `?sellerOnboarding=done` when they
 * have finished.
 */
export function sellerOnboardingRequested(): boolean {
  if (typeof window === 'undefined') return false;
  const value = new URLSearchParams(window.location.search).get('sellerOnboarding');
  return value === 'refresh' || value === 'done';
}
