// What Supabase Auth says, in words a person would use (polish, 2026-10-17).
export function humanAuthError(err) {
  const m = String(err?.message || err || '');
  if (/invalid login credentials/i.test(m)) return "That email and password don't match. Check them, or reset your password below.";
  if (/email not confirmed/i.test(m)) return 'Confirm your email first: the link is in your inbox (check spam too).';
  if (/already registered|already been registered|user already exists/i.test(m)) return 'There is already an account for this email. Sign in instead.';
  if (/rate limit|too many|security purposes/i.test(m)) return 'Too many tries in a short time. Wait a minute, then try again.';
  if (/failed to fetch|network|load failed/i.test(m)) return "No connection right now. Try again when you're back online.";
  if (/same.*password|different from the old/i.test(m)) return 'Choose a password you have not used here before.';
  if (/password should be at least|weak password/i.test(m)) return 'Use at least 8 characters for your password.';
  return m || 'Something went wrong. Try again.';
}
