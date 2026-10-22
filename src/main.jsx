import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { initSentry } from './lib/sentry'
import { initAnalytics } from './lib/analytics'
import { applyTheme, getSavedTheme } from './lib/theme'

initSentry()
initAnalytics()
applyTheme(getSavedTheme())

const root = createRoot(document.getElementById('root'))

// Dev-only component gallery: http://localhost:5173/?gallery
if (import.meta.env.DEV && new URLSearchParams(location.search).has('gallery')) {
  import('./dev/Gallery').then(({ default: Gallery }) => root.render(<StrictMode><Gallery /></StrictMode>))
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
