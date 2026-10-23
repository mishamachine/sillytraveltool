import { useEffect, useState } from 'react'
import Icon from '../../ui/icons/Icon'
import { api } from '../api'
import { Badge, Loading, ErrorNote, useLoad, Modal, Field, Segmented, Table, download, ago, fmtDate, num, minutes,
  STAGE_LABEL, STATUS_LABEL, PLAN_LABEL, FARE_LABEL, statusTone, stageTone } from '../ui'

// One member, as a support desk sees them: who, what they do, their plan, their status, your notes.
// Every change goes through an admin_* function that checks the role and writes the audit log.

const GRANT_REASONS = [
  ['goodwill', 'Support goodwill'], ['bug', 'Bug compensation'], ['partner', 'Partner'], ['influencer', 'Influencer'],
  ['press', 'Press'], ['beta', 'Beta tester'], ['correction', 'Correction'], ['other', 'Other'],
]
const MOD_REASONS = [
  ['spam', 'Spam or automation'], ['ai_abuse', 'AI abuse'], ['fraud', 'Fraud or chargeback'], ['harassment', 'Harassment through invites'],
  ['scraping', 'Scraping'], ['terms', 'Terms violation'], ['member_request', 'At member\'s request'], ['other', 'Other'],
]
const LEVELS = [
  ['warning', 'Warning', 'Recorded, with a message for the member. Nothing is switched off.'],
  ['restricted', 'Restricted', 'AI features, email import and invites stop working. Their trips stay readable.'],
  ['suspended', 'Suspended', 'Can\'t sign in until the date you pick. Signed out everywhere now. Lifts by itself.'],
  ['banned', 'Banned', 'Can\'t sign in, signed out now, and the same email can\'t sign up again. Owner only.'],
]
const MESSAGES = {
  warning: 'Hi, we noticed activity on your Silly Travel Tool account that goes against our Terms. Please keep use to your own trips. If you think this is a mistake, reply to this email.',
  restricted: 'Hi, some features on your Silly Travel Tool account (AI, email import, invites) are paused while we look into unusual activity. Your trips are safe and still readable. Reply to this email if you think this is a mistake.',
  suspended: 'Hi, your Silly Travel Tool account is suspended until {date} because of activity that goes against our Terms. Your trips are kept. Reply to this email if you think this is a mistake.',
  banned: 'Hi, your Silly Travel Tool account has been closed for breaking our Terms. You can ask for a copy of your data by replying to this email.',
}
const SECTIONS = [['overview', 'Overview'], ['membership', 'Membership'], ['status', 'Account status'], ['notes', 'Notes'], ['activity', 'Activity']]

export default function MemberPanel({ id, role, onClose, onChanged }) {
  const m = useLoad(() => api.member(id), [id])
  const [section, setSection] = useState('overview')
  const changed = () => { m.reload(); onChanged?.() }
  const canAct = role !== 'analyst'

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !document.querySelector('.a-modal') && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const d = m.data
  return (
    <div className="a-scrim a-scrim--side" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="a-panel" role="dialog" aria-label="Member">
        <header className="a-panel__head">
          {d ? (
            <div className="a-panel__who">
              <div className="a-avatar">{(d.name || d.email || '?').slice(0, 1).toUpperCase()}</div>
              <div>
                <h2>{d.name || d.email}</h2>
                <p className="a-muted">{d.email} · joined {fmtDate(d.joined)} · seen {ago(d.last_seen)}</p>
                <div className="a-badges">
                  <Badge tone={stageTone(d.stage)}>{STAGE_LABEL[d.stage]}</Badge>
                  <Badge tone={d.plan === 'first_class' ? 'accent' : 'neutral'}>{PLAN_LABEL[d.plan]}</Badge>
                  {d.status !== 'active' && <Badge tone={statusTone(d.status)}>{STATUS_LABEL[d.status]}</Badge>}
                  {d.internal && <Badge>Internal</Badge>}
                  {d.is_admin && <Badge tone="info">Admin</Badge>}
                </div>
              </div>
            </div>
          ) : <span />}
          <button className="a-icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={20} /></button>
        </header>
        {d && <Segmented options={SECTIONS} value={section} onChange={setSection} />}
        <div className="a-panel__body">
          <ErrorNote error={m.error} onRetry={m.reload} />
          {!d ? <Loading label="Opening the file…" /> : (
            <>
              {section === 'overview' && <Overview d={d} canAct={canAct} role={role} changed={changed} />}
              {section === 'membership' && <Membership d={d} canAct={canAct} changed={changed} />}
              {section === 'status' && <Status d={d} canAct={canAct} role={role} changed={changed} />}
              {section === 'notes' && <Notes d={d} canAct={canAct} changed={changed} />}
              {section === 'activity' && <Activity d={d} />}
            </>
          )}
        </div>
      </aside>
    </div>
  )
}

