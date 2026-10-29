import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowDown } from 'lucide-react';
import MemoryFlow from '../components/home/MemoryFlow';
import { PLAN_CATALOG } from '../lib/planCatalog';
import { isAppHost } from '../lib/host';
import '../styles/home.css';

/**
 * The landing page (spec §22–29). Rules it keeps:
 *  - every product image is the real app, shown with an example account, and says so;
 *  - no counts, logos, testimonials or security adjectives we cannot back;
 *  - nothing that looks like a chat box in the first five seconds;
 *  - one moving element at a time.
 */
const APP_ORIGIN = 'https://app.axon-memory.com';
const appUrl = (path) => (typeof window !== 'undefined' && /(^|\.)axon-memory\.com$/.test(window.location.hostname) && !isAppHost() ? `${APP_ORIGIN}${path}` : path);
const START = () => appUrl('/login?mode=signup');
const SIGN_IN = () => appUrl('/login');

function Reveal({ children, as: Tag = 'div', className = '', delay = 0, ...rest }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) { setInView(true); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }, { rootMargin: '0px 0px -12% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref} className={`hm-reveal ${inView ? 'is-in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }} {...rest}>{children}</Tag>;
}

function Phone({ src, alt }) {
  return (
    <div>
      <div className="hm-phone"><img src={src} alt={alt} loading="lazy" decoding="async" /></div>
      <div className="hm-shot-note">The AXON app, shown with an example account.</div>
    </div>
  );
}

const STEPS = [
  {
    n: 'Capture', title: 'Say it once, wherever you are.', img: '/product/capture.jpg', alt: 'The Capture view in the AXON app',
    body: 'Write it, say it, or share it to AXON from any app. Or let the AIs you already use keep what matters as you work with them.',
    points: ['Text, voice and links; anything shared from your phone', 'Each memory remembers where it came from', 'Captured twice? It is kept once'],
  },
  {
    n: 'Recall', title: 'Ask any AI. It already knows.', img: '/product/recall.jpg', alt: 'The Recall view in the AXON app',
    body: 'Connect Claude, ChatGPT, Gemini or Cursor (and other MCP clients) once. After you approve access, that AI can capture and recall through AXON\'s tools — what one wrote, another can read. You see which AI recalled what. Capture and recall happen when the connected AI calls AXON; they do not run on their own in the background.',
    points: ['Things you said, kept apart from what AXON concluded', 'Recall by words or by Thread; by meaning on Power', 'Retire anything and it stops being recalled'],
  },
  {
    n: 'Continuity', title: 'Your work keeps its thread.', img: '/product/thread.jpg', alt: 'A Thread in the AXON app',
    body: 'A Thread gathers everything about one project, person or decision, whichever AI it came from. Recent things stay near the surface; older ground settles deeper.',
    points: ['Pick up a project months later, in a different tool', 'Replace a decision; the old one stays on record', 'Retire what no longer holds; restore it any time'],
  },
];

const PRIVACY = [
  ['It is yours', 'Download everything you keep in one file, at any time. Delete your account and AXON deletes your memory with it.'],
  ['You decide who reads it', 'Each AI asks for your permission on a consent screen, with the access it wants spelled out. Nothing reads your memory without it.'],
  ['Every memory knows its source', 'Each memory shows where it came from — which app, which AI, when — and whether you said it or AXON concluded it.'],
  ['Withdraw any time', 'Remove an AI or disconnect a source in one step. Where the provider allows it, AXON withdraws its access there too.'],
  ['Deleting means deleted', 'A deleted memory is removed everywhere it reached, including search indexes and anything concluded only from it. It does not come back.'],
  ['Only ever your account', 'Every table is guarded by row-level security, and cross-account isolation tests are part of every release. Stored in the EU (Paris).'],
];

