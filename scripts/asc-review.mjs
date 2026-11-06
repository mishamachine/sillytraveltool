// App Store review tools, through the App Store Connect API (run by .github/workflows/ios-review.yml).
// Usage: node scripts/asc-review.mjs status|cancel|listing|prepare|screenshots|submit
//   status       versions and review submissions
//   cancel       cancel the open review submission
//   listing      read-only: the editable version, en-US listing text, subtitle, screenshot sets, recent builds
//   prepare      set version string and release type, update What's New, wait for the build, attach it
//   screenshots  replace the iPhone 6.9" and iPad 13" screenshots from <folder>/iphone and <folder>/ipad
//   submit       create the review submission, add the version, submit it
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (PEM text). Inputs come in as INPUT_VERSION, INPUT_BUILD,
// INPUT_WHATS_NEW, INPUT_FOLDER. Prints ids and states only, never the key.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

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
  const j = await r.json().catch(() => ({})) // DELETE answers 204 with no body
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(j.errors?.map(e => e.detail || e.title) || j)}`)
  return j
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const EDITABLE = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY', 'WAITING_FOR_REVIEW']
const input = (name, fallback = '') => (process.env[`INPUT_${name}`] ?? '').trim() || fallback
const must = (cond, msg) => { if (!cond) { console.error(msg); process.exit(1) } }

async function status() {
  const versions = await api('GET', `/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&limit=5&fields[appStoreVersions]=versionString,appStoreState`)
  for (const v of versions.data) console.log('version', v.attributes.versionString, v.attributes.appStoreState)
  const subs = await api('GET', `/v1/reviewSubmissions?filter[app]=${APP_ID}&filter[platform]=IOS&limit=10`)
  const open = subs.data.filter(s => ['WAITING_FOR_REVIEW', 'IN_REVIEW', 'UNRESOLVED_ISSUES', 'READY_FOR_REVIEW'].includes(s.attributes.state))
  for (const s of subs.data) console.log('submission', s.id, s.attributes.state, s.attributes.submittedDate || '')
  return open
}

async function cancel() {
  const open = await status()
  if (!open.length) { console.log('nothing to cancel'); return }
  for (const s of open) {
    await api('PATCH', `/v1/reviewSubmissions/${s.id}`, { data: { type: 'reviewSubmissions', id: s.id, attributes: { canceled: true } } })
    console.log('canceled', s.id)
  }
}

/** The iOS version that can still be edited (newest first), or exits. */
async function editableVersion() {
  const r = await api('GET', `/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&limit=10`)
  const v = r.data.find(x => EDITABLE.includes(x.attributes.appStoreState))
  must(v, `no editable iOS version (states: ${r.data.map(x => `${x.attributes.versionString} ${x.attributes.appStoreState}`).join(', ') || 'none'})`)
  return v
}

async function enUS(versionId) {
  const r = await api('GET', `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=50`)
  const loc = r.data.find(l => l.attributes.locale === 'en-US')
  must(loc, `no en-US localization (locales: ${r.data.map(l => l.attributes.locale).join(', ')})`)
  return loc
}

async function listing() {
  const v = await editableVersion()
  console.log('version', v.id, v.attributes.versionString, v.attributes.appStoreState, 'releaseType', v.attributes.releaseType)
  const loc = await enUS(v.id)
  const a = loc.attributes
  console.log('localization', loc.id, a.locale)
  for (const k of ['description', 'promotionalText', 'keywords', 'whatsNew', 'marketingUrl', 'supportUrl']) console.log(`--- ${k}\n${a[k] ?? '(unset)'}`)
  const infos = await api('GET', `/v1/apps/${APP_ID}/appInfos`)
  for (const info of infos.data) {
    const ls = await api('GET', `/v1/appInfos/${info.id}/appInfoLocalizations?limit=50`)
    const en = ls.data.find(l => l.attributes.locale === 'en-US')
    console.log('appInfo', info.id, info.attributes.appStoreState || '', 'subtitle:', en ? en.attributes.subtitle ?? '(unset)' : '(no en-US)')
  }
  const sets = await api('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?limit=50`)
  if (!sets.data.length) console.log('screenshot sets: none')
  for (const set of sets.data) {
    const shots = await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`)
    console.log('screenshot set', set.id, set.attributes.screenshotDisplayType, 'count', shots.data.length,
      shots.data.map(x => x.attributes.assetDeliveryState?.state).join(','))
  }
  const builds = await api('GET', `/v1/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=8&include=preReleaseVersion`)
  const pre = Object.fromEntries((builds.included || []).map(i => [i.id, i.attributes.version]))
  for (const b of builds.data) {
    console.log('build', b.id, pre[b.relationships?.preReleaseVersion?.data?.id] || '?', `(${b.attributes.version})`, b.attributes.processingState,
      'encryption', b.attributes.usesNonExemptEncryption ?? 'unset', b.attributes.expired ? 'expired' : '')
  }
}

async function prepare() {
  const version = input('VERSION', '0.20.2'), build = input('BUILD', '10'), whatsNew = process.env.INPUT_WHATS_NEW || ''
  const v = await editableVersion()
  await api('PATCH', `/v1/appStoreVersions/${v.id}`, { data: { type: 'appStoreVersions', id: v.id, attributes: { versionString: version, releaseType: 'AFTER_APPROVAL' } } })
  console.log('version set', v.id, version, 'releaseType AFTER_APPROVAL')
  // Copy can also come from files in the repo (folder input): description.txt and whats_new.txt, so long multi-line text
  // doesn't have to pass through a workflow input. A file wins over the whats_new input.
  const dir = input('FOLDER')
  const fromFile = (name) => { try { return dir ? fs.readFileSync(path.join(dir, name), 'utf8').trim() : '' } catch { return '' } }
  const attrs = {}
  const wn = fromFile('whats_new.txt') || whatsNew.trim()
  if (wn) attrs.whatsNew = wn
  const desc = fromFile('description.txt')
  if (desc) attrs.description = desc
  if (Object.keys(attrs).length) {
    const loc = await enUS(v.id)
    await api('PATCH', `/v1/appStoreVersionLocalizations/${loc.id}`, { data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes: attrs } })
    console.log('localization updated', loc.id, Object.entries(attrs).map(([k, t]) => `${k} ${t.length} chars`).join(', '))
  } else console.log('no copy given; left as is')

  const q = `/v1/builds?filter[app]=${APP_ID}&filter[version]=${encodeURIComponent(build)}&filter[preReleaseVersion.version]=${encodeURIComponent(version)}&limit=5`
  const deadline = Date.now() + 20 * 60 * 1000
  let b = null
  for (;;) {
    b = (await api('GET', q)).data[0]
    console.log('build', b ? `${b.id} ${b.attributes.processingState}` : 'not found yet')
    if (b?.attributes.processingState === 'VALID') break
    must(!b || !['FAILED', 'INVALID'].includes(b.attributes.processingState), `build ${b?.id} is ${b?.attributes.processingState}`)
    must(Date.now() < deadline, 'build did not reach VALID within 20 minutes')
    await sleep(30000)
  }
  if (b.attributes.usesNonExemptEncryption == null) {
    await api('PATCH', `/v1/builds/${b.id}`, { data: { type: 'builds', id: b.id, attributes: { usesNonExemptEncryption: false } } })
    console.log('usesNonExemptEncryption set to false')
  } else console.log('usesNonExemptEncryption already', b.attributes.usesNonExemptEncryption)
  await api('PATCH', `/v1/appStoreVersions/${v.id}/relationships/build`, { data: { type: 'builds', id: b.id } })
  console.log('build attached', b.id, 'to version', v.id)
}

// Display types Apple accepts for each device class, newest first. The first one the API takes is used.
const DISPLAY_TYPES = { iphone: ['APP_IPHONE_69', 'APP_IPHONE_67'], ipad: ['APP_IPAD_PRO_3GEN_129', 'APP_IPAD_PRO_129'] }

async function screenshotSet(locId, kind) {
  const sets = (await api('GET', `/v1/appStoreVersionLocalizations/${locId}/appScreenshotSets?limit=50`)).data
  const have = sets.find(s => DISPLAY_TYPES[kind].includes(s.attributes.screenshotDisplayType))
  if (have) return have
  for (const type of DISPLAY_TYPES[kind]) {
    try {
      const r = await api('POST', '/v1/appScreenshotSets', { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: type },
        relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: locId } } } } })
      return r.data
    } catch (e) { console.log(`display type ${type} refused: ${String(e.message).slice(0, 160)}`) }
  }
  must(false, `no ${kind} display type accepted`)
}

async function uploadScreenshot(setId, file) {
  const bytes = fs.readFileSync(file), fileName = path.basename(file)
  const r = await api('POST', '/v1/appScreenshots', { data: { type: 'appScreenshots', attributes: { fileName, fileSize: bytes.length },
    relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } } } } })
  const id = r.data.id
  for (const op of r.data.attributes.uploadOperations || []) {
    const headers = Object.fromEntries((op.requestHeaders || []).map(h => [h.name, h.value]))
    const res = await fetch(op.url, { method: op.method, headers, body: bytes.subarray(op.offset, op.offset + op.length) })
    must(res.ok, `upload part of ${fileName} failed: ${res.status}`)
  }
  await api('PATCH', `/v1/appScreenshots/${id}`, { data: { type: 'appScreenshots', id, attributes: { uploaded: true, sourceFileChecksum: crypto.createHash('md5').update(bytes).digest('hex') } } })
  for (let i = 0; i < 60; i++) {
    const s = (await api('GET', `/v1/appScreenshots/${id}`)).data.attributes.assetDeliveryState
    if (s?.state === 'COMPLETE') { console.log('screenshot', id, fileName, 'COMPLETE'); return }
    must(s?.state !== 'FAILED', `screenshot ${fileName} failed: ${JSON.stringify(s?.errors || [])}`)
    await sleep(5000)
  }
  must(false, `screenshot ${fileName} not COMPLETE after 5 minutes`)
}

async function screenshots() {
  const folder = input('FOLDER')
  must(folder, 'folder input is empty')
  const root = path.resolve(folder)
  must(root === process.cwd() || root.startsWith(process.cwd() + path.sep), 'folder must be inside the repo')
  const v = await editableVersion()
  const loc = await enUS(v.id)
  for (const kind of ['iphone', 'ipad']) {
    const dir = path.join(root, kind)
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(n => n.toLowerCase().endsWith('.png')).sort() : []
    must(files.length, `no PNGs in ${path.relative(process.cwd(), dir)}`)
    const set = await screenshotSet(loc.id, kind)
    console.log(kind, 'set', set.id, set.attributes.screenshotDisplayType)
    const old = await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`)
    for (const o of old.data) { await api('DELETE', `/v1/appScreenshots/${o.id}`); console.log('deleted', o.id) }
    for (const f of files) await uploadScreenshot(set.id, path.join(dir, f))
  }
}

