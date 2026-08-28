/**
 * The graph the banner flies through.
 *
 * Deliberately mock, not a live read: the banner is public, and a real graph
 * is somebody's actual mail, repos and decisions. The shape and the ratios are
 * true to the product — one source usually holds most of the graph, several
 * hold a handful, a couple hold nothing yet — so the terrain reads like a real
 * account rather than an evenly-lit demo.
 */
import {
  AnthropicLogo, CursorLogo, OpenAILogo, GitHubLogo, NotionLogo,
  GmailLogo, SlackLogo, LinearLogo, ObsidianLogo, PerplexityLogo, GeminiLogo,
} from '../logos.jsx';

export const CORE_COUNT = 1284;

/** id → the summit's brand mark, count, and where the camera finds it. */
/**
 * One hue per source; gold stays AXON's alone.
 *
 * Every hue is oklch(0.74, 0.13, h) — same lightness, same chroma, only the
 * angle moves — converted to hex because three.js Color does not parse oklch.
 * Raw brand colours are wildly uneven next to each other, and on a dark
 * landscape the loud ones read as important rather than as themselves. Sources
 * whose own identity is greyscale keep almost no chroma rather than being
 * given a colour they do not have.
 */
export const SOURCES = [
  { id: 'claude',     name: 'CLAUDE',     count: 412, hue: '#ed905e', icon: AnthropicLogo },
  { id: 'cursor',     name: 'CURSOR',     count: 268, hue: '#98adc4', icon: CursorLogo },
  { id: 'github',     name: 'GITHUB',     count: 221, hue: '#a0acbe', icon: GitHubLogo },
  { id: 'chatgpt',    name: 'CHATGPT',    count: 193, hue: '#40c59b', icon: OpenAILogo },
  { id: 'notion',     name: 'NOTION',     count: 96,  hue: '#b0ab9d', icon: NotionLogo },
  { id: 'gmail',      name: 'GMAIL',      count: 74,  hue: '#f2887f', icon: GmailLogo },
  { id: 'slack',      name: 'SLACK',      count: 58,  hue: '#da8bcf', icon: SlackLogo },
  { id: 'linear',     name: 'LINEAR',     count: 41,  hue: '#9ea0fa', icon: LinearLogo },
  { id: 'obsidian',   name: 'OBSIDIAN',   count: 33,  hue: '#ba96ef', icon: ObsidianLogo },
  { id: 'perplexity', name: 'PERPLEXITY', count: 18,  hue: '#00c3c5', icon: PerplexityLogo },
  { id: 'gemini',     name: 'GEMINI',     count: 12,  hue: '#81a9fd', icon: GeminiLogo },
];

export const AXON_GOLD = '#ffb733';

/**
 * The route the camera walks in the second half of the film: a decision made
 * in Claude is picked up by Cursor, and the same thread reaches ChatGPT. The
 * banner follows the memory, not a tour of the features.
 */
export const ROUTE = ['claude', 'cursor', 'chatgpt'];

/**
 * What a summit actually opens into: the conclusions drawn from its items,
 * not the items themselves. This is memory_facts — a short durable statement,
 * one of six categories, with source_item_ids back to what it came from — so
 * a source holding four hundred memories opens into fifty-eight readable
 * things rather than four hundred cards where the tenth looks like the first.
 */
export const FACTS = {
  claude: [
    { cat: 'DECISION', n: 22, items: 141,
      say: 'Keep the API layer independent from orchestration.' },
    { cat: 'PREFERENCE', n: 14, items: 86,
      say: 'Fails loudly in development and quietly in production \u2014 never both.' },
    { cat: 'PROJECT', n: 9, items: 63,
      say: 'Building a memory layer that sits under every assistant, not another assistant.' },
    { cat: 'TOOL', n: 6, items: 41, say: 'Supabase for everything the database can do itself.' },
    { cat: 'IDENTITY', n: 4, items: 27, say: 'Ships alone, and writes the reason down before the code.' },
    { cat: 'RELATIONSHIP', n: 3, items: 19, say: null },
  ],
  cursor: [
    { cat: 'DECISION', n: 16, items: 98, say: 'Retry logic lives in the transport, never in the caller.' },
    { cat: 'PREFERENCE', n: 11, items: 74, say: 'Tests are named for the failure they catch.' },
    { cat: 'TOOL', n: 7, items: 44, say: 'Dropped the ORM on the read path.' },
    { cat: 'PROJECT', n: 5, items: 31, say: null },
    { cat: 'IDENTITY', n: 2, items: 14, say: null },
    { cat: 'RELATIONSHIP', n: 1, items: 7, say: null },
  ],
  chatgpt: [
    { cat: 'PREFERENCE', n: 12, items: 71, say: 'Short sentences. No adverbs. Never opens with "In today\u2019s world".' },
    { cat: 'DECISION', n: 8, items: 52, say: 'Pricing reads as a utility, not a SaaS ladder.' },
    { cat: 'PROJECT', n: 4, items: 26, say: null },
    { cat: 'IDENTITY', n: 3, items: 18, say: null },
    { cat: 'TOOL', n: 2, items: 11, say: null },
    { cat: 'RELATIONSHIP', n: 1, items: 5, say: null },
  ],
};

/**
 * Two levels down, for the one cluster the banner opens.
 *
 * Fusion is the resting state, so opening is the reverse of it: a cluster
 * comes apart into the conclusions it is made of, and a conclusion comes apart
 * into the items it was drawn from. Same gesture at every depth — there is
 * only one, played backwards to go back.
 */
export const OPEN_CLUSTER = { hub: 'claude', cat: 'DECISION' };

