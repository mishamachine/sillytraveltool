// App Store review status / cancel, through the App Store Connect API (run by .github/workflows/ios-review.yml).
// Usage: node scripts/asc-review.mjs status|cancel
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (PEM text). Prints ids and states only, never the key.
import crypto from 'node:crypto'

const APP_ID = '6826753531'
const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 } = process.env
const action = process.argv[2] || 'status'
if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_KEY_P8) { console.error('missing ASC env'); process.exit(2) }

const b64url = (b) => Buffer.from(b).toString('base64url')
function token() {
  const now = Math.floor(Date.now() / 1000)
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' }))
  const body = b64url(JSON.stringify({ iss: ASC_ISSUER_ID, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' }))
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: ASC_KEY_P8, dsaEncoding: 'ieee-p1363' })
  return `${head}.${body}.${b64url(sig)}`
}
async function api(method, path, body) {
  const r = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method, headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(j.errors?.map(e => e.detail || e.title) || j)}`)
  return j
}

const versions = await api('GET', `/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&limit=5&fields[appStoreVersions]=versionString,appStoreState`)
for (const v of versions.data) console.log('version', v.attributes.versionString, v.attributes.appStoreState)
const subs = await api('GET', `/v1/reviewSubmissions?filter[app]=${APP_ID}&filter[platform]=IOS&limit=10`)
const open = subs.data.filter(s => ['WAITING_FOR_REVIEW', 'IN_REVIEW', 'UNRESOLVED_ISSUES', 'READY_FOR_REVIEW'].includes(s.attributes.state))
for (const s of subs.data) console.log('submission', s.id, s.attributes.state, s.attributes.submittedDate || '')

if (action === 'cancel') {
  if (!open.length) { console.log('nothing to cancel'); process.exit(0) }
  for (const s of open) {
    await api('PATCH', `/v1/reviewSubmissions/${s.id}`, { data: { type: 'reviewSubmissions', id: s.id, attributes: { canceled: true } } })
    console.log('canceled', s.id)
  }
}
