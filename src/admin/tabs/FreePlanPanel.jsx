import { useEffect, useState } from 'react'
import Icon from '../../ui/icons/Icon'
import { api } from '../api'
import { Card, Stat, Badge, Loading, ErrorNote, useLoad, Modal, Segmented, Sized, num, ago } from '../ui'

// Money → Free plan (app_settings.free_limits, enforced by the trip/reservation triggers and email_import_locked).
// The master switch stays off until the iOS and Android apps can take payment. Each limit has its own switch and number;
// the bars show today's free members by how much they use, so a new number's impact is visible before saving.

const LIMITS = [
  { key: 'upcoming_trips', on: 'trips_on', hist: 'trips', title: 'Upcoming dated trips', unit: 'upcoming trips',
    help: 'Undated trips and past trips never count. At the limit a member can’t add or date another trip.' },
  { key: 'reservations_per_trip', on: 'reservations_on', hist: 'reservations', title: 'Reservations per trip', unit: 'reservations on their busiest trip',
    help: 'Restaurants, tickets, activities and “other”. Flights, trains, hotels, cars and ideas never count.' },
  { key: 'email_imports', on: 'imports_on', hist: 'imports', title: 'Email imports (account total)', unit: 'emails imported',
    help: 'Later emails are still saved but stay locked until they upgrade.' },
]