export const CLUSTER_FACTS = [
  { say: 'Keep the API layer independent from orchestration.', items: 5 },
  { say: 'Ship the migration before the feature that needs it, in its own deploy.', items: 4 },
  { say: 'Retire a source without retiring what it already gave you.', items: 3 },
  { say: 'Distil on write, not on read — a conclusion costs fifty tokens, its material fifteen hundred.', items: 6 },
  { say: 'Gold stays AXON\u2019s. Every source carries its own hue.', items: 3 },
];

/** What the leading conclusion above was actually drawn from. */
export const FACT_ITEMS = [
  { label: 'providers.ts \u2014 registerProvider()', src: 'cursor' },
  { label: '"let\u2019s keep the API layer independent"', src: 'claude' },
  { label: 'PR #218 \u2014 split orchestration out', src: 'github' },
  { label: 'thread: swapping providers later', src: 'slack' },
  { label: 'ADR-004 \u2014 provider independence', src: 'notion' },
];

/** Which other apps have asked for a source's leading conclusion. */
export const RECALLED_BY = {
  claude: ['cursor', 'chatgpt'],
  cursor: ['chatgpt'],
  chatgpt: [],
};

/** The column that rises over a summit when the camera climbs it. */
export const MEMORIES = {
  claude: [
    { id: 'c1', label: 'Keep the API layer independent from orchestration — swapping providers stays a non-event.', detail: 'decision', source: 'claude', occurred_at: '2026-03-14' },
    { id: 'c2', label: 'Error handling: fail loudly in development, degrade quietly in production. Never both.', detail: 'preference', source: 'claude', occurred_at: '2026-03-11' },
    { id: 'c3', label: 'Ship the migration before the feature that needs it, always in its own deploy.', detail: 'rule', source: 'claude', occurred_at: '2026-02-28' },
    { id: 'c4', label: 'The onboarding copy reads better in second person. Rewrote all six screens.', detail: 'decision', source: 'claude', occurred_at: '2026-02-19' },
    { id: 'c5', label: 'Prefers tables over bullet lists when more than three things are being compared.', detail: 'preference', source: 'claude', occurred_at: '2026-02-04' },
  ],
  cursor: [
    { id: 'u1', label: 'providers.ts — registerProvider() built against the independent-API decision.', detail: 'code', source: 'cursor', occurred_at: '2026-03-18' },
    { id: 'u2', label: 'Retry logic lives in the transport, never in the caller. Applied across four services.', detail: 'rule', source: 'cursor', occurred_at: '2026-03-16' },
    { id: 'u3', label: 'Tests named for the failure they catch, not the function they call.', detail: 'preference', source: 'cursor', occurred_at: '2026-03-02' },
    { id: 'u4', label: 'Dropped the ORM for the read path — three joins were costing more than the query saved.', detail: 'decision', source: 'cursor', occurred_at: '2026-02-24' },
  ],
  chatgpt: [
    { id: 'g1', label: 'Launch note drafted from the same architecture decision, in the founder voice.', detail: 'draft', source: 'chatgpt', occurred_at: '2026-03-20' },
    { id: 'g2', label: 'Pricing page reads as a utility, not a SaaS ladder. No urgency tactics.', detail: 'decision', source: 'chatgpt', occurred_at: '2026-03-09' },
    { id: 'g3', label: 'Writes short sentences. Cuts adverbs. Never opens with "In today’s world".', detail: 'preference', source: 'chatgpt', occurred_at: '2026-02-15' },
  ],
};

/** Running totals for the cards that travel around the phone, beat by beat. */
export const CARD_STOPS = [
  { id: 'claude',  memories: 412, packs: 96,  tokens: 41000 },
  { id: 'cursor',  memories: 680, packs: 173, tokens: 88000 },
  { id: 'chatgpt', memories: 873, packs: 224, tokens: 122000 },
];

/**
 * Terrain config, same shape configFromHubs() builds in the app: the Core sits
 * at the centre and is the tallest thing on the map; every source rings it at
 * one of two radii, with height square-rooted off its share so an empty source
 * is visibly empty without flattening the rest.
 */
export function buildConfig() {
  const maxCount = Math.max(...SOURCES.map((s) => s.count));
  const hubs = [{
    id: 'axon-core', name: 'AXON MEMORY', memories: CORE_COUNT, color: AXON_GOLD,
    position: [0, -2], height: 5.8, radius: 8,
  }];
  SOURCES.forEach((s, i) => {
    const angle = (i / SOURCES.length) * Math.PI * 2 - Math.PI / 2 + ((i * 17) % 5) * 0.05;
    const ring = i % 2 === 0 ? 15 : 21;
    const jitter = (((i * 53) % 7) / 7 - 0.5) * 2.4;
    const r = ring + jitter;
    const t = Math.sqrt(Math.min(1, s.count / maxCount));
    hubs.push({
      id: s.id, name: s.name, memories: s.count, color: s.hue,
      position: [Math.cos(angle) * r, Math.sin(angle) * r * 0.82],
      height: 0.34 + 3.3 * t, radius: 2.4 + 3.1 * t, icon: s.icon,
    });
  });
  hubs.push(
    { id: 'deco-1', name: null, memories: 0, position: [26, 12], height: 1.8, radius: 3.5 },
    { id: 'deco-2', name: null, memories: 0, position: [-25, 14], height: 1.7, radius: 3.5 },
    { id: 'deco-3', name: null, memories: 0, position: [6, 24], height: 1.6, radius: 3.2 },
    { id: 'deco-4', name: null, memories: 0, position: [-24, -16], height: 1.5, radius: 3.2 },
    { id: 'deco-5', name: null, memories: 0, position: [27, -14], height: 1.6, radius: 3.4 },
  );
  return { seed: 7, size: 64, baseHeight: 1.1, hubs };
}
