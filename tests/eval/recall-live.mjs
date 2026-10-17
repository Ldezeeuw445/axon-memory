// Live recall eval (A3-2): real embeddings, real ranking, through the public API.
// A throwaway Power user (FIX={apiKey}) gets a hand-written corpus with
// paraphrases, Dutch, contradictions and an explicit supersession; then every
// case is asked through POST /v1/recall and scored:
//   hit@1 and MRR for cases with an expected memory,
//   abstain: a question about something never captured must return nothing,
//   noise: how many results a specific question drags along (lower is better).
// Usage: FIX=fixture.json [BASE=https://mcp.axon-memory.com/v1] [SEED=1] node tests/eval/recall-live.mjs
import fs from 'node:fs';
const fx = JSON.parse(fs.readFileSync(process.env.FIX));
const BASE = process.env.BASE || 'https://mcp.axon-memory.com/v1';
const H = { authorization: `Bearer ${fx.apiKey}`, 'content-type': 'application/json' };
const STATE = process.env.STATE || '/tmp/recall-live-ids.json';
const day = (n) => new Date(Date.now() - n * 86400e3).toISOString();

const CORPUS = [
  ['launch_old', 'Kestrel launches to the first design partners on 3 November.', 40],
  ['launch_new', 'Kestrel launch moved: it now ships on 17 November, two weeks later than planned.', 3],
  ['db', 'We decided to stay on Postgres; the move to MongoDB is off the table.', 30],
  ['achilles', 'My left Achilles tendon flares up after back-to-back tempo runs, so never schedule them on consecutive days.', 20],
  ['race', 'Goal race is the Rotterdam marathon in April, target pace 4:58 per kilometre.', 25],
  ['allergy', 'I am allergic to penicillin.', 200],
  ['code_style', 'When writing code for me, default to TypeScript and keep dependencies to a minimum.', 60],
  ['writing', 'I write in British English and prefer short paragraphs over bullet points.', 90],
  ['kiln', 'The kiln in the new studio needs a 32 amp power connection; confirm with the landlord before signing.', 12],
  ['movers', 'Book the movers on a weekday morning: the street only has a loading zone until 11:00.', 11],
  ['nl_tandarts', 'Afspraak bij de tandarts op dinsdag 4 november om half negen.', 2],
  ['nl_huur', 'De huur van het atelier aan de Czaar Peterstraat is 1.450 euro per maand, inclusief servicekosten.', 14],
  ['nl_dochter', 'Mijn dochter Noor zit op zwemles op woensdagmiddag.', 50],
  ['partner', 'Marit owns the launch announcement; I review the copy but she has the final say on tone.', 8],
  ['onboard', 'Onboarding drop-off happens at the calendar permission step; test a "later" option there first.', 6],
  ['coffee', 'I take my coffee black, no sugar.', 120],
  ['laptop', 'My work laptop is a 14-inch MacBook Pro with 32 GB of memory.', 70],
  ['plan_old', 'Pricing for launch: a single plan at 9 euro a month.', 35],
  ['plan_new', 'Pricing for launch: a single plan at 12 euro a month.', 4], // explicit supersede of plan_old below
  ['passport', 'My passport expires in March 2028.', 300],
];
const SUPERSEDE = [['plan_old', 'plan_new']];

