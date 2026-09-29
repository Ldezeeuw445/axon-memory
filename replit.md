# AXON — Universal AI Memory Layer

**Tagline:** The Stripe for AI Memory

## Stack
- React 19 + Vite 8
- react-router-dom 7
- lucide-react (icons)
- oxlint (linting)

## How to run
```
npm run dev
```
Runs on port 5000. The workflow "Start application" is configured and auto-starts.

## Project structure
```
src/
  pages/
    Splash.jsx          — Landing / entry screen
    Onboarding.jsx      — User onboarding flow
    Dashboard.jsx       — Main dashboard (mock data)
    MemoryGraph.jsx     — Visual memory graph (mock data)
    AIAdapters.jsx      — AI provider connection management
    DataSources.jsx     — Data source management
    Subscription.jsx    — Subscription / billing page
    BusinessDocs.jsx    — Business documentation page
  App.jsx               — Router + sidebar layout
  App.css / index.css   — Global styles
```

## Current state
Pure frontend UI mockup — no backend, no auth, no database, no real AI integrations.
All data is static/mocked.

## Planned roadmap
1. **Phase 1** — Supabase backend (auth, DB, RLS, live queries)
2. **Phase 2** — Real AI adapter endpoints (OpenAI, Anthropic, Gemini, Cursor, Perplexity)
3. **Phase 3** — Stripe + RevenueCat subscriptions
4. **Phase 4** — Capacitor mobile wrapper (iOS + Android)
5. **Phase 5** — App Store / Play Store readiness

## User preferences
- Keep existing file structure and stack
- Mobile target: iOS App Store + Google Play (via Capacitor)
- App ID: com.axon.memory
