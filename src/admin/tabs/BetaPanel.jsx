import { useEffect, useState } from 'react'
import Icon from '../../ui/icons/Icon'
import { api } from '../api'
import { Card, Stat, Bars, BarList, Badge, Field, Loading, ErrorNote, useLoad, Modal, Segmented, download, toCsv, num, ago } from '../ui'

// Growth → Beta waitlist (sillytraveltool.com/beta, table beta_waitlist, settings app_settings.beta).
// Sign-ups, sources and the private beta invites. Invites go out through the beta-invite Edge Function: each person is
// claimed before their email is sent, so nobody is invited twice; failed sends can be retried. Links and the launch
// redirect are owner only (admin_beta_settings_set).

const PLATFORMS = [
  { key: 'ios', label: 'iPhone', link: 'ios_url', show: 'show_ios', placeholder: 'https://testflight.apple.com/join/…',
    help: 'TestFlight → your app → External testing → a group → Public link.' },
  { key: 'android', label: 'Android', link: 'android_url', show: 'show_android', placeholder: 'https://play.google.com/apps/testing/…',
    help: 'Play Console → Testing → Closed or internal testing → Testers → "Join on the web" link.' },
  { key: 'web', label: 'Web', link: 'web_url', show: 'show_web', placeholder: 'https://sillytraveltool.com/',
    help: 'The web app is live, so this is set from day one.' },
]
const FREQ = { rarely: 'Once a year or less', few_year: 'A few times a year', monthly: 'About once a month', weekly: 'Most weeks', not_given: 'Not given' }
const DEFAULTS = { ios_url: '', android_url: '', web_url: '', show_ios: false, show_android: false, show_web: true, redirect_url: '', redirect_on: false }
const FIELDS = Object.keys(DEFAULTS)
const fromSettings = (s) => Object.fromEntries(FIELDS.map(k => [k, s?.[k] ?? DEFAULTS[k]]))

