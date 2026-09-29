import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// App.css holds the layout and component classes the pages actually use
// (.fullscreen-page, .glass-card, .btn-primary, .page-title, the sidebar and
// mobile shell). Nothing imported it, so all 516 lines were absent from the
// bundle and every one of those classes silently did nothing — which is why
// the login card sat flush left instead of centred.
import './App.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// ── Service worker ────────────────────────────────────────────────────────
//
// Registered AFTER load so it never competes with the first paint for
// bandwidth — on a phone that trade is the difference between the app
// appearing and the app appearing to hang.
//
// Only in production: in dev the worker would serve a cached shell over the
// Vite dev server and you would spend an afternoon wondering why edits do
// nothing.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      // A worker that will not register is not a reason to break the app —
      // it only ever added offline resilience on top of a working page.
      console.warn('[axon] service worker registration failed:', err)
    })
  })
}