export default function Home() {
  const [scrolled, setScrolled] = useState(false);
  const page = useRef(null);
  // The app shell is a fixed-height frame, so the landing scrolls inside its own element.
  useEffect(() => {
    const el = page.current;
    const on = () => setScrolled(el.scrollTop > 24);
    on(); el.addEventListener('scroll', on, { passive: true });
    document.title = 'AXON — One memory. Every AI.';
    return () => el.removeEventListener('scroll', on);
  }, []);

  return (
    <div className="hm-page" ref={page}>
      <header className={`hm-nav ${scrolled ? 'is-scrolled' : ''}`}>
        <a href="#top" className="hm-brand"><img src="/brand/axon-mark-96.webp" alt="" width="28" height="28" /> AXON</a>
        <nav className="hm-nav-links" aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#privacy">Privacy</a>
          <a href="#pricing" className="hm-hide-m">Pricing</a>
          <Link to="/docs" className="hm-hide-m">Developers</Link>
        </nav>
        <div className="hm-nav-cta">
          <a href={SIGN_IN()} className="hm-btn-ghost hm-btn-sm">Sign in</a>
          <a href={START()} className="hm-btn hm-btn-sm">Start</a>
        </div>
      </header>

      <section className="hm-hero" id="top">
        <div className="hm-hero-copy">
          <h1 className="hm-h1">One memory.<br />Every AI.</h1>
          <p className="hm-lead">AXON keeps what you decide, prefer and learn — and makes it available to the AI tools you connect through MCP. Your memory, owned by you, not by any one AI company.</p>
          <p className="hm-works">Works today via MCP: Claude, ChatGPT, Gemini and Cursor — more coming. Capture and recall go through the AI's tool calls to AXON; they are not automatic in the background.</p>
          <div className="hm-cta-row">
            <a href={START()} className="hm-btn">Start <ArrowRight size={16} /></a>
            <a href="#how" className="hm-btn-ghost">See how it works <ArrowDown size={16} /></a>
          </div>
        </div>
        <MemoryFlow />
        <div className="hm-example">Example</div>
      </section>

      <section className="hm-section">
        <Reveal><div className="hm-eyebrow">The problem</div></Reveal>
        <Reveal><h2 className="hm-h2">Every AI you use starts from zero.</h2></Reveal>
        <Reveal><p className="hm-sub">You explain your project to one AI, your preferences to another, your decisions to a third. Switch tools and it is gone. What each one remembers stays locked inside it.</p></Reveal>
        <Reveal className="hm-problem">
          <div><strong>You repeat yourself</strong><span>The same background, retyped into every new tool and every new start.</span></div>
          <div><strong>Decisions drift</strong><span>What you settled last month is not what the next AI assumes today.</span></div>
          <div><strong>Memory is rented</strong><span>Each app keeps its own piece of you, on its terms, out of your reach.</span></div>
        </Reveal>
      </section>

      <section className="hm-section" id="how">
        <Reveal><div className="hm-eyebrow">How it works</div></Reveal>
        <Reveal><h2 className="hm-h2">Capture. Recall. Continuity.</h2></Reveal>
        <div className="hm-steps">
          {STEPS.map((s, k) => (
            <div key={s.n} className={`hm-step ${k % 2 ? 'flip' : ''}`}>
              <Reveal className="hm-step-copy">
                <div className="hm-step-n">{String(k + 1).padStart(2, '0')} · {s.n}</div>
                <h3>{s.title}</h3>
                <p className="hm-p">{s.body}</p>
                <ul>{s.points.map((p) => <li key={p}>{p}</li>)}</ul>
              </Reveal>
              <Reveal delay={150}><Phone src={s.img} alt={s.alt} /></Reveal>
            </div>
          ))}
        </div>
      </section>

      <section className="hm-section">
        <Reveal><div className="hm-eyebrow">The product</div></Reveal>
        <Reveal><h2 className="hm-h2">Your memory, as a place.</h2></Reveal>
        <Reveal><p className="hm-sub">Terrain shows where your memory comes from — each summit is a real source, its height what it has given. Connect shows which AIs may read it, and lets you withdraw any of them.</p></Reveal>
        <div className="hm-duo">
          <Reveal className="hm-wide" style={{ marginTop: 0 }}><img src="/product/terrain.jpg" alt="Terrain in the AXON app" loading="lazy" decoding="async" /></Reveal>
          <Reveal delay={150}><Phone src="/product/connect.jpg" alt="Connect in the AXON app" /></Reveal>
        </div>
      </section>

      <section className="hm-section" id="developers">
        <Reveal><div className="hm-eyebrow">Developers</div></Reveal>
        <Reveal><h2 className="hm-h2">One contract for every client.</h2></Reveal>
        <Reveal><p className="hm-sub">The app, every MCP client and your own code use the same versioned API, with the same rules about whose memory is whose.</p></Reveal>
        <Reveal className="hm-dev">
          <div className="hm-card"><strong>MCP</strong><p>Add <code style={{ fontSize: 12 }}>mcp.axon-memory.com</code> as a remote server. Sign-in is OAuth with PKCE; you choose the scope.</p></div>
          <div className="hm-card"><strong>HTTP API</strong><p>Capture, recall, retire, restore, supersede and delete under <code style={{ fontSize: 12 }}>/v1</code>, with an OpenAPI contract and idempotent capture.</p></div>
          <div className="hm-card"><strong>TypeScript SDK</strong><p>A typed client with safe retries, in the open-source repository. Not on npm yet.</p></div>
        </Reveal>
        <Reveal><pre className="hm-code">{`curl https://mcp.axon-memory.com/v1/recall \\
  -H "Authorization: Bearer $AXON_KEY" \\
  -d '{"query": "launch date"}'`}</pre></Reveal>
        <Reveal><p className="hm-p" style={{ marginTop: 18 }}><Link to="/docs" style={{ color: '#FFD98A' }}>Read the developer reference →</Link></p></Reveal>
      </section>

      <section className="hm-section" id="privacy">
        <Reveal className="hm-privacy">
          <div className="hm-eyebrow">Privacy</div>
          <h2 className="hm-h2">Your memory answers to you.</h2>
          <p className="hm-sub">A memory layer is only worth having if you trust it completely. So these are not settings you have to find; they are how AXON is built.</p>
          <div className="hm-privacy-grid">
            {PRIVACY.map(([t, b]) => <div key={t}><strong>{t}</strong><p>{b}</p></div>)}
          </div>
          <p className="hm-p" style={{ marginTop: 40, fontSize: 14 }}>The details, including which providers process what, are in the <Link to="/privacy" style={{ color: '#FFD98A' }}>privacy policy</Link>.</p>
        </Reveal>
      </section>

      <section className="hm-section" id="pricing">
        <Reveal><div className="hm-eyebrow">Pricing</div></Reveal>
        <Reveal><h2 className="hm-h2">Simple, and yours to cancel.</h2></Reveal>
        <Reveal className="hm-pricing">
          {PLAN_CATALOG.map((p) => (
            <div key={p.tier} className={`hm-plan ${p.recommended ? 'is-rec' : ''}`}>
              <div className="hm-plan-name"><span>{p.name}</span>{p.recommended && <span style={{ color: '#FFD98A' }}>Recommended</span>}</div>
              <div className="hm-plan-price">{p.price}<small>{p.period === 'one-time' ? 'once' : '/ month'}</small></div>
              <div className="hm-plan-tag">{p.tagline}</div>
              <ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
              <a href={START()} className={p.recommended ? 'hm-btn' : 'hm-btn-ghost'}>{p.tier === 'lifetime_founder' ? 'Choose Lifetime' : `Start with ${p.name}`}</a>
            </div>
          ))}
        </Reveal>
        <Reveal>
          <p className="hm-pricing-note">
            Plans differ by which features unlock — AI connectors, meaning recall, API keys — not by a published cap on how many memories you may keep.
            No hard plan quotas; fair use applies (for example up to 60 MCP tool calls per minute per token).
            Cancel a subscription any time in billing; when it ends you return to Starter and your memory stays unless you delete your account.
            Lifetime Founder includes a 14-day money-back guarantee. There is no free trial — start on a monthly plan first if you want to try before Lifetime.
          </p>
        </Reveal>
      </section>

      <section className="hm-final">
        <Reveal><h2 className="hm-h2">Remember once.</h2></Reveal>
        <Reveal><p className="hm-sub" style={{ margin: '18px auto 0' }}>Every AI you use, working from the same memory — yours.</p></Reveal>
        <Reveal><div className="hm-cta-row"><a href={START()} className="hm-btn">Start <ArrowRight size={16} /></a></div></Reveal>
      </section>

      <footer className="hm-footer">
        <span>AXON</span>
        <nav><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/docs">Developers</Link><a href={SIGN_IN()}>Sign in</a></nav>
      </footer>
    </div>
  );
}
