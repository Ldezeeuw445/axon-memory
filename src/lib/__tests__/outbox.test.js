// Ported from Ldezeeuw445/axon-memory-app@fbc294e src/lib/__tests__/outbox.test.js.
/**
 * The queue that holds a thought captured with no network.
 *
 * This is the one failure the product cannot have — the whole argument for
 * capture is that it catches the thing at the moment it happens, and an app
 * that silently drops what you just gave it is worse than the notes app you
 * already had. So the awkward paths are the point here: a send that fails
 * halfway, a store that throws, a browser with no IndexedDB at all.
 */
import { describe, expect, it } from 'vitest';
import { createOutbox } from '../outbox';

/** A stand-in for IndexedDB: same three methods, no browser. */
function memoryStore() {
  const rows = new Map();
  let next = 1;
  return {
    rows,
    add: async (v) => { const id = next++; rows.set(id, { ...v, id }); return id; },
    all: async () => [...rows.values()],
    remove: async (id) => { rows.delete(id); },
  };
}

describe('what is kept when there is no network', () => {
  it('keeps a thing and says it kept it', async () => {
    const box = createOutbox(memoryStore());
    expect(await box.add('note', { content: 'in a tunnel' })).toBe(true);
    expect(await box.count()).toBe(1);
  });

  it('sends in the order it was captured', async () => {
    // Two notes captured in a tunnel are two notes, and the second usually
    // follows from the first.
    const box = createOutbox(memoryStore());
    await box.add('note', { content: 'first' });
    await box.add('note', { content: 'second' });
    await box.add('note', { content: 'third' });

    const seen = [];
    const res = await box.flush(async (item) => { seen.push(item.payload.content); return true; });

    expect(seen).toEqual(['first', 'second', 'third']);
    expect(res).toEqual({ sent: 3, left: 0 });
    expect(await box.count()).toBe(0);
  });

  it('stops at the first failure and keeps the rest, in order', async () => {
    // Carrying on past a failure lets a later note arrive before an earlier
    // one, and a train of thought that arrives shuffled is not the thing that
    // was captured.
    const box = createOutbox(memoryStore());
    await box.add('note', { content: 'first' });
    await box.add('note', { content: 'second' });
    await box.add('note', { content: 'third' });

    const res = await box.flush(async (item) => item.payload.content === 'first');

    expect(res).toEqual({ sent: 1, left: 2 });
    expect((await box.peek()).map((i) => i.payload.content)).toEqual(['second', 'third']);
  });

  it('treats a thrown send as a failure rather than losing the item', async () => {
    // A network error rejects; it does not return false.
    const box = createOutbox(memoryStore());
    await box.add('note', { content: 'kept' });
    const res = await box.flush(async () => { throw new Error('offline'); });
    expect(res.sent).toBe(0);
    expect(await box.count()).toBe(1);
  });

  it('never sends the same thing twice when it cannot be removed', async () => {
    // Sent but not removable is the one case that can produce a duplicate
    // nobody is able to explain. It stops instead.
    const store = memoryStore();
    store.remove = async () => { throw new Error('disk full'); };
    const box = createOutbox(store);
    await box.add('note', { content: 'a' });
    await box.add('note', { content: 'b' });

    let calls = 0;
    await box.flush(async () => { calls += 1; return true; });
    expect(calls).toBe(1);
  });

  it('says so instead of throwing when the store cannot be written', async () => {
    // A private window, or a browser set to block site data. Capturing must
    // not raise in the middle of somebody writing something down — but it must
    // not claim success either, or the screen tells a lie.
    const store = memoryStore();
    store.add = async () => { throw new Error('blocked'); };
    const box = createOutbox(store);
    expect(await box.add('note', { content: 'x' })).toBe(false);
  });

  it('is harmless in a browser with no IndexedDB', async () => {
    const box = createOutbox(null);
    expect(box.available).toBe(false);
    expect(await box.add('note', {})).toBe(false);
    expect(await box.count()).toBe(0);
    expect(await box.flush(async () => true)).toEqual({ sent: 0, left: 0 });
  });
});
