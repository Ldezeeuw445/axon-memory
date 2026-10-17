// A light tick where the phone supports it (Android Chrome; iOS Safari has no
// web vibration API and simply does nothing). Never when the person asked
// for reduced motion. Patterns are short on purpose: confirmation, not alarm.
const PATTERNS = { tap: 6, success: [10, 40, 14], warn: [20, 60, 20] };
export function haptic(kind = 'tap') {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
    return navigator.vibrate(PATTERNS[kind] ?? PATTERNS.tap);
  } catch { return false; }
}
