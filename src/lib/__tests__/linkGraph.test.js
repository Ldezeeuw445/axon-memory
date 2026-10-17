import { describe, it, expect } from 'vitest';
import { buildLinkGraph, layoutLinkGraph } from '../linkGraph';

const m = (id, extra = {}) => ({ id, title: `memory ${id}`, occurred_at: `2026-10-${String(10 + id.length).padStart(2, '0')}T00:00:00Z`, ...extra });

describe('buildLinkGraph — real rows only', () => {
  it('makes no nodes or edges from nothing', () => {
    const g = buildLinkGraph({});
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
  });

  it('drops memories with no link at all', () => {
    const g = buildLinkGraph({ memories: [m('a'), m('b')] });
    expect(g.nodes).toHaveLength(0);
  });

  it('links memories through their thread, entity and supersession', () => {
    const g = buildLinkGraph({
      memories: [m('a', { project_id: 'p1' }), m('b', { project_id: 'p1', superseded_by: 'c' }), m('c')],
      projects: [{ id: 'p1', name: 'Kestrel launch' }],
      entities: [{ id: 'e1', name: 'Marit', kind: 'person' }],
      entityLinks: [{ entity_id: 'e1', memory_item_id: 'a' }, { entity_id: 'e1', memory_item_id: 'c' }],
    });
    expect(g.counts).toEqual({ thread: 2, supersedes: 1, entity: 2 });
    expect(g.edges.find((e) => e.kind === 'supersedes')).toEqual({ kind: 'supersedes', a: 'm:c', b: 'm:b' });
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['e:e1', 'm:a', 'm:b', 'm:c', 't:p1']);
  });

  it('never points an edge at a row it was not given', () => {
    const g = buildLinkGraph({
      memories: [m('a', { project_id: 'missing', superseded_by: 'gone' })],
      entityLinks: [{ entity_id: 'nobody', memory_item_id: 'a' }],
      relations: [{ from_memory_id: 'a', to_memory_id: 'elsewhere', kind: 'relates' }],
    });
    expect(g.edges).toEqual([]);
  });

  it('keeps an entity only when it joins two or more memories', () => {
    const g = buildLinkGraph({
      memories: [m('a'), m('b')],
      entities: [{ id: 'e1', name: 'once' }],
      entityLinks: [{ entity_id: 'e1', memory_item_id: 'a' }],
    });
    expect(g.nodes).toHaveLength(0);
  });

  it('accepts memory_relations kinds and ignores unknown ones; dedupes', () => {
    const g = buildLinkGraph({
      memories: [m('a'), m('b')],
      relations: [{ from_memory_id: 'a', to_memory_id: 'b', kind: 'contradicts' }, { from_memory_id: 'a', to_memory_id: 'b', kind: 'contradicts' }, { from_memory_id: 'a', to_memory_id: 'b', kind: 'invented' }],
    });
    expect(g.edges).toEqual([{ kind: 'contradicts', a: 'm:a', b: 'm:b' }]);
  });

  it('caps memories to the most recent linked ones', () => {
    const memories = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, project_id: 'p', occurred_at: `2026-10-${String(i + 1).padStart(2, '0')}` }));
    const g = buildLinkGraph({ memories, projects: [{ id: 'p', name: 'p' }] }, { maxMemories: 3 });
    expect(g.nodes.filter((n) => n.type === 'memory').map((n) => n.id).sort()).toEqual(['m:m7', 'm:m8', 'm:m9']);
  });
});

describe('layoutLinkGraph', () => {
  it('is deterministic and stays inside the frame', () => {
    const g = buildLinkGraph({ memories: [m('a', { project_id: 'p' }), m('bb', { project_id: 'p' })], projects: [{ id: 'p', name: 'p' }] });
    const one = layoutLinkGraph(g, { width: 300, height: 400 });
    const two = layoutLinkGraph(g, { width: 300, height: 400 });
    expect([...one.entries()]).toEqual([...two.entries()]);
    for (const { x, y } of one.values()) { expect(x).toBeGreaterThanOrEqual(18); expect(x).toBeLessThanOrEqual(282); expect(y).toBeGreaterThanOrEqual(18); expect(y).toBeLessThanOrEqual(382); }
  });
});
