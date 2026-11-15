// "Add to home screen" UI (web only; rules and wording in src/lib/installPrompt.js):
//  - InstallPopup: the occasional pop-up, mounted once in App.jsx (replaces the old 30 s Android toast)
//  - InstallSheet: the same sheet, opened from Settings and Help
//  - InstallBody / useInstallFlow: the onboarding step reuses them
import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { track } from '../../lib/analytics'
import { Sheet, Button, Stack, Text, Icon } from '../../ui'
import {
  INSTALL_COPY as C, EVENTS, readEnv, surfaceAvailable, installMethod, stepsText, readState, markShown, markDismissed, markDone,
  evaluate, getDeferred, clearDeferred, subscribe, captureInstallEvents,
} from '../../lib/installPrompt'

const envNow = () => readEnv({ capacitor: Capacitor })
const store = () => { try { return window.localStorage } catch { return null } }
const stateNow = () => { const s = store(); return s ? readState(s) : { ok: false, last_shown: null, dismissals: 0, done: false } }

// Listen from the first load, so an early browser offer is not missed. Not in the store apps.
if (typeof window !== 'undefined' && !envNow().native) {
  captureInstallEvents(window, () => {
    const s = store(); if (s) markDone(s)
    track(EVENTS.accepted)
  })
}

/** True where the website may offer "Add to home screen" (not in the store apps, not when installed). Re-renders on changes. */
export function useInstallAvailable() {
  const [, setTick] = useState(0)
  useEffect(() => subscribe(() => setTick(t => t + 1)), [])
  return surfaceAvailable(envNow(), stateNow())
}

/** What "Add" does and its result. view: 'ask' (the offer) or 'steps' (the wording to follow). */
export function useInstallFlow() {
  const [, setTick] = useState(0)
  useEffect(() => subscribe(() => setTick(t => t + 1)), [])
  const [view, setView] = useState('ask')
  const method = installMethod(envNow(), !!getDeferred())
  // Returns true when the browser's own prompt took over (the caller can close)
  const add = async () => {
    if (method === 'prompt') {
      const d = getDeferred()
      try { await d.prompt(); await d.userChoice } catch { /* declined or unavailable */ }
      clearDeferred() // appinstalled reports the install
      return true
    }
    // iOS: opening the steps is the closest signal there is
    if (method !== 'menu') track(EVENTS.accepted)
    setView('steps')
    return false
  }
  return { method, view, add }
}

/** Title, benefit line and, once "Add" is tapped without a browser prompt, the steps. */
export function InstallBody({ view, method, titleId, titleTag = 'h1', hideTitle = false }) {
  return (
    <Stack gap={3}>
      {!hideTitle && <Text variant="h1" as={titleTag} id={titleId}>{C.title}</Text>}
      {view === 'steps'
        ? (
          <Text variant="body-lg" as="p" className="install-steps">
            {method === 'ios-safari'
              ? <>Tap Share <Icon name="share" size={18} className="install-steps__icon" label="Share" />, then Add to Home Screen.</>
              : stepsText(method)}
          </Text>
        )
        : <Text variant="body-lg" tone="secondary" as="p">{C.body}</Text>}
    </Stack>
  )
}

/** The sheet itself. popup: shown by the app on its own (counts dismissals, fires events). */
export function InstallSheet({ onClose, popup = false }) {
  const { method, view, add } = useInstallFlow()
  const dismiss = () => {
    if (popup) { const s = store(); if (s) markDismissed(s); track(EVENTS.dismissed) }
    onClose()
  }
  const footer = view === 'steps'
    ? <Button variant="outline" size="lg" block onClick={onClose}>{C.gotIt}</Button>
    : (
      <Stack gap={3} grow>
        <Button variant="outline" size="lg" block onClick={async () => { if (await add()) onClose() }}>{C.add}</Button>
        <Button variant="outline" size="lg" block onClick={dismiss}>{C.notNow}</Button>
      </Stack>
    )
  return (
    <Sheet title={C.title} onClose={dismiss} footer={footer}>
      <InstallBody view={view} method={method} hideTitle />
    </Sheet>
  )
}

// True while the member is in the middle of something: a sheet or dialog is open, a field has focus, or a form,
// the tour or a paywall is up. The pop-up waits.
export function isBusyNow(flags = {}) {
  if (Object.values(flags).some(Boolean)) return true
  try {
    if (document.querySelector('.c-sheet-layer, [role="dialog"], [role="alertdialog"]')) return true
    const a = document.activeElement
    if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return true
  } catch { /* ignore */ }
  return false
}

let shownThisVisit = false
const FIRST_CHECK_MS = 30000
const RECHECK_MS = 10000

/** Mounted once. busyFlags: app state that means "mid-task" (open forms, tour, first-run flow). */
export function InstallPopup({ signedIn, busyFlags }) {
  const [open, setOpen] = useState(false)
  const busy = isBusyNow.bind(null, busyFlags)
  useEffect(() => {
    if (!signedIn) return
    let timer
    const check = () => {
      const s = store()
      if (!s) return
      const state = readState(s)
      const verdict = evaluate({ state, now: Date.now(), env: envNow(), signedIn, busy: busy(), shownThisVisit })
      if (verdict === 'show') {
        shownThisVisit = true
        markShown(s, Date.now())
        track(EVENTS.shown)
        setOpen(true)
        return
      }
      if (verdict === 'first_visit') markShown(s, Date.now()) // start the 14-day clock; first showing is later
      if (verdict === 'busy') timer = setTimeout(check, RECHECK_MS) // try again once the task is done
    }
    timer = setTimeout(check, FIRST_CHECK_MS)
    return () => clearTimeout(timer)
  }, [signedIn, ...Object.values(busyFlags || {})])
  return open ? <InstallSheet popup onClose={() => setOpen(false)} /> : null
}
