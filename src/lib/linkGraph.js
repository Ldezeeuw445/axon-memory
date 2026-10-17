/**
 * Spec §37 step 13 — the links between memories, built only from rows the
 * person owns. Nothing here invents a node or an edge: every node is a row
 * (memory, thread, entity) and every edge is a foreign key or a link row.
 *
 *   thread      memory_items.project_id → projects
 *   entity      entity_links (entity ↔ memory)
 *   supersedes  memory_items.superseded_by, and memory_relations kind supersedes
 *   relates / contradicts / weaves   memory_relations
 *
 * Memories with no link at all are left out: a point with no line says
 * nothing about how things connect. The layout is deterministic (seeded), so
 * the same memory sits in the same place every time it is opened.
 */

export function buildLinkGraph({ memories = [], projects = [], entities = [], entityLinks = [], relations = [] }, { maxMemories = 160, maxEntities = 24 } = {}) {
  const memById = new Map(memories.map((m) => [m.id, m]));
  const projById = new Map(projects.map((p) => [p.id, p]));
  const entById = new Map(entities.map((e) => [e.id, e]));

  // Candidate edges, each pointing at rows that exist.
  const raw = [];
  for (const m of memories) {
    if (m.project_id && projById.has(m.project_id)) raw.push({ kind: 'thread', a: `m:${m.id}`, b: `t:${m.project_id}` });
    if (m.superseded_by && memById.has(m.superseded_by)) raw.push({ kind: 'supersedes', a: `m:${m.superseded_by}`, b: `m:${m.id}` });
  }
  const entityUse = new Map();
  for (const l of entityLinks) {
    if (!memById.has(l.memory_item_id) || !entById.has(l.entity_id)) continue;
    entityUse.set(l.entity_id, (entityUse.get(l.entity_id) || 0) + 1);
  }
  // An entity joined to a single memory links nothing to anything; keep the
  // ones that actually connect, most connected first.
  const keptEntities = new Set([...entityUse.entries()].filter(([, n]) => n >= 2).sort((x, y) => y[1] - x[1]).slice(0, maxEntities).map(([id]) => id));
  for (const l of entityLinks) {
    if (keptEntities.has(l.entity_id) && memById.has(l.memory_item_id)) raw.push({ kind: 'entity', a: `m:${l.memory_item_id}`, b: `e:${l.entity_id}` });
  }
  for (const r of relations) {
    if (!memById.has(r.from_memory_id) || !memById.has(r.to_memory_id)) continue;
    if (!['supersedes', 'relates', 'contradicts', 'weaves'].includes(r.kind)) continue;
    raw.push({ kind: r.kind, a: `m:${r.from_memory_id}`, b: `m:${r.to_memory_id}` });
  }

  // Most recent linked memories, within the budget.
  const linked = new Set(raw.flatMap((e) => [e.a, e.b]).filter((k) => k.startsWith('m:')).map((k) => k.slice(2)));
  const keptMem = new Set(memories.filter((m) => linked.has(m.id))
    .sort((x, y) => String(y.occurred_at || '').localeCompare(String(x.occurred_at || '')))
    .slice(0, maxMemories).map((m) => m.id));

  const seen = new Set();
  const edges = [];
  for (const e of raw) {
    const ok = (k) => (k.startsWith('m:') ? keptMem.has(k.slice(2)) : true);
    if (!ok(e.a) || !ok(e.b)) continue;
    const key = `${e.kind}|${e.a}|${e.b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push(e);
  }
  const used = new Set(edges.flatMap((e) => [e.a, e.b]));
  const nodes = [];
  for (const id of keptMem) {
    if (!used.has(`m:${id}`)) continue;
    const m = memById.get(id);
    nodes.push({ id: `m:${id}`, type: 'memory', label: m.title || firstLine(m.content), retired: !!m.retired_at, superseded: !!m.superseded_by, source: m.source_type, at: m.occurred_at, row: m });
  }
  for (const p of projects) if (used.has(`t:${p.id}`)) nodes.push({ id: `t:${p.id}`, type: 'thread', label: p.name, colour: p.colour || null, row: p });
  for (const e of entities) if (used.has(`e:${e.id}`)) nodes.push({ id: `e:${e.id}`, type: 'entity', label: e.name, kind: e.kind || null, row: e });

  const counts = edges.reduce((c, e) => ({ ...c, [e.kind]: (c[e.kind] || 0) + 1 }), {});
  return { nodes, edges, counts };
}

function firstLine(s) {
  const t = String(s || '').trim().split('\n')[0];
  return t.length > 80 ? `${t.slice(0, 77)}…` : t || 'A memory';
}

/** Small seeded force layout. Threads and entities are heavier anchors. */
export function layoutLinkGraph(graph, { width = 360, height = 520, iterations = 260, seed = 7, inset = {} } = {}) {
  const box = { top: inset.top ?? 18, right: inset.right ?? 18, bottom: inset.bottom ?? 18, left: inset.left ?? 18 };
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pos = new Map();
  graph.nodes.forEach((n, i) => {
    const r = n.type === 'memory' ? 0.42 : 0.22;
    const a = rand() * Math.PI * 2;
    pos.set(n.id, { x: width / 2 + Math.cos(a) * width * r * rand(), y: height / 2 + Math.sin(a) * height * r * rand(), vx: 0, vy: 0, m: n.type === 'memory' ? 1 : 3, i });
  });
  const list = [...pos.values()];
  const k = Math.sqrt((width * height) / Math.max(1, graph.nodes.length)) * 0.55;
  for (let it = 0; it < iterations; it++) {
    const t = 1 - it / iterations;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const p = list[i], q = list[j];
        let dx = p.x - q.x, dy = p.y - q.y;
        const d2 = dx * dx + dy * dy + 0.01;
        if (d2 > 9 * k * k) continue; // far groups stop pushing, so separate threads stay in view
        const f = (k * k) / d2;
        dx *= f; dy *= f;
        p.vx += dx / p.m; p.vy += dy / p.m; q.vx -= dx / q.m; q.vy -= dy / q.m;
      }
    }
    for (const e of graph.edges) {
      const p = pos.get(e.a), q = pos.get(e.b);
      if (!p || !q) continue;
      const dx = q.x - p.x, dy = q.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const f = d / k; // Fruchterman-Reingold: pull grows with d², balances the push near k
      p.vx += dx * f / p.m; p.vy += dy * f / p.m; q.vx -= dx * f / q.m; q.vy -= dy * f / q.m;
    }
    for (const p of list) {
      p.vx += (width / 2 - p.x) * 0.05; p.vy += (height / 2 - p.y) * 0.05;
      const v = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
      const step = Math.min(v, 12 * t + 0.5);
      p.x += (p.vx / v) * step; p.y += (p.vy / v) * step;
      p.vx *= 0.5; p.vy *= 0.5;
    }
  }
  // Fit the settled shape into the open area (inside the insets), keeping its proportions.
  const xs = list.map((p) => p.x), ys = list.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const aw = Math.max(1, width - box.left - box.right), ah = Math.max(1, height - box.top - box.bottom);
  const sc = Math.min(aw / Math.max(1, maxX - minX), ah / Math.max(1, maxY - minY), 2.2);
  const ox = box.left + (aw - (maxX - minX) * sc) / 2, oy = box.top + (ah - (maxY - minY) * sc) / 2;
  return new Map([...pos.entries()].map(([id, p]) => [id, { x: ox + (p.x - minX) * sc, y: oy + (p.y - minY) * sc }]));
}