const CASES = [
  // [name, query, expect (key at rank 1), forbid keys, kind]
  ['exact terms', 'Achilles tempo runs', 'achilles', [], 'lexical'],
  ['paraphrase: no shared words', 'which heel injury should I watch for when training', 'achilles', [], 'paraphrase'],
  ['paraphrase: question form', 'what medicine can I not take', 'allergy', [], 'paraphrase'],
  ['paraphrase: preferences', 'how do I like my programs written', 'code_style', [], 'paraphrase'],
  ['paraphrase: logistics', 'what electricity does the studio oven need', 'kiln', [], 'paraphrase'],
  ['paraphrase: hardware', 'what computer do I use for work', 'laptop', [], 'paraphrase'],
  ['Dutch query, English memory', 'wanneer is de marathon en welk tempo', 'race', [], 'dutch'],
  ['Dutch query, English memory 2', 'waar ben ik allergisch voor', 'allergy', [], 'dutch'],
  ['English query, Dutch memory', 'when is my dentist appointment', 'nl_tandarts', [], 'dutch'],
  ['English query, Dutch memory 2', 'how much is the studio rent', 'nl_huur', [], 'dutch'],
  ['Dutch query, Dutch memory', 'wanneer heeft Noor zwemles', 'nl_dochter', [], 'dutch'],
  ['contradiction: newer wins', 'when does Kestrel launch', 'launch_new', [], 'contradiction'],
  ['contradiction: newer wins (paraphrase)', 'what is the ship date for the product', 'launch_new', [], 'contradiction'],
  ['supersession: old state gone', 'what does the launch plan cost per month', 'plan_new', ['plan_old'], 'supersession'],
  ['typo', 'penicilin allergy', 'allergy', [], 'fuzzy'],
  ['abstain: never captured', 'what is my blood type', null, [], 'abstain'],
  ['abstain: nonsense', 'zzqx vlorp nothing like this', null, [], 'abstain'],
  ['abstain: unrelated topic', 'favourite football club', null, [], 'abstain'],
];

const api = async (path, body) => {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
};

let ids = fs.existsSync(STATE) && !process.env.SEED ? JSON.parse(fs.readFileSync(STATE)) : null;
if (!ids) {
  ids = {};
  for (const [k, content, ago] of CORPUS) {
    const j = await api('/memories', { content, occurred_at: day(ago), idempotency_key: `recall-live-${k}-${fx.apiKey.slice(-6)}` });
    ids[k] = j.memory?.id ?? j.id ?? j.data?.id;
  }
  for (const [o, n] of SUPERSEDE) await api(`/memories/${ids[o]}/supersede`, { new_id: ids[n], reason: 'price changed' });
  fs.writeFileSync(STATE, JSON.stringify(ids));
  await new Promise((r) => setTimeout(r, 3000));
}
const keyOf = Object.fromEntries(Object.entries(ids).map(([k, v]) => [v, k]));

const rows = [];
for (const [name, query, expect, forbid, kind] of CASES) {
  const t0 = Date.now();
  const j = await api('/recall', { query, limit: 20 });
  const ms = Date.now() - t0;
  const got = (j.memories || []).map((m) => ({ k: keyOf[m.id] ?? '?', s: m.relevance?.score, sim: m.relevance?.similarity }));
  const rank = expect ? got.findIndex((g) => g.k === expect) + 1 : 0;
  const bad = forbid.filter((f) => got.some((g) => g.k === f));
  const pass = expect ? rank === 1 && !bad.length : got.length === 0;
  rows.push({ name, kind, pass, rank, n: got.length, ms, bad, top: got.slice(0, 3).map((g) => `${g.k}:${g.s}${g.sim != null ? `/${g.sim}` : ''}`).join(' ') });
}
const ranked = rows.filter((r) => r.kind !== 'abstain');
const mrr = ranked.reduce((a, r) => a + (r.rank ? 1 / r.rank : 0), 0) / ranked.length;
const hit1 = ranked.filter((r) => r.rank === 1 && !r.bad.length).length;
const abst = rows.filter((r) => r.kind === 'abstain');
const noise = ranked.reduce((a, r) => a + r.n, 0) / ranked.length;
for (const r of rows) console.log(`${r.pass ? '✓' : '✗'} [${r.kind}] ${r.name} — rank ${r.rank || '-'} of ${r.n}${r.bad.length ? ` FORBIDDEN ${r.bad}` : ''} (${r.ms} ms) top: ${r.top}`);
console.log(`\nhit@1 ${hit1}/${ranked.length}  MRR ${mrr.toFixed(3)}  abstain ${abst.filter((r) => r.pass).length}/${abst.length}  avg results per specific question ${noise.toFixed(1)}  median ${rows.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(rows.length / 2)]} ms`);
if (process.env.JSON) fs.writeFileSync(process.env.JSON, JSON.stringify({ rows, hit1, of: ranked.length, mrr, abstain: abst.filter((r) => r.pass).length, abstainOf: abst.length, noise }, null, 1));