export default function FreePlanPanel({ filters, role }) {
  const isOwner = role === 'owner'
  const data = useLoad(() => api.freePlan(filters), [filters])
  const d = data.data
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [confirm, setConfirm] = useState(null)
  useEffect(() => { if (d) setForm(d.settings) }, [d])

  if (data.error) return <Card title="Free plan" icon="user-plus" className="a-span-12"><ErrorNote error={data.error} onRetry={data.reload} /></Card>
  if (!d || !form) return <Card title="Free plan" icon="user-plus" className="a-span-12"><Loading /></Card>

  const s = d.settings
  const dirty = LIMITS.some(l => form[l.key] !== s[l.key] || form[l.on] !== s[l.on])
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const save = async (patch) => {
    setBusy(true); setError(null)
    try { await api.settingSet('free_limits', patch); setSaved(true); setTimeout(() => setSaved(false), 2500); data.reload() }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const affected = (l, cap) => (d.histograms[l.hist] || []).filter(h => h.n >= cap).reduce((n, h) => n + h.members, 0)
  const blockedNow = LIMITS.filter(l => form[l.on]).reduce((n, l) => n + affected(l, Number(form[l.key])), 0)

  return (
    <Card title="Free plan" icon="user-plus" className="a-span-12"
      subtitle={s.enabled ? 'limits enforced' : 'limits off: nothing is enforced yet'}
      actions={<Badge tone={s.enabled ? 'ok' : 'warn'}>{s.enabled ? 'On' : 'Off'}</Badge>}>
      <div className="a-stats">
        <Stat label="Free members" value={d.free} hint={filters.excludeInternal ? 'internal accounts excluded' : 'all accounts'} />
        <Stat label="First Class" value={d.first_class} />
        <Stat label="Paywall views" value={d.paywall_views_30d} hint="last 30 days" />
        <Stat label="Limit hits" value={Object.values(d.limit_hits_30d).reduce((a, b) => a + b, 0)} hint="last 30 days" />
      </div>

      <section className={`a-impact ${s.enabled ? '' : 'a-impact--warn'}`}>
        <div className="a-control">
          <span><strong>Enforce free-plan limits</strong><br />
            <span className="a-muted">Keep this off until the iOS and Android apps can take payment (RevenueCat and store setup). Otherwise app members hit a limit with no way to upgrade.</span></span>
          <Segmented value={s.enabled ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]}
            onChange={(v) => isOwner && (v === 'on') !== !!s.enabled && setConfirm(v === 'on' ? {
              title: 'Turn on free-plan limits', confirm: 'Turn on', danger: true,
              body: `Free members will be blocked from adding past these limits right away. With the numbers below, ${num(blockedNow)} of ${num(d.free)} free members are already at or over one of them (they keep everything they have; only adding more is blocked). Are the iOS and Android apps able to take payment?`,
              run: () => save({ enabled: true }),
            } : {
              title: 'Turn off free-plan limits', confirm: 'Turn off', danger: false,
              body: 'Every limit stops being enforced right away. The numbers stay saved for next time.',
              run: () => save({ enabled: false }),
            })} />
        </div>
      </section>

      <div className="a-limits">
        {LIMITS.map(l => {
          const cap = Number(form[l.key]) || 1
          const hist = d.histograms[l.hist] || []
          const at = hist.filter(h => h.n === cap).reduce((n, h) => n + h.members, 0)
          const over = hist.filter(h => h.n > cap).reduce((n, h) => n + h.members, 0)
          const top = Math.max(1, ...hist.map(h => h.members))
          const maxN = Math.max(cap + 1, ...hist.map(h => h.n))
          const cols = Array.from({ length: Math.min(maxN, 30) + 1 }, (_, n) => ({ n, members: hist.find(h => h.n === n)?.members || 0 }))
          const extra = hist.filter(h => h.n > 30).reduce((x, h) => x + h.members, 0)
          return (
            <section key={l.key} className={`a-impact a-limit ${form[l.on] ? '' : 'is-off'}`}>
              <div className="a-row a-row--between">
                <h3>{l.title}</h3>
                <Segmented size="sm" value={form[l.on] ? 'on' : 'off'} options={[['on', 'Limit'], ['off', 'No limit']]}
                  onChange={(v) => isOwner && set(l.on, v === 'on')} />
              </div>
              <div className="a-stepper">
                <button className="a-icon-btn" aria-label="Lower" disabled={!isOwner || !form[l.on] || cap <= 1} onClick={() => set(l.key, cap - 1)}><Icon name="minus" size={16} /></button>
                <input type="number" min={1} step={1} value={form[l.key]} disabled={!isOwner || !form[l.on]} aria-label={l.title}
                  onChange={e => set(l.key, e.target.value === '' ? '' : Math.max(1, Math.round(Number(e.target.value))))} />
                <button className="a-icon-btn" aria-label="Raise" disabled={!isOwner || !form[l.on]} onClick={() => set(l.key, cap + 1)}><Icon name="plus" size={16} /></button>
                <span className="a-muted">{form[l.on] ? `free members get ${cap}` : 'unlimited for everyone'}</span>
              </div>
              <div className="a-hist" role="img" aria-label={`Free members by ${l.unit}`}>
                {cols.map(c => (
                  <div key={c.n} className={`a-hist__col ${c.n >= cap && form[l.on] ? 'is-hit' : ''}`} title={`${c.members} member${c.members === 1 ? '' : 's'} with ${c.n} ${l.unit}`}>
                    <Sized as="div" className="a-hist__bar" vars={{ '--fill': `${c.members ? Math.max(6, (c.members / top) * 100) : 0}%` }} />
                    <span>{c.n}</span>
                  </div>
                ))}
              </div>
              <p className="a-hint">
                {form[l.on] ? <><strong>{num(at)}</strong> at the limit and <strong>{num(over)}</strong> over it today{extra ? ` (${extra} above 30 not drawn)` : ''}. </> : 'Not limited. '}
                {l.help}
              </p>
            </section>
          )
        })}
      </div>

      {isOwner && (
        <div className="a-row">
          <button className="a-btn a-btn--primary a-btn--sm" disabled={busy || !dirty || LIMITS.some(l => !(Number(form[l.key]) >= 1))}
            onClick={() => save(Object.fromEntries(LIMITS.flatMap(l => [[l.key, Number(form[l.key])], [l.on, !!form[l.on]]])))}>
            {busy ? 'Saving…' : 'Save limits'}
          </button>
          {dirty && <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => setForm(s)}>Undo changes</button>}
          {saved && <span className="a-muted"><Icon name="check" size={14} /> Saved</span>}
          {error && <span className="a-field__error">{error}</span>}
        </div>
      )}
      <p className="a-hint">Applies at once (the paywall and the app read these through public_settings). First Class members, and everyone on a First Class owner’s trip, are never limited. Every change is in the audit log.{s._updated_at ? ` Last changed ${ago(s._updated_at)}.` : ''}</p>

      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}
          footer={<><button className="a-btn a-btn--ghost" onClick={() => setConfirm(null)}>Cancel</button>
            <button className={`a-btn ${confirm.danger ? 'a-btn--danger' : 'a-btn--primary'}`} disabled={busy}
              onClick={async () => { await confirm.run(); setConfirm(null) }}>{confirm.confirm}</button></>}>
          <p>{confirm.body}</p>
          <p className="a-hint">Logged in the audit trail.</p>
        </Modal>
      )}
    </Card>
  )
}
