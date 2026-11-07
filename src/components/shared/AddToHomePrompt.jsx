import { useEffect, useRef, useState } from 'react'
import { Sheet, Button, Text } from '../../ui'
import StoreBadges from './StoreBadges'
import { useStoreLinks } from '../../lib/useStoreLinks'
import { isNative } from '../../lib/authRedirect'
import { track, analyticsEnabled } from '../../lib/analytics'
import { isConsentRegion } from '../../lib/consent'
import { recordVisit, isDue, markShown, markDone, guideKind, eligible } from '../../lib/installPrompt'
import './storeBadges.css'

// "Add to Home Screen" sheet for the web app, on a signed-in member's 2nd and 3rd visit (see lib/installPrompt.js).
// Chrome/Edge/Android: we hold the browser's install event and offer an Install button.
// iPhone/iPad Safari: no install event exists, so a short Share steps guide.
// Never in the native app or when already running as an installed app.

const stores = () => { try { return { local: window.localStorage, session: window.sessionStorage } } catch { return null } }
const standalone = () => {
  try { return !!window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true } catch { return false }
}

export default function AddToHomePrompt({ signedIn, hold }) {
  const [visit] = useState(() => {
    const s = stores()
    // EU/EEA/UK/CH: the visit counter is device storage nobody asked for, so it is kept only once they opt in to usage stats
    const allowed = !isConsentRegion() || analyticsEnabled()
    return s && allowed && eligible({ native: isNative, standalone: standalone() }) ? recordVisit(s.local, s.session) : 0
  })
  const [event, setEvent] = useState(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const shown = useRef(false)
  const links = useStoreLinks()
  const ios = guideKind({ ua: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints }) === 'ios'
  const android = /Android/.test(navigator.userAgent)
  const kind = ios ? 'ios' : android ? 'android' : 'desktop'

  useEffect(() => {
    if (!visit) return undefined
    const onPrompt = (e) => { e.preventDefault(); setEvent(e) } // hold it until the sheet asks
    const onInstalled = () => {
      const s = stores()
      if (s) markDone(s.local)
      track('app_installed', { kind, visit })
      setOpen(false)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [visit])

  useEffect(() => {
    if (!visit || !signedIn || hold || shown.current || !(event || ios)) return
    const s = stores()
    if (!s || !isDue(s.local, visit)) return
    shown.current = true
    markShown(s.local, visit)
    track('prompt_shown', { prompt: 'add_to_home', kind, visit })
    setOpen(true)
  }, [visit, signedIn, hold, event, ios])

  const dismiss = (how) => {
    setOpen(false)
    track('prompt_dismissed', { prompt: 'add_to_home', kind, visit, how })
  }

  const install = async () => {
    if (!event) return
    setBusy(true)
    try {
      event.prompt()
      const { outcome } = await event.userChoice
      setEvent(null)
      setOpen(false)
      if (outcome === 'accepted') track('prompt_accepted', { prompt: 'add_to_home', kind, visit })
      else track('prompt_dismissed', { prompt: 'add_to_home', kind, visit, how: 'browser' })
    } catch { setOpen(false) } finally { setBusy(false) }
  }

  if (!open) return null
  const only = ios ? 'ios' : android ? 'android' : 'none'
  return (
    <Sheet title="Add Silly Travel Tool to your home screen" subtitle="One tap from your home screen, full screen, like an app." onClose={() => dismiss('close')}
      footer={ios
        ? <Button variant="primary" block onClick={() => dismiss('got_it')}>Got it</Button>
        : <><Button variant="primary" block loading={busy} onClick={install}>Install</Button><Button variant="ghost" block onClick={() => dismiss('not_now')}>Not now</Button></>}>
      {ios && (
        <ol className="a2hs__steps t-body">
          <li>Tap the <strong>Share</strong> button in Safari’s toolbar.</li>
          <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
          <li>Tap <strong>Add</strong>. Goose is on your home screen.</li>
        </ol>
      )}
      {links && only !== 'none' && (
        <div className="a2hs__links">
          <Text variant="caption" as="p" className="a2hs__links-title">Prefer the app?</Text>
          <StoreBadges links={links} only={only} onOpen={(store) => track('store_link_click', { store, surface: 'install_sheet' })} />
        </div>
      )}
    </Sheet>
  )
}