async function submit() {
  const v = await editableVersion()
  const existing = (await api('GET', `/v1/reviewSubmissions?filter[app]=${APP_ID}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW&limit=5`)).data[0]
  const sub = existing || (await api('POST', '/v1/reviewSubmissions', { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' },
    relationships: { app: { data: { type: 'apps', id: APP_ID } } } } })).data
  console.log(existing ? 'reusing submission' : 'created submission', sub.id)
  const items = (await api('GET', `/v1/reviewSubmissions/${sub.id}/items?limit=20`)).data
  if (items.length) console.log('items already on submission:', items.length)
  else {
    const it = await api('POST', '/v1/reviewSubmissionItems', { data: { type: 'reviewSubmissionItems', relationships: {
      reviewSubmission: { data: { type: 'reviewSubmissions', id: sub.id } }, appStoreVersion: { data: { type: 'appStoreVersions', id: v.id } } } } })
    console.log('item added', it.data.id, 'version', v.attributes.versionString)
  }
  const done = await api('PATCH', `/v1/reviewSubmissions/${sub.id}`, { data: { type: 'reviewSubmissions', id: sub.id, attributes: { submitted: true } } })
  console.log('submitted', sub.id, 'state', done.data.attributes.state)
}

const actions = { status, cancel, listing, prepare, screenshots, submit }
must(actions[action], `unknown action "${action}" (${Object.keys(actions).join('|')})`)
await actions[action]()
