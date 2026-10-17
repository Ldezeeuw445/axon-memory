import { describe, it, expect, vi } from 'vitest';
import { withReload } from '../lazyPage';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };

describe('withReload', () => {
  it('passes a loaded module through and clears the marker', async () => {
    const storage = mem(); storage.setItem('axon:chunk-reload', '1');
    const mod = { default: 'Page' };
    expect(await withReload(() => Promise.resolve(mod), { storage, reload: vi.fn() })()).toBe(mod);
    expect(storage.getItem('axon:chunk-reload')).toBe(null);
  });
  it('reloads once when a chunk is gone after a deploy', async () => {
    const storage = mem(); const reload = vi.fn();
    const p = withReload(() => Promise.reject(new Error('Failed to fetch dynamically imported module')), { storage, reload })();
    await new Promise((r) => setTimeout(r, 0));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.getItem('axon:chunk-reload')).toBe('1');
    let settled = false; p.then(() => { settled = true; }, () => { settled = true; });
    await new Promise((r) => setTimeout(r, 0));
    expect(settled).toBe(false);
  });
  it('does not loop: a second failure surfaces the error', async () => {
    const storage = mem(); storage.setItem('axon:chunk-reload', '1'); const reload = vi.fn();
    await expect(withReload(() => Promise.reject(new Error('gone')), { storage, reload })()).rejects.toThrow('gone');
    expect(reload).not.toHaveBeenCalled();
  });
});
