import { useEffect, useRef, useState } from 'react'
import Icon from '../../ui/icons/Icon'
import { api } from '../api'
import { Card, Badge, Loading, ErrorNote, useLoad, Modal, Field, Segmented, Stat, Sized, fmtDate, num } from '../ui'
import { plan } from '../../../supabase/functions/_shared/experimentMath.js'

// Experiments (docs/ADMIN_PLAN.md 7): design with Goose, queue in priority order, see what can run alongside the
// live test, record every result. Assigning people to versions is the next build step; until then "running" is the
// record of what's live.

const SURFACES = [['paywall', 'Paywall'], ['pricing', 'Pricing / checkout'], ['website', 'Website'], ['onboarding', 'Onboarding'],
  ['trip_planning', 'Trip planning'], ['explore', 'Explore (guides, HONK)'], ['email', 'Email'], ['other', 'Other']]
const SURFACE = Object.fromEntries(SURFACES)
const MAX_DAYS = 42
// What counts as a conversion: an app event after the person saw their version
const METRICS = [['purchase_completed', 'Bought First Class'], ['paywall_view', 'Opened the paywall'], ['trip_created', 'Created a trip'],
  ['booking_added', 'Added a booking'], ['import_saved', 'Imported bookings'], ['guide_viewed', 'Read a guide'], ['honk_used', 'Used HONK'],
  ['invite_accepted', 'Accepted an invite'], ['session_start', 'Came back (new session)']]

