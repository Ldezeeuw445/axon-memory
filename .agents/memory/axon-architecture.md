---
name: AXON Architecture
description: How AXON is structured — frontend, backend, auth, DB, demo mode, and what credentials are needed
---

## Stack
- Frontend: React 19 + Vite on port 5000
- Backend: Express API on port 3001 (server/index.js)
- Both started together via `concurrently` in `npm run dev`
- Vite proxies `/api` → localhost:3001

## Auth & Database
- Supabase (supabase.com) — free tier sufficient
- `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` as Replit Secrets
- Schema: `supabase/schema.sql` — must be run manually in Supabase SQL Editor
- Tables: memory_nodes, memory_edges, ai_adapter_connections, data_sources, subscriptions
- All tables have RLS enabled; users only see their own data

## Demo mode
- When Supabase env vars are absent, `isSupabaseConfigured = false`
- AuthContext fakes a demo user; pages fall back to localStorage/mock data
- All pages show a SetupBanner nudging user to connect Supabase

## Payments
- Stripe: STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET as Replit Secrets
- Backend routes: POST /api/stripe/create-checkout-session, POST /api/stripe/webhook

## AI Adapters
- Users enter their own API keys (stored in Supabase ai_adapter_connections)
- Test-call proxy: POST /api/adapters/test — validates key server-side, never exposed to client
- Providers: openai, anthropic, gemini, perplexity, cursor

## Mobile (Capacitor)
- NOT yet implemented — requires replit.com browser environment (not iOS Replit app)
- appId: com.axon.memory

**Why:** Demo mode is critical — app must be usable and presentable without credentials so demos/investors can see it without setup.