export default function BetaPanel({ filters, role }) {
  const isOwner = role === 'owner'
  const data = useLoad(() => api.beta(filters), [filters])
  const d = data.data
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const [group, setGroup] = useState('all')
  const [confirm, setConfirm] = useState(null)
  useEffect(() => { if (d) setForm(fromSettings(d.settings)) }, [d])

  const title = 'Beta waitlist'
  if (data.error) return <Card title={title} icon="users" className="a-span-12"><ErrorNote error={data.error} onRetry={data.reload} /></Card>
  if (!d || !form) return <Card title={title} icon="users" className="a-span-12"><Loading /></Card>

  const s = d.settings || {}
  const saved = fromSettings(s)
  const dirty = FIELDS.some(k => form[k] !== saved[k])
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const linkOk = (v) => !v || /^https:\/\/[^\s"<>]+$/.test(v)
  const bad = ['ios_url', 'android_url', 'web_url', 'redirect_url'].filter(k => !linkOk(form[k]))
  const by = Object.fromEntries((d.platforms || []).map(p => [p.platform, p]))
  const count = (key, field) => key === 'all' ? PLATFORMS.reduce((n, p) => n + (by[p.key]?.[field] || 0), 0) : by[key]?.[field] || 0
  const live = PLATFORMS.filter(p => s[p.link])
  const groupPlatforms = group === 'all' ? live : PLATFORMS.filter(p => p.key === group && s[p.link])
  const toInvite = groupPlatforms.reduce((n, p) => n + (by[p.key]?.waiting || 0) + (by[p.key]?.failed || 0), 0)
  const stuck = count('all', 'sending')
  const missing = group === 'all' ? PLATFORMS.filter(p => !s[p.link]) : PLATFORMS.filter(p => p.key === group && !s[p.link])

  const run = async (fn, done) => {
    setBusy(true); setNote(null)
    try { const out = await fn(); setNote({ ok: true, text: done(out) }); data.reload() }
    catch (e) { setNote({ ok: false, text: e.message }) } finally { setBusy(false) }
  }
  const save = () => run(() => api.betaSettingsSet(Object.fromEntries(FIELDS.map(k => [k, typeof DEFAULTS[k] === 'boolean' ? !!form[k] : String(form[k] || '').trim()]))), () => 'Saved.')
  const exportCsv = () => run(async () => {
    const rows = await api.betaRows()
    download(`beta-waitlist-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows))
    return rows.length
  }, (n) => `Exported ${num(n)} rows.`)

  return (
    <Card title={title} icon="users" className="a-span-12" subtitle="sillytraveltool.com/beta"
      actions={<>
        {s.redirect_on ? <Badge tone="warn">Redirecting</Badge> : <Badge tone="ok">Open</Badge>}
        <button className="a-btn a-btn--ghost a-btn--sm" disabled={busy || !d.total} onClick={exportCsv}><Icon name="download" size={16} /> CSV</button>
      </>}>
      <div className="a-stats">
        <Stat label="On the list" value={d.total} />
        <Stat label="Joined" value={d.in_window} hint={filters.label} />
        <Stat label="Invited" value={count('all', 'sent')} />
        <Stat label="Unsubscribed" value={d.unsubscribed} />
      </div>

      <div className="a-grid a-grid--inner">
        <section className="a-span-12">
          <h3 className="a-subhead">Sign-ups a day</h3>
          <Bars height={80} data={d.series} label="Beta sign-ups per day" />
        </section>
        <section className="a-span-4">
          <h3 className="a-subhead">Platform</h3>
          <BarList rows={PLATFORMS.map(p => ({ label: p.label, value: by[p.key]?.total || 0 })).filter(r => r.value)} empty="No sign-ups yet." />
        </section>
        <section className="a-span-4">
          <h3 className="a-subhead">Source (utm_source)</h3>
          <BarList rows={d.sources} empty="No sign-ups yet." />
        </section>
        <section className="a-span-4">
          <h3 className="a-subhead">How often they travel</h3>
          <BarList rows={(d.frequency || []).map(f => ({ label: FREQ[f.label] || f.label, value: f.value }))} empty="No sign-ups yet." />
        </section>
      </div>

      <section className="a-impact">
        <h3>Private beta invites</h3>
        <p className="a-hint">Each person gets the link for the platform they picked. Nobody is emailed twice; failed sends can be retried. At most 100 per click
          (Resend's free plan sends 100 emails a day).</p>
        <div className="a-row a-row--wrap a-row--between">
          <Segmented size="sm" value={group} onChange={setGroup}
            options={[['all', `All (${num(count('all', 'waiting') + count('all', 'failed'))})`], ...PLATFORMS.map(p => [p.key, `${p.label} (${num((by[p.key]?.waiting || 0) + (by[p.key]?.failed || 0))})`])]} />
          {isOwner && (
            <div className="a-row">
              <button className="a-btn a-btn--ghost a-btn--sm" disabled={busy || !groupPlatforms.length}
                onClick={() => run(() => api.betaInvite('test', group === 'all' ? {} : { platform: group }), (o) => `Test sent to ${o.to} (${o.platforms.join(', ')}).`)}>
                <Icon name="mail" size={16} /> Send me a test
              </button>
              <button className="a-btn a-btn--primary a-btn--sm" disabled={busy || !groupPlatforms.length || !toInvite}
                onClick={() => setConfirm({ count: Math.min(toInvite, 100) })}>
                Send invites{toInvite ? ` to ${num(Math.min(toInvite, 100))}` : ''}
              </button>
            </div>
          )}
        </div>
        {missing.length > 0 && (
          <p className="a-hint"><Icon name="info" size={14} /> {missing.map(p => p.label).join(' and ')}: no beta link yet, so {missing.length === 1 ? 'that group is' : 'those groups are'} skipped.
            Add the link below when the beta build is ready.</p>
        )}
        <ul className="a-beta-progress">
          {PLATFORMS.map(p => (
            <li key={p.key}><strong>{p.label}</strong> {num(by[p.key]?.sent || 0)} invited · {num(by[p.key]?.waiting || 0)} waiting
              {by[p.key]?.failed ? <> · <span className="a-down">{num(by[p.key].failed)} failed</span></> : null}</li>
          ))}
        </ul>
        {stuck > 0 && isOwner && (
          <div className="a-callout a-callout--warn">
            <span>{num(stuck)} invite{stuck === 1 ? '' : 's'} stuck mid-send. Check Resend's log first: they may have gone out.</span>
            <button className="a-btn a-btn--ghost a-btn--sm" disabled={busy}
              onClick={() => run(() => api.betaInvite('release'), (o) => `${num(o.released)} moved to failed (older than 15 minutes only).`)}>Mark as failed</button>
          </div>
        )}
      </section>

      <section className="a-impact a-beta-links">
        <h3>Beta links</h3>
        {PLATFORMS.map(p => (
          <div key={p.key} className="a-beta-link">
            <Field label={`${p.label} link`} hint={p.help} error={!linkOk(form[p.link]) ? 'Must start with https://' : null}>
              <input value={form[p.link]} placeholder={p.placeholder} disabled={!isOwner} onChange={e => set(p.link, e.target.value)} />
            </Field>
            <label className="a-check" title="Show this link in the Get it now section of /beta">
              <input type="checkbox" checked={!!form[p.show]} disabled={!isOwner} onChange={e => set(p.show, e.target.checked)} /> Show on /beta
            </label>
          </div>
        ))}
        <div className="a-beta-link">
          <Field label="After launch, send /beta to" hint="Every /beta visit goes here (UTM tags kept), so no social link has to change."
            error={!linkOk(form.redirect_url) ? 'Must start with https://' : form.redirect_on && !form.redirect_url ? 'Add the address first' : null}>
            <input value={form.redirect_url} placeholder="https://sillytraveltool.com/" disabled={!isOwner} onChange={e => set('redirect_url', e.target.value)} />
          </Field>
          <label className="a-check">
            <input type="checkbox" checked={!!form.redirect_on} disabled={!isOwner} onChange={e => set('redirect_on', e.target.checked)} /> Redirect on
          </label>
        </div>
        {isOwner && (
          <div className="a-row">
            <button className="a-btn a-btn--primary a-btn--sm" disabled={busy || !dirty || bad.length > 0 || (form.redirect_on && !form.redirect_url)} onClick={save}>
              {busy ? 'Saving…' : 'Save links'}
            </button>
            {dirty && <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => setForm(saved)}>Undo changes</button>}
          </div>
        )}
        <p className="a-hint">"Show on /beta" puts the link in the page's Get it now section for everyone; leave it off to send it only by invite.
          {s._updated_at ? ` Last changed ${ago(s._updated_at)}.` : ''}</p>
      </section>

      {note && <div className={note.ok ? 'a-callout a-callout--ok' : 'a-error'} role="status">{note.text}</div>}

      {confirm && (
        <Modal title="Send beta invites" onClose={() => setConfirm(null)}
          footer={<><button className="a-btn a-btn--ghost" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="a-btn a-btn--primary" disabled={busy} onClick={async () => {
              setConfirm(null)
              await run(() => api.betaInvite('send', { platform: group, limit: 100 }),
                (o) => `Sent ${num(o.sent)}${o.failed ? `, ${num(o.failed)} failed (retry later)` : ''}.${o.skipped_no_link?.length ? ` Skipped (no link): ${o.skipped_no_link.join(', ')}.` : ''}`)
            }}>Send {num(confirm.count)}</button></>}>
          <p>Email {num(confirm.count)} {confirm.count === 1 ? 'person' : 'people'} on the {group === 'all' ? '' : `${PLATFORMS.find(p => p.key === group).label} `}list
            their private beta link{groupPlatforms.length > 1 ? 's' : ''}: {groupPlatforms.map(p => p.label).join(', ')}.</p>
          <p className="a-hint">Sent a test to yourself first? Each person is emailed once; the send is logged per person and in the audit trail.</p>
        </Modal>
      )}
    </Card>
  )
}
