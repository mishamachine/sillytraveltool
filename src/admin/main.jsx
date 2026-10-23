import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initApi } from './api'
import { applyTheme, getSavedTheme } from '../lib/theme'
import App from './App'
import './admin.css'

// The owner cockpit (docs/ADMIN_PLAN.md): its own page and bundle at /admin/, never part of the app build.
applyTheme(getSavedTheme())
initApi().then(() => {
  createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
})
