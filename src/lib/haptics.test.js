import { describe, it, expect, vi, afterEach } from 'vitest';
import { haptic } from './haptics';

afterEach(() => { vi.unstubAllGlobals(); });
describe('haptic', () => {
  it('does nothing where vibration is unsupported', () => {
    vi.stubGlobal('navigator', {});
    expect(haptic()).toBe(false);
  });
  it('respects reduced motion', () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    expect(haptic('success')).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });
  it('plays a short pattern otherwise', () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    expect(haptic('success')).toBe(true);
    expect(vibrate).toHaveBeenCalledWith([10, 40, 14]);
  });
});
