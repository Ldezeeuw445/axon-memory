import { lazy } from 'react';

/**
 * React.lazy that survives a deploy. A page left open across a release asks
 * for a chunk name the new deployment no longer has; instead of an error
 * screen it reloads once and picks up the new build.
 */
const KEY = 'axon:chunk-reload';

export function withReload(load, env = {}) {
  const store = env.storage ?? (() => { try { return window.sessionStorage; } catch { return null; } })();
  const reload = env.reload ?? (() => window.location.reload());
  return () => load().then((m) => { try { store?.removeItem(KEY); } catch { /* private mode */ } return m; }, (err) => {
    let tried = true;
    try { tried = store?.getItem(KEY) === '1'; if (!tried) store?.setItem(KEY, '1'); } catch { /* private mode */ }
    if (!tried) { reload(); return new Promise(() => {}); }
    throw err;
  });
}

export const lazyPage = (load) => lazy(withReload(load));