function Facts({ rows }) {
  return <dl className="a-facts">{rows.filter(Boolean).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v ?? '—'}</dd></div>)}</dl>
}

function Overview({ d, canAct, role, changed }) {
  const [tags, setTags] = useState(d.tags.join(', '))
  const [saving, setSaving] = useState(false)
  const fares = Object.entries(d.fares || {})
  const ins = useLoad(() => api.memberInsights(d.id), [d.id]).data
  const saveTags = async () => {
    setSaving(true)
    try { await api.setTags(d.id, tags.split(',').map(t => t.trim()).filter(Boolean)); changed() } finally { setSaving(false) }
  }
  const exportData = async () => {
    const data = await api.exportMember(d.id)
    download(`member-${d.id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json')
    changed()
  }
  return (
    <div className="a-stack">
      {ins && (
        <section className="a-insight">
          <div className="a-row a-row--between">
            <h3>Traveller profile</h3>
            <Badge tone={ins.health >= 60 ? 'ok' : ins.health >= 30 ? 'info' : 'warn'}>Health {ins.health}</Badge>
          </div>
          {ins.next_action && <p className="a-insight__action"><Icon name="lightbulb" size={16} /> {ins.next_action}</p>}
          <Facts rows={[
            ['Travels as', ins.traveller_type], ['Trips a year', ins.trips_per_year], ['Typical trip', ins.avg_trip_days ? `${ins.avg_trip_days} days` : null],
            ['Plans ahead', ins.lead_days != null ? `${ins.lead_days} days (${ins.planning_style})` : null], ['Trip style', ins.trip_style],
            ['Regions', (ins.regions || []).join(', ') || null], ['Books through', ins.channel], ['Uses STT as', ins.persona],
            ['Affluence', ins.affluence ? `${ins.affluence} (${ins.affluence_signals} signal${ins.affluence_signals === 1 ? '' : 's'})` : 'Not enough booking data'],
            ['Last 30 days', `${ins.active_days_30} days active · ${ins.sessions_30} sessions${ins.active_min_30 ? ` · ${ins.active_min_30} min` : ''}`],
            ['Paid so far', ins.lifetime_value ? `$${(ins.lifetime_value / 100).toFixed(2)}` : '—'],
          ]} />
          {!!ins.affluence_why?.length && <div className="a-chips">{ins.affluence_why.map(w => <span key={w} className="a-chip">{w}</span>)}</div>}
        </section>
      )}
      <section>
        <h3>Traveller</h3>
        <Facts rows={[
          ['Trips', num(d.trips.length)], ['Countries', num(d.countries)], ['Home city', d.home_city],
          ['Travels as', d.party_max ? (d.party_max === 1 ? 'Solo' : `Up to ${d.party_max} people`) : null],
          ['Top fare', FARE_LABEL[d.fare_top]],
          ['Came from', d.source || (d.attribution ? 'Direct' : 'Not recorded (joined before tracking)')],
          ['Currency', d.profile?.home_currency], ['Time zone', d.profile?.timezone],
        ]} />
        {!!fares.length && (
          <div className="a-chips">{fares.map(([t, n]) => <span key={t} className="a-chip">{FARE_LABEL[t] || t} · {n}</span>)}</div>
        )}
      </section>
      <section>
        <h3>Trips</h3>
        <Table rowKey={t => t.id} rows={d.trips} empty="No trips yet." cols={[
          { key: 'city', label: 'Where', render: t => `${t.city || '—'}${t.country ? `, ${t.country}` : ''}` },
          { key: 'start', label: 'Dates', render: t => t.start ? `${fmtDate(t.start)} – ${fmtDate(t.end)}` : 'No dates yet', sortValue: t => t.start },
          { key: 'bookings', label: 'Bookings', num: true },
          { key: 'by_type', label: 'Types', render: t => Object.entries(t.by_type || {}).map(([k, n]) => `${n} ${k}`).join(', ') || '—' },
          { key: 'travellers', label: 'People', num: true },
          { key: 'owner', label: 'Role', render: t => t.owner ? 'Owner' : 'Traveller' },
        ]} />
        <p className="a-hint">Places, dates and counts only. Booking details never reach the cockpit.</p>
      </section>
      <section>
        <h3>Account</h3>
        <Facts rows={[
          ['Sign-in', (d.account?.providers || []).filter(Boolean).join(', ')], ['Email confirmed', d.account?.confirmed ? 'Yes' : 'No'],
          ['Last sign-in', fmtDate(d.account?.last_sign_in, true)], ['Platform', d.platform], ['App version', d.app_version],
          ['Authenticator', d.account?.mfa ? 'On' : 'Off'], ['Member ID', <code key="id">{d.id}</code>],
        ]} />
      </section>
      {canAct && (
        <section>
          <h3>Tags</h3>
          <div className="a-row">
            <input className="a-input" value={tags} onChange={e => setTags(e.target.value)} placeholder="vip, press, beta" aria-label="Tags" />
            <button className="a-btn a-btn--sm" onClick={saveTags} disabled={saving}>Save</button>
          </div>
          <p className="a-hint">Lower case, comma separated. Searchable in the member list.</p>
        </section>
      )}
      {canAct && (
        <section className="a-row a-row--wrap">
          <button className="a-btn a-btn--ghost a-btn--sm" onClick={exportData}><Icon name="download" size={16} /> Export their data (JSON)</button>
          {role === 'owner' && (
            <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => api.setInternal(d.id, !d.internal).then(changed)}>
              {d.internal ? 'Count in reports again' : 'Mark as internal (leave out of reports)'}
            </button>
          )}
        </section>
      )}
    </div>
  )
}

function Membership({ d, canAct, changed }) {
  const [giving, setGiving] = useState(false)
  const [ending, setEnding] = useState(null)
  return (
    <div className="a-stack">
      <section>
        <div className="a-row a-row--between">
          <h3>Plan: {PLAN_LABEL[d.plan]}</h3>
          {canAct && <button className="a-btn a-btn--primary a-btn--sm" onClick={() => setGiving(true)}><Icon name="award" size={16} /> Give First Class</button>}
        </div>
        <p className="a-hint">Store subscriptions (App Store, Play, web) appear here once the paywall ships; they're managed by Apple and Google. Grants are recorded now and switch on with the paywall.</p>
      </section>
      <section>
        <h3>Grants</h3>
        <Table rowKey={g => g.id} rows={d.grants} empty="No grants." cols={[
          { key: 'source', label: 'From', render: g => g.code ? `Code ${g.code}` : 'Given by admin' },
          { key: 'reason', label: 'Reason', render: g => GRANT_REASONS.find(r => r[0] === g.reason)?.[1] || g.reason },
          { key: 'starts_at', label: 'Starts', render: g => fmtDate(g.starts_at) },
          { key: 'ends_at', label: 'Ends', render: g => g.ends_at ? fmtDate(g.ends_at) : 'Lifetime' },
          { key: 'live', label: 'State', render: g => g.ended_at ? <span className="a-muted">Ended {fmtDate(g.ended_at)}</span>
            : g.live ? <Badge tone="ok">Live</Badge> : <Badge>Starts later</Badge> },
          { key: 'end', label: '', render: g => canAct && !g.ended_at
            ? <button className="a-btn a-btn--ghost a-btn--sm" onClick={(e) => { e.stopPropagation(); setEnding(g) }}>End</button> : null },
        ]} />
      </section>
      <section>
        <h3>Codes used</h3>
        <Table rowKey={c => c.id} rows={d.codes} empty="No codes used." cols={[
          { key: 'code', label: 'Code', render: c => <code>{c.code}</code> },
          { key: 'redeemed_at', label: 'Used', render: c => fmtDate(c.redeemed_at, true) },
          { key: 'ended_at', label: 'Ended', render: c => c.ended_at ? fmtDate(c.ended_at) : '—' },
        ]} />
        {!!d.code_attempts.filter(a => a.result !== 'ok').length && (
          <details className="a-done"><summary>Failed attempts ({d.code_attempts.filter(a => a.result !== 'ok').length})</summary>
            <ul>{d.code_attempts.filter(a => a.result !== 'ok').map((a, i) => <li key={i}><code>{a.code}</code> · {a.result.replace(/_/g, ' ')} · {ago(a.ts)}</li>)}</ul>
          </details>
        )}
      </section>
      {giving && <GrantModal d={d} onClose={() => setGiving(false)} onDone={changed} />}
      {ending && <ReasonModal title="End this grant" confirm="End grant" danger
        body="First Class from this grant stops now. The record stays."
        onClose={() => setEnding(null)} onSubmit={(reason) => api.endGrant(ending.id, reason).then(changed)} />}
    </div>
  )
}

function GrantModal({ d, onClose, onDone }) {
  const [length, setLength] = useState('30')
  const [until, setUntil] = useState('')
  const [reason, setReason] = useState('goodwill')
  const [note, setNote] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const live = d.grants.find(g => g.live && g.ends_at)
  const submit = async () => {
    setBusy(true); setError(null)
    try {
      await api.grant(d.id, {
        reason, note,
        lifetime: length === 'life',
        days: /^\d+$/.test(length) ? Number(length) : null,
        until: length === 'until' ? new Date(`${until}T23:59:59`).toISOString() : null,
      })
      onDone(); onClose()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal title={`Give First Class to ${d.name || d.email}`} onClose={onClose}
      footer={<><button className="a-btn a-btn--ghost" onClick={onClose}>Cancel</button>
        <button className="a-btn a-btn--primary" onClick={submit} disabled={busy || (length === 'until' && !until)}>Give First Class</button></>}>
      <div className="a-form">
        <Field label="For how long">
          <Segmented options={[['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['365', '1 year'], ['until', 'Until a date'], ['life', 'Lifetime']]} value={length} onChange={setLength} />
        </Field>
        {length === 'until' && <Field label="Until"><input type="date" value={until} onChange={e => setUntil(e.target.value)} min={new Date().toISOString().slice(0, 10)} /></Field>}
        {live && length !== 'until' && length !== 'life' && <p className="a-hint">Starts after their current grant ends on {fmtDate(live.ends_at)}.</p>}
        <Field label="Reason">
          <select value={reason} onChange={e => setReason(e.target.value)}>{GRANT_REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </Field>
        <Field label="Note for the record" hint="Why, and anything a future you should know."><textarea rows={3} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} /></Field>
        {error && <p className="a-field__error">{error}</p>}
      </div>
    </Modal>
  )
}

function Status({ d, canAct, role, changed }) {
  const [changing, setChanging] = useState(false)
  const [lifting, setLifting] = useState(null)
  const live = d.moderation.filter(x => x.live)
  return (
    <div className="a-stack">
      <section>
        <div className="a-row a-row--between">
          <h3>Status: {STATUS_LABEL[d.status]}</h3>
          {canAct && !d.is_admin && <button className="a-btn a-btn--sm" onClick={() => setChanging(true)}><Icon name="shield" size={16} /> Change status</button>}
        </div>
        {d.is_admin && <p className="a-hint">Admins can't be moderated from the cockpit.</p>}
        {live.map(x => (
          <div key={x.id} className={`a-callout a-callout--${statusTone(x.level)}`}>
            <div>
              <strong>{STATUS_LABEL[x.level]}</strong> · {MOD_REASONS.find(r => r[0] === x.reason)?.[1]} · since {fmtDate(x.starts_at)}
              {x.ends_at && <> · until {fmtDate(x.ends_at, true)}</>}
              {x.note && <p>{x.note}</p>}
            </div>
            {canAct && (x.level !== 'banned' || role === 'owner') && <button className="a-btn a-btn--sm" onClick={() => setLifting(x)}>Lift</button>}
          </div>
        ))}
      </section>
      <section>
        <h3>History</h3>
        <Table rowKey={x => x.id} rows={d.moderation} empty="Clean record." cols={[
          { key: 'level', label: 'Step', render: x => STATUS_LABEL[x.level] },
          { key: 'reason', label: 'Reason', render: x => MOD_REASONS.find(r => r[0] === x.reason)?.[1] },
          { key: 'created_at', label: 'When', render: x => fmtDate(x.created_at, true) },
          { key: 'ends_at', label: 'Until', render: x => x.level === 'banned' ? 'Permanent' : x.ends_at ? fmtDate(x.ends_at) : 'Until lifted' },
          { key: 'lifted_at', label: 'Lifted', render: x => x.lifted_at ? `${fmtDate(x.lifted_at)}: ${x.lift_reason}` : '—' },
        ]} />
      </section>
      <section>
        <h3>Admin actions on this member</h3>
        <ul className="a-log">{d.audit.length ? d.audit.map((a, i) => <li key={i}><code>{a.action}</code> <span className="a-muted">{fmtDate(a.ts, true)}</span></li>) : <li className="a-muted">None yet.</li>}</ul>
      </section>
      {changing && <StatusModal d={d} role={role} onClose={() => setChanging(false)} onDone={changed} />}
      {lifting && <ReasonModal title={`Lift ${STATUS_LABEL[lifting.level].toLowerCase()}`} confirm="Lift"
        body={lifting.level === 'banned' ? 'They can sign in again and the email is unblocked.' : 'Takes effect now.'}
        onClose={() => setLifting(null)} onSubmit={(reason) => api.liftStatus(lifting.id, reason).then(changed)} />}
    </div>
  )
}

function StatusModal({ d, role, onClose, onDone }) {
  const [level, setLevel] = useState('warning')
  const [reason, setReason] = useState('terms')
  const [days, setDays] = useState('3')
  const [note, setNote] = useState('')
  const [message, setMessage] = useState(MESSAGES.warning)
  const [confirmText, setConfirmText] = useState('')
  const impact = useLoad(() => api.statusImpact(d.id), [d.id])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const endsAt = level === 'suspended' ? new Date(Date.now() + Number(days) * 86400000) : null
  const i = impact.data

  const pickLevel = (l) => {
    setLevel(l)
    setMessage(MESSAGES[l].replace('{date}', l === 'suspended' ? fmtDate(new Date(Date.now() + Number(days) * 86400000)) : ''))
  }
  const submit = async () => {
    setBusy(true); setError(null)
    try {
      await api.setStatus(d.id, { level, reason, note, message, endsAt: endsAt?.toISOString() })
      onDone(); onClose()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const locked = level === 'banned' && confirmText !== 'BAN'

  return (
    <Modal wide title={`Change status: ${d.name || d.email}`} onClose={onClose}
      footer={<><button className="a-btn a-btn--ghost" onClick={onClose}>Cancel</button>
        <button className={`a-btn ${level === 'banned' || level === 'suspended' ? 'a-btn--danger' : 'a-btn--primary'}`} onClick={submit} disabled={busy || locked}>
          {LEVELS.find(l => l[0] === level)[1]}</button></>}>
      <div className="a-form">
        <div className="a-levels" role="radiogroup">
          {LEVELS.map(([v, label, desc]) => {
            const off = v === 'banned' && role !== 'owner'
            return (
              <button key={v} role="radio" aria-checked={level === v} disabled={off} className={`a-level ${level === v ? 'is-on' : ''}`} onClick={() => pickLevel(v)}>
                <strong>{label}</strong><span>{desc}</span>
              </button>
            )
          })}
        </div>
        {level === 'suspended' && (
          <Field label="For how long" hint={role === 'support' ? 'Support can suspend for up to 7 days.' : null}>
            <Segmented options={[['1', '1 day'], ['3', '3 days'], ['7', '7 days'], ['30', '30 days'], ['90', '90 days']]} value={days}
              onChange={(v) => { setDays(v); setMessage(MESSAGES.suspended.replace('{date}', fmtDate(new Date(Date.now() + Number(v) * 86400000)))) }} />
          </Field>
        )}
        <Field label="Reason">
          <select value={reason} onChange={e => setReason(e.target.value)}>{MOD_REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </Field>
        <Field label="Internal note" hint="What happened and what you saw. Only admins see this."><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={2000} /></Field>
        <Field label="Message to the member" hint="Saved with the record. Automatic emails come with the next build step; for now copy it and send it from your inbox.">
          <textarea rows={4} value={message} onChange={e => setMessage(e.target.value)} maxLength={2000} />
        </Field>
        <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => navigator.clipboard?.writeText(message)}><Icon name="copy" size={16} /> Copy message</button>

        <div className="a-impact">
          <h3>What this touches</h3>
          {!i ? <Loading /> : (
            <ul>
              <li>Plan: {PLAN_LABEL[i.plan]}{i.live_grants ? ` (${i.live_grants} live grant${i.live_grants > 1 ? 's' : ''}; end them in Membership if you want)` : ''}.</li>
              <li>Store subscription: none on record. Once the paywall ships, a store subscription keeps billing until the member cancels; refunds go through RevenueCat (web and Play) or Apple (member asks).</li>
              <li>{i.shared_trips ? `Owns ${i.shared_trips} shared trip${i.shared_trips > 1 ? 's' : ''} with ${i.travellers_on_them} other traveller${i.travellers_on_them === 1 ? '' : 's'}. They keep read access.` : 'Owns no shared trips.'}</li>
              {(level === 'suspended' || level === 'banned') && <li>{i.pending_invites} pending invite{i.pending_invites === 1 ? '' : 's'} will be cancelled. They're signed out on every device now.</li>}
              {level === 'banned' && <li>The email (ignoring case, Gmail dots and +tags) can't sign up again. Their data is kept; deletion only on request.</li>}
            </ul>
          )}
        </div>
        {level === 'banned' && <Field label='Type BAN to confirm'><input value={confirmText} onChange={e => setConfirmText(e.target.value.toUpperCase())} /></Field>}
        {error && <p className="a-field__error">{error}</p>}
      </div>
    </Modal>
  )
}

export function ReasonModal({ title, body, confirm, danger, onClose, onSubmit }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!reason.trim()) { setError('A reason is needed'); return }
    setBusy(true)
    try { await onSubmit(reason.trim()); onClose() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal title={title} onClose={onClose}
      footer={<><button className="a-btn a-btn--ghost" onClick={onClose}>Cancel</button>
        <button className={`a-btn ${danger ? 'a-btn--danger' : 'a-btn--primary'}`} onClick={submit} disabled={busy}>{confirm}</button></>}>
      <div className="a-form">
        {body && <p>{body}</p>}
        <Field label="Reason" error={error}><input value={reason} onChange={e => { setReason(e.target.value); setError(null) }} maxLength={300} placeholder="Member wrote in, resolved" /></Field>
      </div>
    </Modal>
  )
}

function Notes({ d, canAct, changed }) {
  const [body, setBody] = useState('')
  const [pinned, setPinned] = useState(false)
  const add = async (e) => {
    e.preventDefault()
    if (!body.trim()) return
    await api.noteAdd(d.id, body.trim(), pinned)
    setBody(''); setPinned(false); changed()
  }
  return (
    <div className="a-stack">
      {canAct && (
        <form onSubmit={add} className="a-form">
          <textarea rows={3} value={body} onChange={e => setBody(e.target.value)} placeholder="Wrote in about a missing flight import; fixed and replied." maxLength={4000} aria-label="New note" />
          <div className="a-row a-row--between">
            <label className="a-check"><input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} /> Pin to the top</label>
            <button className="a-btn a-btn--primary a-btn--sm" disabled={!body.trim()}>Add note</button>
          </div>
        </form>
      )}
      {!d.notes.length ? <p className="a-empty">No notes yet.</p> : (
        <ul className="a-notes">
          {d.notes.map(n => (
            <li key={n.id} className={n.pinned ? 'is-pinned' : ''}>
              <p>{n.body}</p>
              <div className="a-row a-row--between">
                <span className="a-muted">{n.pinned && 'Pinned · '}{fmtDate(n.created_at, true)}</span>
                {canAct && <span className="a-row">
                  <button className="a-link" onClick={() => api.noteUpdate(n.id, { pinned: !n.pinned }).then(changed)}>{n.pinned ? 'Unpin' : 'Pin'}</button>
                  <button className="a-link a-link--danger" onClick={() => api.noteUpdate(n.id, { delete: true }).then(changed)}>Delete</button>
                </span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Activity({ d }) {
  const usage = Object.entries(d.usage || {}).sort((a, b) => b[1] - a[1])
  return (
    <div className="a-stack">
      <section>
        <h3>What they use</h3>
        {usage.length ? <div className="a-chips">{usage.map(([e, n]) => <span key={e} className="a-chip">{e.replace(/_/g, ' ')} · {n}</span>)}</div>
          : <p className="a-empty">No activity recorded. They may have usage stats turned off.</p>}
      </section>
      <section>
        <h3>Timeline</h3>
        <ul className="a-timeline">
          {d.timeline.map((e, i) => (
            <li key={i}>
              <span className="a-muted">{fmtDate(e.ts, true)}</span>
              <span><code>{e.event}</code> {e.props?.path || e.props?.type || e.props?.section || e.props?.feature || ''}
                {e.event === 'active_time' && ` · ${minutes(e.props?.seconds)}`}</span>
              <span className="a-muted">{e.platform} {e.version}</span>
            </li>
          ))}
          {!d.timeline.length && <li className="a-muted">Nothing yet.</li>}
        </ul>
      </section>
    </div>
  )
}
