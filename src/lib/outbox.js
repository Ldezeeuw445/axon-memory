// Ported from Ldezeeuw445/axon-memory-app@fbc294e src/lib/outbox.js (A2-2), unchanged in behaviour.
/**
 * Things captured while there was no network.
 *
 * ## Why this exists at all
 *
 * The service worker keeps the app openable offline — deliberately without
 * caching a single Supabase response, because a stale memory shown confidently
 * is worse than an honest blank. That is the right call for reading.
 *
 * Writing is the opposite problem. A thought captured in a tunnel and then
 * lost is the one failure this product cannot have: the whole argument for
 * Notes is that it catches the thing at the moment it happens, and an app that
 * silently drops what you just gave it is worse than the notes app you already
 * had. So a write that cannot reach the server is kept here and sent later.
 *
 * ## Why it is a queue and not a retry
 *
 * A retry loop holds the thing in memory, and the tab is closed the moment
 * somebody puts the phone back in their pocket — which on a phone is the same
 * gesture as finishing. IndexedDB survives that. It also survives the app being
 * killed, the browser restarting, and coming back three days later.
 *
 * ## Why the order is kept
 *
 * Two notes captured in a tunnel are two notes, and the second one usually
 * follows from the first. A flush that reorders them, or that skips a failure
 * and carries on, turns a train of thought into a shuffled pile. So the flush
 * stops at the first failure and leaves the rest for next time.
 *
 * The storage is injectable so the queue can be tested without a browser.
 * IndexedDB is the real one; the tests hand it a Map.
 */

const DB_NAME = 'axon-outbox';
const STORE = 'pending';

/** The real store. Resolves to null wherever IndexedDB is not available. */
function indexedDbStore() {
  if (typeof indexedDB === 'undefined') return null;

  const open = () =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

  const run = (mode, fn) =>
    open().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, mode);
          const out = fn(tx.objectStore(STORE));
          tx.oncomplete = () => resolve(out?.result ?? out);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        }),
    );

  return {
    add: (value) => run('readwrite', (s) => s.add(value)),
    all: () => run('readonly', (s) => s.getAll()),
    remove: (id) => run('readwrite', (s) => s.delete(id)),
  };
}

/**
 * A queue over any store with add/all/remove.
 *
 * Every method swallows storage failures rather than throwing: a private
 * window, a browser with site data blocked, or a full disk must not turn
 * "your note is kept" into an exception in the middle of capturing something.
 * What it must never do is claim success — `add` returns whether it worked, so
 * the caller can tell the truth on screen.
 */
export function createOutbox(store = indexedDbStore()) {
  return {
    available: Boolean(store),

    /** Keeps one thing. Returns false when it could not be kept. */
    async add(kind, payload) {
      if (!store) return false;
      try {
        await store.add({ kind, payload, at: new Date().toISOString() });
        return true;
      } catch {
        return false;
      }
    },

    /** How many are waiting. */
    async count() {
      if (!store) return 0;
      try {
        return (await store.all()).length;
      } catch {
        return 0;
      }
    },

    async peek() {
      if (!store) return [];
      try {
        return await store.all();
      } catch {
        return [];
      }
    },

    /**
     * Hands each waiting item to `send` in the order it was captured, oldest
     * first, and removes only what `send` reports as sent.
     *
     * Stops at the first failure. Carrying on past one would let a later note
     * arrive before an earlier one, and a train of thought that arrives
     * shuffled is not the thing that was captured.
     */
    async flush(send) {
      if (!store) return { sent: 0, left: 0 };
      let items;
      try {
        items = await store.all();
      } catch {
        return { sent: 0, left: 0 };
      }
      // getAll returns insertion order for an autoIncrement key, but the sort
      // makes that a property of this function rather than of the browser.
      items.sort((a, b) => a.id - b.id);

      let sent = 0;
      for (const item of items) {
        let ok = false;
        try {
          ok = await send(item);
        } catch {
          ok = false;
        }
        if (!ok) break;
        try {
          await store.remove(item.id);
        } catch {
          // It was sent but could not be removed. Stopping here is the safe
          // side: continuing would send the rest and leave this one to be sent
          // again next time, which is a duplicate nobody can explain.
          break;
        }
        sent += 1;
      }
      return { sent, left: items.length - sent };
    },
  };
}

/** The one the app uses. */
export const outbox = createOutbox();
