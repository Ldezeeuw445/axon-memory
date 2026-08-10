import { useEffect, useRef, useState } from 'react';
import Film from './film/Film';
import { APP_URL, CAPTIONS, MEMORY_EXAMPLE, PLANS, STEPS } from './content';

/** Fades a section in the first time it enters the viewport. */
function Reveal({ children, className = '', as: Tag = 'section', ...rest }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '-12% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag ref={ref} className={`reveal ${seen ? 'is-seen' : ''} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

function Nav() {
  return (
    <nav className="nav" aria-label="Primary">
      <a className="nav-brand" href="#top">
        <img src="/favicon.svg" alt="" width="26" height="26" />
        <span>AXON</span>
      </a>
      <div className="nav-links">
        <a href="#how">How it works</a>
        <a href="#memory">Memory</a>
        <a href="#pricing">Pricing</a>
        <a className="nav-signin" href={`${APP_URL}/login`}>
          Sign in
        </a>
      </div>
    </nav>
  );
}

function MemoryObject() {
  const m = MEMORY_EXAMPLE;
  return (
    <div className="memory-object">
      <div className="memory-row">
        <span className="memory-key">Title</span>
        <span className="memory-title">{m.title}</span>
      </div>
      <div className="memory-row">
        <span className="memory-key">Description</span>
        <p className="memory-desc">{m.description}</p>
      </div>
      <div className="memory-row">
        <span className="memory-key">Tags</span>
        <span className="chips">
          {m.tags.map((t) => (
            <span className="chip" key={t}>
              {t}
            </span>
          ))}
        </span>
      </div>
      <div className="memory-row">
        <span className="memory-key">Context</span>
        <span className="chips">
          {m.context.map((t) => (
            <span className="chip chip-quiet" key={t}>
              {t}
            </span>
          ))}
        </span>
      </div>
      <div className="memory-row">
        <span className="memory-key">Source</span>
        <span className="memory-source">{m.source}</span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <a className="skip" href="#how">
        Skip the film
      </a>
      <Nav />

      <main id="top">
        <header className="hero-intro">
          <h1>
            One memory layer.
            <span> Every AI you use.</span>
          </h1>
          <p>
            Your tools forget the moment you close them. AXON remembers — and hands the right context
            to whichever assistant you open next.
          </p>
          <p className="hero-hint" aria-hidden="true">
            Scroll to begin
          </p>
        </header>

        <Film captions={CAPTIONS} />

        <Reveal className="band" id="how">
          <p className="eyebrow">How it works</p>
          <h2 className="band-title">Four steps, then you forget it exists.</h2>
          <ol className="steps">
            {STEPS.map((s) => (
              <li key={s.n}>
                <span className="step-n">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </Reveal>

        <Reveal className="band band-split" id="memory">
          <div>
            <p className="eyebrow">Memory</p>
            <h2 className="band-title">Memory humans can read. Context machines can retrieve.</h2>
            <p className="band-body">
              A two-hour conversation is not a useful memory. AXON reduces it to what was actually
              decided, keeps the thread back to where it came from, and makes it retrievable by
              meaning rather than by keyword.
            </p>
            <p className="band-body quiet">
              Embeddings, semantic retrieval and context assembly do the work underneath. You never
              have to think about any of it.
            </p>
          </div>
          <MemoryObject />
        </Reveal>

        <Reveal className="band" id="everywhere">
          <p className="eyebrow">Everywhere</p>
          <h2 className="band-title">You stop being the connection between your own tools.</h2>
          <p className="band-body wide">
            Claude · ChatGPT · Gemini · Cursor · Gmail · GitHub · Notion · Slack — sources go in,
            context comes out, through an authenticated endpoint any tool can call.
          </p>
        </Reveal>

        <Reveal className="band" id="pricing">
          <p className="eyebrow">Pricing</p>
          <h2 className="band-title">Priced like a utility, because that is what it is.</h2>
          <div className="plans">
            {PLANS.map((p) => (
              <article className={`plan ${p.recommended ? 'is-rec' : ''}`} key={p.tier}>
                {p.recommended && <span className="plan-flag">Most chosen</span>}
                <h3>{p.name}</h3>
                <p className="plan-price">
                  {p.price}
                  <span>{p.period}</span>
                </p>
                <p className="plan-tag">{p.tagline}</p>
                <ul>
                  {p.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <a className="plan-cta" href={`${APP_URL}/subscription`}>
                  Choose {p.name}
                </a>
              </article>
            ))}
          </div>
        </Reveal>

        <Reveal className="finale">
          <h2>Now go and have a memory.</h2>
          <a className="cta" href={APP_URL}>
            Experience AXON
          </a>
          <p className="finale-note">Opens the app at app.axon-memory.com</p>
        </Reveal>
      </main>

      <footer className="foot">
        <span>AXON Memory</span>
        <span className="foot-links">
          <a href={`${APP_URL}/privacy`}>Privacy</a>
          <a href={`${APP_URL}/terms`}>Terms</a>
          <a href={`${APP_URL}/docs`}>Developers</a>
        </span>
      </footer>
    </>
  );
}
