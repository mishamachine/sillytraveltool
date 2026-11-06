// "Add to Home Screen" prompt rules for the web app. Plain module so scripts/test-install-prompt.mjs can run it.
// The sheet shows on a member's 2nd and 3rd web visit, once each, then never again. A visit = one browser session.
// State lives in localStorage { visits, shown: [2, 3] }; every read and write is wrapped, so blocked storage means
// the prompt simply never shows.

export const KEY = 'stt_a2hs'
export const SHOW_ON_VISITS = [2, 3]

const read = (store) => {
  let raw
  try { raw = store.getItem(KEY) } catch { return null } // storage blocked
  try {
    const v = JSON.parse(raw || '{}')
    return { visits: Number.isInteger(v.visits) ? v.visits : 0, shown: Array.isArray(v.shown) ? v.shown : [], done: !!v.done }
  } catch { return { visits: 0, shown: [], done: false } } // corrupt: start over
}
const write = (store, s) => { try { store.setItem(KEY, JSON.stringify(s)); return true } catch { return false } }

/** Counts this session once (sessionStorage flag) and returns the visit number, or 0 if storage is unavailable. */
export function recordVisit(store, session) {
  try {
    const s = read(store)
    if (!s) return 0
    if (session.getItem(`${KEY}_counted`)) return s.visits
    s.visits += 1
    if (!write(store, s)) return 0
    session.setItem(`${KEY}_counted`, '1')
    return s.visits
  } catch { return 0 }
}

/** True when this visit is a prompt visit that has not been shown yet and the member has not installed. */
export function isDue(store, visit) {
  const s = read(store)
  return !!s && !s.done && SHOW_ON_VISITS.includes(visit) && !s.shown.includes(visit)
}

/** Record that the sheet was shown on this visit (so a reload or a dismiss never brings it back). */
export function markShown(store, visit) {
  const s = read(store)
  if (!s) return
  if (!s.shown.includes(visit)) s.shown.push(visit)
  write(store, s)
}

/** Installed from the sheet: never ask again. */
export function markDone(store) {
  const s = read(store)
  if (!s) return
  s.done = true
  write(store, s)
}

/** 'ios' = iOS/iPadOS Safari, where installing is a manual Share step; '' = anything else (Chrome offers its own event). */
export function guideKind({ ua = '', maxTouchPoints = 0 } = {}) {
  const iosDevice = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)
  if (!iosDevice) return ''
  return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua) || !/Safari/.test(ua) ? '' : 'ios'
}

/** Whether the sheet may appear at all: web only, not already installed. */
export const eligible = ({ native, standalone }) => !native && !standalone
