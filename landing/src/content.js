/**
 * All page copy in one place. The film captions are timed to the six acts in
 * film/formations.js — caption i belongs to formation i.
 */

export const CAPTIONS = [
  {
    eyebrow: 'Monday, 09:14',
    title: 'You open Cursor.',
    body:
      'You type one line. The assistant already knows the architecture decision you made with Claude last Thursday, your taste in error handling, and the bug still open in Linear.',
  },
  {
    eyebrow: 'Underneath',
    title: 'You did not paste any of that.',
    body:
      'No context dump. No mega-prompt. The relevant pieces were already there, gathered from the places you actually work.',
  },
  {
    eyebrow: 'Without AXON',
    title: 'Every tool remembers alone.',
    body:
      'Claude knows one conversation. Gemini knows another. Cursor knows this repo. Linear knows the bug. You are the only thing connecting them — so you repeat yourself, all day.',
  },
  {
    eyebrow: 'AXON',
    title: 'One memory layer, underneath.',
    body:
      'Information enters. AXON understands it, structures it, and keeps it. Not another assistant — the memory the assistants you already use have never had.',
  },
  {
    eyebrow: 'Everywhere',
    title: 'Decide once. It follows you.',
    body:
      'A decision made in Claude is there when you open Cursor. And Gemini. And the next tool you try. You never think about AXON. That is the point.',
  },
  {
    eyebrow: 'The memory language',
    title: 'Memory humans can read.',
    body:
      'A long conversation becomes a clear object: a title, what was decided, the tags, the project it belongs to, where it came from. Readable by you, retrievable by the machine.',
  },
];

export const MEMORY_EXAMPLE = {
  title: 'API Architecture Decision',
  description:
    'Keep the API layer independent from the orchestration layer to preserve modularity and simplify future provider changes.',
  tags: ['architecture', 'API', 'orchestration', 'modularity'],
  context: ['AXE CORE', 'Backend', 'Architecture'],
  source: 'Claude',
};

export const STEPS = [
  {
    n: '01',
    title: 'Connect',
    body: 'Sign in once to Gmail, GitHub, Notion or Slack. Tokens are encrypted; you can disconnect any source at any time.',
  },
  {
    n: '02',
    title: 'AXON understands',
    body: 'Raw material is read, structured and tagged — turned into memory objects instead of a pile of text.',
  },
  {
    n: '03',
    title: 'Memory is created',
    body: 'Every memory keeps what it means, what it belongs to, and where it came from.',
  },
  {
    n: '04',
    title: 'Context follows you',
    body: 'Claude, ChatGPT, Gemini and Cursor ask AXON for exactly what they need, when they need it.',
  },
];

// Mirrors src/lib/planCatalog.js and supabase/functions/_shared/plans.ts.
// Prices verified against the live Stripe price IDs — keep all three in sync.
export const PLANS = [
  {
    tier: 'starter',
    name: 'Starter',
    price: '€2.99',
    period: '/month',
    tagline: 'Get your memory layer running.',
    features: [
      'Unlimited structured memories',
      'Connect Gmail, GitHub, Notion, and Slack',
      'Full-text recall & memory graph',
      'One personal API key',
    ],
  },
  {
    tier: 'pro',
    name: 'Pro',
    price: '€5.99',
    period: '/month',
    tagline: 'Connect your AI assistants.',
    recommended: true,
    features: [
      'Everything in Starter',
      'Connect Claude, ChatGPT, Gemini, Cursor & more',
      'One memory shared across every connected AI',
      'Advanced search & entity extraction',
    ],
  },
  {
    tier: 'ultra',
    name: 'Ultra',
    price: '€9.99',
    period: '/month',
    tagline: 'For power users and builders.',
    features: [
      'Everything in Pro',
      'Semantic (meaning-based) search',
      'Full API + MCP access for custom tools',
      'Priority sync frequency',
    ],
  },
  {
    tier: 'lifetime_founder',
    name: 'Lifetime Founder',
    price: '€199',
    period: 'one-time',
    tagline: 'Everything, forever. Limited founder pricing.',
    features: [
      'Everything in Ultra',
      'Lifetime access — no recurring billing',
      'Founder badge + early access',
      'Direct line to the team',
    ],
  },
];

export const APP_URL = 'https://app.axon-memory.com';
