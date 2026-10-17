import { describe, it, expect } from 'vitest';
import { humanAuthError } from './authErrors';

describe('humanAuthError', () => {
  it('turns Supabase Auth messages into plain sentences', () => {
    expect(humanAuthError({ message: 'Invalid login credentials' })).toMatch(/don't match/);
    expect(humanAuthError({ message: 'Email not confirmed' })).toMatch(/Confirm your email/);
    expect(humanAuthError({ message: 'User already registered' })).toMatch(/already an account/);
    expect(humanAuthError({ message: 'email rate limit exceeded' })).toMatch(/Too many tries/);
    expect(humanAuthError(new TypeError('Failed to fetch'))).toMatch(/No connection/);
    expect(humanAuthError({ message: 'Password should be at least 8 characters.' })).toMatch(/at least 8/);
  });
  it('passes anything else through, and never returns an empty string', () => {
    expect(humanAuthError({ message: 'Signups not allowed for this instance' })).toBe('Signups not allowed for this instance');
    expect(humanAuthError(null)).toBe('Something went wrong. Try again.');
  });
});
