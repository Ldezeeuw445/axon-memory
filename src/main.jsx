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