// Chance a version beats control: normal approximation of the two Beta posteriors (uniform prior)
function chanceToBeat(a, b) {
  if (!a.exposed || !b.exposed) return null
  const m = (x) => (x.converted + 1) / (x.exposed + 2)
  const v = (x) => m(x) * (1 - m(x)) / (x.exposed + 3)
  const z = (m(b) - m(a)) / Math.sqrt(v(a) + v(b))
  // Standard normal CDF (Abramowitz-Stegun)
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp(-z * z / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return z > 0 ? 1 - p : p
}

function Readout({ exp }) {
  const r = useLoad(() => api.experimentReadout(exp.id), [exp.id])
  if (!r.data) return <Loading label="Reading results…" />
  const rows = r.data.variants || []
  const control = rows[0]
  return (
    <div className="a-readout">
      <table className="a-table">
        <thead><tr><th>Version</th><th className="is-num">In test</th><th className="is-num">Saw it</th><th className="is-num">Converted</th><th className="is-num">Rate</th><th className="is-num">vs control</th><th className="is-num">Chance best</th></tr></thead>
        <tbody>
          {rows.map((v, i) => {
            const rate = v.exposed ? v.converted / v.exposed : null
            const base = control?.exposed ? control.converted / control.exposed : null
            const lift = i && rate != null && base ? (rate - base) / base : null
            const p = i ? chanceToBeat(control, v) : null
            return (
              <tr key={v.variant}>
                <td>{(exp.variants || []).find(x => x.key === v.variant)?.name || v.variant}</td>
                <td className="is-num">{num(v.assigned)}</td><td className="is-num">{num(v.exposed)}</td><td className="is-num">{num(v.converted)}</td>
                <td className="is-num">{rate == null ? '—' : `${(rate * 100).toFixed(1)}%`}</td>
                <td className="is-num">{lift == null ? '—' : `${lift > 0 ? '+' : ''}${Math.round(lift * 100)}%`}</td>
                <td className="is-num">{p == null ? '—' : <Badge tone={p > 0.95 ? 'ok' : p < 0.05 ? 'danger' : 'neutral'}>{Math.round(p * 100)}%</Badge>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="a-hint">Converted = {METRICS.find(m => m[0] === r.data.metric_event)?.[1] || r.data.metric_event || 'no metric event set'} after seeing their version. Owner and test accounts are left out.
        Above 95% "chance best" with the planned number of people is a result; before that it's noise.</p>
    </div>
  )
}
const ice = (e) => (e.ice_impact && e.ice_confidence && e.ice_ease ? Math.round(((e.ice_impact + e.ice_confidence + e.ice_ease) / 3) * 10) / 10 : null)
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const overlapAudience = (a, b) => !a || !b || /everyone|all/i.test(a) || /everyone|all/i.test(b) || norm(a) === norm(b)

/** How long a design takes with today's traffic */
export function numbersFor(e, traffic) {
  const daily = Number(traffic?.[e.surface] || 0)
  return { daily, ...plan({ baseline: Number(e.baseline_rate), mde: Number(e.min_effect), arms: (e.variants || []).length || 2, daily, share: Number(e.traffic_share || 1) }) }
}

/** Clashes with in-flight tests: blocked (same surface) or caution (same metric, overlapping audience) */
export function clashes(e, live) {
  return live.filter(l => l.id !== e.id).flatMap(l => {
    if (l.surface === e.surface) return [{ level: 'blocked', with: l.name, text: `Same surface (${SURFACE[e.surface]}) as "${l.name}". Wait, or split traffic between them.` }]
    if (norm(l.primary_metric) && norm(l.primary_metric) === norm(e.primary_metric) && overlapAudience(l.audience, e.audience)) {
      return [{ level: 'caution', with: l.name, text: `Both move "${e.primary_metric}" for overlapping people as "${l.name}". OK only if each person sees one test.` }]
    }
    return []
  })
}

export default function Experiments({ role }) {
  const data = useLoad(() => api.experiments(), [])
  const [designing, setDesigning] = useState(null)
  const [ending, setEnding] = useState(null)
  const isOwner = role === 'owner'
  const all = data.data?.experiments || []
  const traffic = data.data?.traffic || {}
  const live = all.filter(e => e.status === 'running' || e.status === 'paused')
  const queued = all.filter(e => e.status === 'queued').sort((a, b) => (a.queue_position || 0) - (b.queue_position || 0))
  const drafts = all.filter(e => e.status === 'draft')
  const archive = all.filter(e => e.status === 'done' || e.status === 'archived')

  const status = async (e, s) => { await api.experimentStatus(e.id, s); data.reload() }
  const move = async (i, dir) => {
    const ids = queued.map(e => e.id)
    const j = dir === 'top' ? 0 : i + dir
    if (j < 0 || j >= ids.length) return
    const [id] = ids.splice(i, 1)
    ids.splice(j, 0, id)
    await api.experimentReorder(ids); data.reload()
  }
  const byIce = async () => { await api.experimentReorder([...queued].sort((a, b) => (ice(b) || 0) - (ice(a) || 0)).map(e => e.id)); data.reload() }

  if (data.error) return <ErrorNote error={data.error} onRetry={data.reload} />
  if (!data.data) return <Loading />

  return (
    <div className="a-grid">
      <Card title="Live" icon="target" className="a-span-12" subtitle={live.length ? `${live.length} in flight` : 'nothing running'}
        actions={isOwner && <button className="a-btn a-btn--primary a-btn--sm" onClick={() => setDesigning({})}><Icon name="sparkles" size={16} /> Design an experiment</button>}>
        {!live.length ? (
          <p className="a-empty">No test running. {queued.length ? `Next up: "${queued[0].name}".` : 'Design one with Goose and queue it.'}</p>
        ) : (
          <div className="a-exp-list">
            {live.map(e => {
              const n = numbersFor(e, traffic)
              const ran = e.started_at ? Math.max(1, Math.round((Date.now() - new Date(e.started_at)) / 86400000)) : 0
              return (
                <div key={e.id} className="a-exp a-exp--live">
                  <div className="a-exp__main">
                    <div className="a-exp__title"><strong>{e.name}</strong><Badge tone={e.status === 'running' ? 'ok' : 'warn'}>{e.status}</Badge><Badge>{SURFACE[e.surface]}</Badge></div>
                    <p className="a-small">{e.hypothesis}</p>
                    <p className="a-small">Primary: {e.primary_metric || '—'} · Guardrail: {e.guardrail || '—'} · {e.audience}</p>
                    <div className="a-exp__bar"><Sized vars={{ '--fill': `${n.days ? Math.min(100, Math.round((ran / n.days) * 100)) : 0}%` }} /></div>
                    <p className="a-hint">Day {ran}{n.days ? ` of about ${n.days}` : ''} · started {fmtDate(e.started_at)} · key <code>{e.key}</code></p>
                    <Readout exp={e} />
                  </div>
                  {isOwner && <div className="a-exp__actions">
                    {e.status === 'running' ? <button className="a-btn a-btn--sm" onClick={() => status(e, 'paused')}>Pause</button> : <button className="a-btn a-btn--sm" onClick={() => status(e, 'running')}>Resume</button>}
                    <button className="a-btn a-btn--sm" onClick={() => setEnding(e)}>End and record</button>
                    <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => setDesigning(e)}>Open</button>
                  </div>}
                </div>
              )
            })}
          </div>
        )}
        <p className="a-hint">Starting a test gives it a key. Signed-in members get a fixed version for it (in the app: <code>useVariant('key')</code> from src/lib/experiments.js), counted once they actually see it.
          Each version's screen change is built in the app; the cockpit splits people, counts exposures and conversions, and reads out the result.</p>
      </Card>

      <Card title="Queue" icon="list" className="a-span-12" subtitle="runs top to bottom"
        actions={isOwner && queued.length > 1 && <button className="a-btn a-btn--ghost a-btn--sm" onClick={byIce}>Order by ICE score</button>}>
        {!queued.length ? <p className="a-empty">Nothing queued. Finish a design and press "Queue it".</p> : (
          <ol className="a-exp-list">
            {queued.map((e, i) => {
              const n = numbersFor(e, traffic)
              const c = clashes(e, live)
              const blocked = c.some(x => x.level === 'blocked')
              return (
                <li key={e.id} className="a-exp">
                  <span className="a-exp__pos">{i + 1}</span>
                  <div className="a-exp__main">
                    <div className="a-exp__title"><strong>{e.name}</strong><Badge>{SURFACE[e.surface]}</Badge>
                      {ice(e) != null && <Badge tone="accent">ICE {ice(e)}</Badge>}
                      {!live.length ? <Badge tone="ok">Ready to start</Badge> : blocked ? <Badge tone="danger">Waits for {c.find(x => x.level === 'blocked').with}</Badge>
                        : c.length ? <Badge tone="warn">Can run with care</Badge> : <Badge tone="ok">Can run alongside the live test</Badge>}
                    </div>
                    <p className="a-small">{e.hypothesis}</p>
                    <p className="a-hint">{n.days ? `About ${n.days} days at today's traffic (${num(n.total)} people)` : n.perArm ? `${num(n.total)} people needed; not enough traffic on ${SURFACE[e.surface]} yet to estimate days` : 'Add a baseline rate and the lift to detect to estimate the length'}{n.days > MAX_DAYS ? ' · longer than 6 weeks' : ''}</p>
                    {c.map(x => <p key={x.text} className={x.level === 'blocked' ? 'a-field__error' : 'a-hint'}>{x.text}</p>)}
                  </div>
                  {isOwner && <div className="a-exp__actions">
                    <button className="a-icon-btn a-icon-btn--sm" onClick={() => move(i, 'top')} disabled={i === 0} aria-label="Move to top" title="Move to top"><Icon name="arrow-up-right" size={16} /></button>
                    <button className="a-icon-btn a-icon-btn--sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><Icon name="chevron-up" size={16} /></button>
                    <button className="a-icon-btn a-icon-btn--sm" onClick={() => move(i, 1)} disabled={i === queued.length - 1} aria-label="Move down"><Icon name="chevron-down" size={16} /></button>
                    <button className="a-btn a-btn--sm" onClick={() => status(e, 'running')} disabled={blocked || !e.metric_event} title={blocked ? 'Clashes with a live test' : !e.metric_event ? 'Choose what counts as converted first' : undefined}>Start</button>
                    <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => setDesigning(e)}>Edit</button>
                  </div>}
                </li>
              )
            })}
          </ol>
        )}
      </Card>

      <Card title="Drafts" icon="edit" className="a-span-6">
        {!drafts.length ? <p className="a-empty">No drafts.</p> : (
          <ul className="a-exp-list">
            {drafts.map(e => (
              <li key={e.id} className="a-exp a-exp--compact" onClick={() => isOwner && setDesigning(e)}>
                <div className="a-exp__main"><strong>{e.name}</strong><span className="a-hint"> · {SURFACE[e.surface]} · updated {fmtDate(e.updated_at)}</span></div>
                <Icon name="chevron-right" size={16} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Archive" icon="book" className="a-span-6" subtitle={`${archive.length} finished`}>
        {!archive.length ? <p className="a-empty">Finished tests land here with the result, the decision and what you learned.</p> : (
          <ul className="a-exp-list">
            {archive.map(e => (
              <li key={e.id} className="a-exp a-exp--compact" onClick={() => setDesigning(e)}>
                <div className="a-exp__main">
                  <div className="a-exp__title"><strong>{e.name}</strong>{e.decision && <Badge tone={{ ship: 'ok', drop: 'danger', iterate: 'accent' }[e.decision] || 'neutral'}>{e.decision}</Badge>}</div>
                  {e.learnings && <p className="a-small">{e.learnings}</p>}
                  <span className="a-hint">{fmtDate(e.started_at)} – {fmtDate(e.ended_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {designing && <Designer exp={designing} traffic={traffic} live={live} readOnly={!isOwner || ['done', 'archived'].includes(designing.status)}
        onClose={() => setDesigning(null)} onSaved={() => data.reload()} />}
      {ending && <EndModal exp={ending} onClose={() => setEnding(null)} onDone={() => { setEnding(null); data.reload() }} />}
    </div>
  )
}

const EMPTY = { metric_event: '', name: '', hypothesis: '', surface: 'paywall', audience: 'everyone', primary_metric: '', guardrail: '', baseline_rate: '', min_effect: '',
  traffic_share: 1, variants: [{ key: 'control', name: 'Control (today)', weight: 50, description: '' }, { key: 'b', name: 'Variant B', weight: 50, description: '' }],
  ice_impact: '', ice_confidence: '', ice_ease: '' }

function Designer({ exp, traffic, live, readOnly, onClose, onSaved }) {
  const [d, setD] = useState({ ...EMPTY, ...exp, baseline_rate: exp.baseline_rate ?? '', min_effect: exp.min_effect ?? '' })
  const [chat, setChat] = useState(exp.design_chat || [])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [changed, setChanged] = useState([])
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const end = useRef(null)
  const set = (k) => (e) => setD(s => ({ ...s, [k]: e?.target ? e.target.value : e }))
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [chat.length, thinking])

  const ask = async (text) => {
    const messages = text ? [...chat, { role: 'owner', text }] : chat
    setChat(messages); setInput(''); setThinking(true); setError(null)
    try {
      const r = await api.experimentAI({ draft: clean(d), messages })
      setChat([...messages, { role: 'goose', text: r.reply }])
      if (r.draft && Object.keys(r.draft).length) { setD(s => ({ ...s, ...r.draft })); setChanged(Object.keys(r.draft)) }
    } catch (e) { setError(e.message) } finally { setThinking(false) }
  }
  // Goose opens a new design
  useEffect(() => { if (!readOnly && !chat.length) ask('') }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const n = numbersFor(d, traffic)
  const c = clashes(d, live)
  const save = async (queue) => {
    if (!d.name.trim()) { setError('Give it a name'); return }
    setSaving(true); setError(null)
    try {
      const id = await api.experimentSave({ ...clean(d), id: exp.id || null, design_chat: chat })
      if (queue && (!exp.status || exp.status === 'draft')) await api.experimentStatus(id, 'queued')
      onSaved(); onClose()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }
  const hl = (k) => (changed.includes(k) ? 'a-field--fresh' : '')

  return (
    <Modal wide title={exp.id ? d.name || 'Experiment' : 'Design an experiment'} onClose={onClose}
      footer={readOnly ? <button className="a-btn" onClick={onClose}>Close</button> : <>
        {exp.status === 'draft' && <button className="a-btn a-btn--ghost a-link--danger" onClick={async () => { await api.experimentDelete(exp.id); onSaved(); onClose() }}>Delete draft</button>}
        <button className="a-btn a-btn--ghost" onClick={onClose}>Cancel</button>
        <button className="a-btn" onClick={() => save(false)} disabled={saving}>Save</button>
        {(!exp.status || exp.status === 'draft') && <button className="a-btn a-btn--primary" onClick={() => save(true)} disabled={saving}>Queue it</button>}
      </>}>
      <div className="a-designer">
        <div className="a-chat">
          <div className="a-chat__log">
            {chat.map((m, i) => <div key={i} className={`a-chat__msg a-chat__msg--${m.role}`}>{m.text}</div>)}
            {thinking && <div className="a-chat__msg a-chat__msg--goose a-muted">Goose is thinking…</div>}
            <div ref={end} />
          </div>
          {!readOnly && (
            <form className="a-chat__input" onSubmit={e => { e.preventDefault(); if (input.trim()) ask(input.trim()) }}>
              <textarea rows={2} value={input} onChange={e => setInput(e.target.value)} placeholder="More people should upgrade after they hit the trip limit…"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (input.trim()) ask(input.trim()) } }} />
              <button className="a-btn a-btn--primary a-btn--sm" disabled={thinking || !input.trim()}>Send</button>
            </form>
          )}
          {error && <p className="a-field__error">{error}</p>}
          <p className="a-hint">Suggested by Goose (AI). Check the design; the numbers on the right are calculated, not guessed.</p>
        </div>

        <div className="a-form">
          <Field label="Name"><input className={hl('name')} value={d.name} onChange={set('name')} disabled={readOnly} /></Field>
          <Field label="Hypothesis" hint="If we … for …, then … will rise, because …"><textarea className={hl('hypothesis')} rows={3} value={d.hypothesis || ''} onChange={set('hypothesis')} disabled={readOnly} /></Field>
          <div className="a-form--2">
            <Field label="Where"><select className={hl('surface')} value={d.surface} onChange={set('surface')} disabled={readOnly}>{SURFACES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Who"><input className={hl('audience')} value={d.audience} onChange={set('audience')} disabled={readOnly} placeholder="free members who hit the trip limit" /></Field>
            <Field label="Primary metric"><input className={hl('primary_metric')} value={d.primary_metric || ''} onChange={set('primary_metric')} disabled={readOnly} placeholder="paywall → purchase rate" /></Field>
            <Field label="Counts as converted" hint="The app event measured after people see their version">
              <select className={hl('metric_event')} value={d.metric_event || ''} onChange={set('metric_event')} disabled={readOnly}>
                <option value="">Choose…</option>{METRICS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Guardrail"><input className={hl('guardrail')} value={d.guardrail || ''} onChange={set('guardrail')} disabled={readOnly} placeholder="refunds, 7-day retention" /></Field>
          </div>
          <Field label="Versions">
            <div className={`a-variants ${hl('variants')}`}>
              {(d.variants || []).map((v, i) => (
                <div key={i} className="a-variant">
                  <input value={v.name} disabled={readOnly} onChange={e => setD(s => ({ ...s, variants: s.variants.map((x, j) => j === i ? { ...x, name: e.target.value } : x) }))} />
                  <input value={v.description || ''} placeholder="What's different" disabled={readOnly} onChange={e => setD(s => ({ ...s, variants: s.variants.map((x, j) => j === i ? { ...x, description: e.target.value } : x) }))} />
                  <input type="number" min={1} max={99} value={v.weight} aria-label="Share %" disabled={readOnly} onChange={e => setD(s => ({ ...s, variants: s.variants.map((x, j) => j === i ? { ...x, weight: Number(e.target.value) } : x) }))} />
                </div>
              ))}
              {!readOnly && (d.variants || []).length < 4 && <button className="a-link" onClick={() => setD(s => ({ ...s, variants: [...s.variants, { key: `v${s.variants.length}`, name: `Variant ${String.fromCharCode(65 + s.variants.length)}`, weight: Math.round(100 / (s.variants.length + 1)), description: '' }] }))}>Add a version</button>}
            </div>
          </Field>
          <div className="a-form--2">
            <Field label="Today's rate (%)" hint="e.g. 5 = 5% of people do it now"><input className={hl('baseline_rate')} type="number" step="0.1" min="0.1" max="99" disabled={readOnly}
              value={d.baseline_rate === '' ? '' : Math.round(Number(d.baseline_rate) * 1000) / 10} onChange={e => setD(s => ({ ...s, baseline_rate: e.target.value === '' ? '' : Number(e.target.value) / 100 }))} /></Field>
            <Field label="Lift to detect (%)" hint="Smallest change worth knowing; bigger is faster"><input className={hl('min_effect')} type="number" step="5" min="5" max="500" disabled={readOnly}
              value={d.min_effect === '' ? '' : Math.round(Number(d.min_effect) * 100)} onChange={e => setD(s => ({ ...s, min_effect: e.target.value === '' ? '' : Number(e.target.value) / 100 }))} /></Field>
          </div>
          <Field label="Share of traffic in the test"><Segmented size="sm" options={[[0.25, '25%'], [0.5, '50%'], [1, '100%']]} value={Number(d.traffic_share)} onChange={v => !readOnly && setD(s => ({ ...s, traffic_share: v }))} /></Field>

          <div className={`a-impact ${n.days > MAX_DAYS || (!n.days && n.perArm) ? 'a-impact--warn' : ''}`}>
            <h3>Can it finish?</h3>
            <div className="a-stats">
              <Stat label="Per version" value={n.perArm ? num(n.perArm) : '—'} />
              <Stat label="People reaching it a day" value={n.daily ? (Math.round(n.daily * 10) / 10).toString() : '0'} hint={traffic[`${d.surface}_estimated`] ? 'estimated' : traffic[`${d.surface}_note`] || null} />
              <Stat label="Days" value={n.days ? num(n.days) : '—'} hint={n.days ? (n.days > MAX_DAYS ? 'over 6 weeks' : 'under 6 weeks') : null} />
            </div>
            <p className="a-hint">{n.days > MAX_DAYS ? 'Too long at today\'s traffic: make the change bigger, raise the lift to detect, use fewer versions or pick a busier surface.'
              : !n.perArm ? 'Add today\'s rate and the lift to detect.' : !n.days ? 'No measurable traffic on this surface yet. It can be queued; it starts making sense as members arrive.' : 'Finishes within 6 weeks.'}</p>
            {c.map(x => <p key={x.text} className={x.level === 'blocked' ? 'a-field__error' : 'a-hint'}>{x.text}</p>)}
            {!c.length && live.length > 0 && <p className="a-hint">No clash with the live test{live.length > 1 ? 's' : ''}: it can run at the same time.</p>}
          </div>

          <div className="a-form--3">
            <Field label="Impact (1-10)"><input className={hl('ice_impact')} type="number" min={1} max={10} value={d.ice_impact ?? ''} onChange={set('ice_impact')} disabled={readOnly} /></Field>
            <Field label="Confidence"><input className={hl('ice_confidence')} type="number" min={1} max={10} value={d.ice_confidence ?? ''} onChange={set('ice_confidence')} disabled={readOnly} /></Field>
            <Field label="Ease"><input className={hl('ice_ease')} type="number" min={1} max={10} value={d.ice_ease ?? ''} onChange={set('ice_ease')} disabled={readOnly} /></Field>
          </div>
          {['done', 'archived'].includes(exp.status) && (
            <div className="a-impact"><h3>Result: {exp.decision || '—'}</h3><p className="a-small">{exp.result}</p><p className="a-small"><strong>Learned:</strong> {exp.learnings}</p></div>
          )}
        </div>
      </div>
    </Modal>
  )
}

// Only the saved fields, with numbers as numbers
function clean(d) {
  const out = {}
  for (const k of ['name', 'hypothesis', 'surface', 'audience', 'primary_metric', 'guardrail', 'variants', 'traffic_share', 'metric_event']) out[k] = d[k]
  for (const k of ['baseline_rate', 'min_effect']) out[k] = d[k] === '' || d[k] == null ? null : Number(d[k])
  for (const k of ['ice_impact', 'ice_confidence', 'ice_ease']) out[k] = d[k] === '' || d[k] == null ? null : Math.max(1, Math.min(10, Math.round(Number(d[k]))))
  return out
}

function EndModal({ exp, onClose, onDone }) {
  const [decision, setDecision] = useState('ship')
  const [result, setResult] = useState('')
  const [learnings, setLearnings] = useState('')
  const [error, setError] = useState(null)
  const submit = async () => {
    if (!learnings.trim()) { setError('Write down what you learned; it is the point of the archive'); return }
    try {
      await api.experimentSave({ id: exp.id, decision, result, learnings })
      await api.experimentStatus(exp.id, 'done')
      onDone()
    } catch (e) { setError(e.message) }
  }
  return (
    <Modal title={`End "${exp.name}"`} onClose={onClose}
      footer={<><button className="a-btn a-btn--ghost" onClick={onClose}>Cancel</button><button className="a-btn a-btn--primary" onClick={submit}>End and archive</button></>}>
      <div className="a-form">
        <Field label="Decision"><Segmented options={[['ship', 'Ship it'], ['drop', 'Drop it'], ['iterate', 'Iterate'], ['inconclusive', 'Inconclusive']]} value={decision} onChange={setDecision} /></Field>
        <Field label="Result" hint="The numbers: people per version, rates, the primary metric and guardrail"><textarea rows={4} value={result} onChange={e => setResult(e.target.value)} /></Field>
        <Field label="What you learned" error={error}><textarea rows={3} value={learnings} onChange={e => { setLearnings(e.target.value); setError(null) }} /></Field>
      </div>
    </Modal>
  )
}
