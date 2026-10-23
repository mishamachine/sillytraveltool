import { useState } from 'react'
import Icon from '../../ui/icons/Icon'
import { api } from '../api'
import { Card, Stat, Table, Bars, BarList, Loading, ErrorNote, useLoad, Modal, Field, Segmented, ExportButton, num, ago } from '../ui'

// Money → Costs (admin_costs: usage × the editable cost_rates) and Controls (app_settings, owner-only, audited).
// AI limits and the kill switches are enforced in consume_ai_quota / consume_api_call, so they work without a deploy.

const usd = (n, digits = 2) => n == null ? '—' : `${Number(n) < 0 ? '−' : ''}$${Math.abs(Number(n)).toFixed(digits)}`
const small = (n) => n == null ? '—' : Number(n) > 0 && Number(n) < 0.1 ? usd(n, 3) : usd(n)
const ENDPOINT = { autocomplete: 'Autocomplete', place_details: 'Place details', text_search: 'Text search', nearby: 'Nearby search',
  photo: 'Photos', routes: 'Routes', geocode: 'Geocoding', timezone: 'Time zone', static_map: 'Static maps', other: 'Other' }
const FLAG = { ai: 'AI calls', guide: 'guide sections', google: 'Google calls' }

export default function CostsPanel({ filters, go, role }) {
  const costs = useLoad(() => api.costs(filters), [filters])
  const settings = useLoad(() => api.settings(), [filters.tick])
  const d = costs.data
  const reload = () => { costs.reload(); settings.reload() }

  return (
    <>
      <Card title="Costs" icon="chart" className="a-span-12" subtitle={`estimated, ${filters.label}`}
        actions={<ExportButton name="costs-daily" rows={d?.daily} />}>
        <ErrorNote error={costs.error} onRetry={costs.reload} />
        {!d ? <Loading /> : (
          <>
            <div className="a-stats">
              <Stat label="Total spend" value={usd(d.total)} hint={`${usd(d.variable)} usage + ${usd(d.fixed)} fixed`} />
              <Stat label="AI" value={small(d.ai_usd)} hint={`${num(d.ai_calls)} calls`} />
              <Stat label="Guides" value={small(d.guide_usd)} hint={`${num(d.guide_calls)} sections`} />
              <Stat label="Google Maps" value={small(d.google_usd)} hint={`${num(d.google_calls)} calls`} />
              <Stat label="Per active member" value={small(d.per_active)} hint={`${num(d.active_members)} active, usage only`} />
              <Stat label="Per paying member" value={d.per_paying == null ? '—' : usd(d.per_paying)} hint={`${num(d.paying_members)} First Class`} />
              <Stat label="Margin" value={usd(d.margin)} tone={d.margin < 0 ? 'danger' : undefined}
                hint={`${usd(d.gross)} gross − refunds − all costs`} />
              <Stat label="Today so far" value={small(d.today)} tone={d.today_threshold && d.today > d.today_threshold ? 'danger' : undefined}
                hint={d.today_threshold ? `alert at ${usd(d.today_threshold)}` : 'no alert set'} />
            </div>
            {!!d.daily.length && (
              <div className="a-mini-charts">
                <span className="a-muted">Estimated usage spend a day (AI + guides + Google)</span>
                <Bars data={d.daily.map(x => ({ day: x.day, value: x.total * 100 }))} label="Spend per day in cents" />
              </div>
            )}
            <p className="a-hint">Estimates: calls counted on our side × the rates in Controls. Google's monthly free usage and DeepSeek's cache discounts aren't subtracted, so real bills run lower.
              {filters.excludeInternal && d.variable_all > d.variable ? ` Your own and test accounts add ${small(d.variable_all - d.variable)} (included in the margin).` : ''}</p>
          </>
        )}
      </Card>

      {d && (
        <>
          <Card title="Top spending members" icon="users" className="a-span-7" actions={<ExportButton name="costs-members" rows={d.top_members} />}>
            <Table rows={d.top_members} rowKey={r => r.user_id} onRow={r => !r.system && go({ tab: 'members', member: r.user_id })}
              empty="No metered usage in this window." cols={[
                { key: 'email', label: 'Member', render: r => r.system ? <span className="a-muted">No member (server jobs)</span>
                  : <div className="a-who"><strong>{r.email || r.user_id.slice(0, 8)}</strong><span>{r.internal ? 'internal' : r.plan === 'first_class' ? 'First Class' : 'Free'}</span></div> },
                { key: 'ai_calls', label: 'AI', num: true },
                { key: 'guide_calls', label: 'Guides', num: true },
                { key: 'google_calls', label: 'Google', num: true },
                { key: 'max_ai_day', label: 'Busiest AI day', num: true },
                { key: 'usd', label: 'Cost', num: true, render: r => small(r.usd) },
              ]} />
          </Card>
          <Card title="Google Maps by endpoint" icon="map" className="a-span-5" actions={<ExportButton name="costs-google" rows={d.google_endpoints} />}>
            <BarList rows={d.google_endpoints.map(x => ({ label: ENDPOINT[x.endpoint] || x.endpoint, value: x.calls, sub: small(x.usd) }))}
              empty="No Google calls counted in this window (counting started 23 Oct 2026)." />
            {!!d.flags.length && (
              <section className="a-impact a-impact--warn">
                <h3>Usage flags</h3>
                <ul>
                  {d.flags.map(f => <li key={`${f.day}${f.user_id}${f.kind}`}>{f.day}: <button className="a-link" onClick={() => go({ tab: 'members', member: f.user_id })}>{f.email}</button> {num(f.calls)} {FLAG[f.kind]}</li>)}
                </ul>
              </section>
            )}
          </Card>
        </>
      )}

      <Controls settings={settings} last24={d?.last_24h} role={role} onChanged={reload} />
    </>
  )
}

function Controls({ settings, last24, role, onChanged }) {
  const isOwner = role === 'owner'
  const s = settings.data
  const [confirm, setConfirm] = useState(null)
  const [test, setTest] = useState(null)

  const save = async (key, value) => { await api.settingSet(key, value); onChanged() }
  const sendTest = async () => {
    setTest({ busy: true })
    try { const r = await api.costAlertTest(); setTest({ ok: r.sent ? `Sent to the owner's email (${usd(r.today)} so far today).` : 'Nothing sent.' }) }
    catch (e) { setTest({ error: e.message }) }
  }

  if (settings.error) return <Card title="Controls" icon="settings" className="a-span-12"><ErrorNote error={settings.error} onRetry={settings.reload} /></Card>
  if (!s) return <Card title="Controls" icon="settings" className="a-span-12"><Loading /></Card>
  const kill = s.kill || {}
  const ask = (c) => setConfirm(c)

  return (
    <Card title="Controls" icon="settings" className="a-span-12" subtitle={isOwner ? 'changes apply at once and are logged' : 'owner only'}>
      <div className="a-controls">
        <section className={`a-impact ${kill.ai_paused || kill.google_paused ? 'a-impact--warn' : ''}`}>
          <h3>Cost kill switch</h3>
          <div className="a-control">
            <span>AI (packing, import, HONK, phrases, guides)</span>
            <Segmented size="sm" value={kill.ai_paused ? 'off' : 'on'} options={[['on', 'Running'], ['off', 'Paused']]}
              onChange={(v) => isOwner && (v === 'off') !== !!kill.ai_paused && ask({
                title: v === 'off' ? 'Pause all AI' : 'Turn AI back on', danger: v === 'off', confirm: v === 'off' ? 'Pause AI' : 'Turn on',
                body: v === 'off'
                  ? `Every AI request is refused for everyone, you included, and members see "today's AI limit reached". In the last 24 hours ${num(last24?.ai_members)} members made ${num(last24?.ai_calls)} AI calls. Email imports stop being read until you turn it back on.`
                  : 'AI requests work again straight away.',
                run: () => save('kill', { ai_paused: v === 'off' }),
              })} />
          </div>
          <div className="a-control">
            <span>Google Maps (search, places, photos, routes, maps)</span>
            <Segmented size="sm" value={kill.google_paused ? 'off' : 'on'} options={[['on', 'Running'], ['off', 'Paused']]}
              onChange={(v) => isOwner && (v === 'off') !== !!kill.google_paused && ask({
                title: v === 'off' ? 'Pause Google Maps' : 'Turn Google Maps back on', danger: v === 'off', confirm: v === 'off' ? 'Pause Google' : 'Turn on',
                body: v === 'off'
                  ? `New Google calls stop for everyone. Cached places still show; new searches, photos, routes and maps come back empty and guides fall back to AI-only lists. In the last 24 hours ${num(last24?.google_members)} members made ${num(last24?.google_calls)} Google calls.`
                  : 'Google calls work again straight away.',
                run: () => save('kill', { google_paused: v === 'off' }),
              })} />
          </div>
        </section>

        <section className="a-impact">
          <h3>Founders offer</h3>
          <div className="a-control">
            <span>Lifetime First Class $29.99 on the paywall</span>
            <Segmented size="sm" value={s.founders_offer?.active === false ? 'off' : 'on'} options={[['on', 'On'], ['off', 'Ended']]}
              onChange={(v) => isOwner && (v === 'on') !== (s.founders_offer?.active !== false) && ask({
                title: v === 'off' ? 'End the founders offer' : 'Bring back the founders offer', danger: v === 'off', confirm: v === 'off' ? 'End offer' : 'Turn on',
                body: v === 'off'
                  ? 'The paywall stops offering lifetime at $29.99 (it reads this switch from public_settings). Founders who already bought keep it for life.'
                  : 'The paywall offers lifetime at $29.99 again.',
                run: () => save('founders_offer', { active: v === 'on' }),
              })} />
          </div>
          <p className="a-hint">The paywall reads this when it opens; members mid-checkout aren't affected.</p>
        </section>

        <NumberGroup title="AI daily limits (per member)" k="ai_limits" value={s.ai_limits} isOwner={isOwner} onSave={save}
          hint="Enforced on the server for every AI call; replaces the function defaults (100 and 40)."
          fields={[['ai_daily', 'AI calls a day'], ['guide_daily', 'Guide sections a day']]} />

        <NumberGroup title="Google daily cap (per member)" k="google_limits" value={s.google_limits} isOwner={isOwner} onSave={save}
          hint="A runaway stop, not a product limit: the heaviest real day so far is a few hundred calls."
          fields={[['per_user_daily', 'Google calls a day']]} />

        <section className="a-impact">
          <NumberGroup bare title="Alerts" k="cost_alert" value={s.cost_alert} isOwner={isOwner} onSave={save}
            hint="Emails you at most once a day when today's estimate passes the amount, and once per member when they pass a flag level. Checked every hour."
            fields={[['daily_usd', 'Email me when a day passes ($)', 0.5], ['flag_ai', 'Flag a member at AI calls'], ['flag_guide', 'Flag at guide sections'], ['flag_google', 'Flag at Google calls']]} />
          {isOwner && (
            <div className="a-row">
              <button className="a-btn a-btn--sm" onClick={sendTest} disabled={test?.busy}><Icon name="mail" size={16} /> {test?.busy ? 'Sending…' : 'Send a test alert'}</button>
              {test?.ok && <span className="a-muted">{test.ok}</span>}
              {test?.error && <span className="a-field__error">{test.error}</span>}
            </div>
          )}
          {s.cost_alert?.last_sent_day && <p className="a-hint">Last spend alert: {s.cost_alert.last_sent_day}.</p>}
        </section>

        <RatesGroup rates={s.cost_rates} isOwner={isOwner} onSave={save} updated={s.cost_rates?._updated_at} />
      </div>

      {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
    </Card>
  )
}

function NumberGroup({ title, k, value = {}, fields, hint, isOwner, onSave, bare }) {
  const initial = Object.fromEntries(fields.map(([f]) => [f, value[f] ?? '']))
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const dirty = fields.some(([f]) => String(form[f]) !== String(value[f] ?? ''))
  const submit = async () => {
    const patch = {}
    for (const [f] of fields) {
      const n = Number(form[f])
      if (form[f] === '' || !Number.isFinite(n) || n < 0) { setError('Numbers of 0 or more only.'); return }
      patch[f] = n
    }
    setBusy(true); setError(null)
    try { await onSave(k, patch); setSaved(true); setTimeout(() => setSaved(false), 2500) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const body = (
    <>
      <h3>{title}</h3>
      <div className="a-form--3">
        {fields.map(([f, label, step]) => (
          <Field key={f} label={label}>
            <input type="number" min={0} step={step || 1} value={form[f]} disabled={!isOwner}
              onChange={e => setForm(s => ({ ...s, [f]: e.target.value }))} />
          </Field>
        ))}
      </div>
      {isOwner && (
        <div className="a-row">
          <button className="a-btn a-btn--primary a-btn--sm" onClick={submit} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save'}</button>
          {saved && <span className="a-muted"><Icon name="check" size={14} /> Saved</span>}
          {error && <span className="a-field__error">{error}</span>}
        </div>
      )}
      {hint && <p className="a-hint">{hint}{value._updated_at ? ` Last changed ${ago(value._updated_at)}.` : ''}</p>}
    </>
  )
  return bare ? body : <section className="a-impact">{body}</section>
}

const RATE_FIELDS = [['ai_call', 'AI call, flat ($)'], ['guide_section', 'Guide section, flat ($)'], ['supabase_monthly', 'Supabase a month ($)'], ['hosting_monthly', 'Hosting a month ($)']]
const PRICE_FIELDS = [['input', 'in'], ['cached_input', 'cached in'], ['output', 'out']]
// Models DeepSeek or Gemini have answered with; a model without its own price is charged at its provider's default
const SEEN_MODELS = ['deepseek-flash']

function RatesGroup({ rates = {}, isOwner, onSave, updated }) {
  const g = rates.google || {}
  const prices = rates.ai_prices || {}
  const models = [...new Set([...Object.keys(prices), ...SEEN_MODELS])]
  const priceOf = (m, f) => prices[m]?.[f] ?? prices[m.startsWith('gemini') ? 'gemini-2.5-flash' : 'deepseek-chat']?.[f] ?? ''
  const [form, setForm] = useState(() => ({ ...Object.fromEntries(RATE_FIELDS.map(([f]) => [f, rates[f] ?? ''])),
    ...Object.fromEntries(Object.keys(ENDPOINT).map(e => [`g_${e}`, g[e] ?? ''])),
    ...Object.fromEntries(models.flatMap(m => PRICE_FIELDS.map(([f]) => [`m_${m}|${f}`, priceOf(m, f)]))) }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const submit = async () => {
    const vals = Object.entries(form).map(([f, v]) => [f, Number(v)])
    if (vals.some(([, n], i) => Object.values(form)[i] === '' || !Number.isFinite(n) || n < 0)) { setError('Numbers of 0 or more only.'); return }
    const patch = { google: {}, ai_prices: {} }
    for (const [f, n] of vals) {
      if (f.startsWith('g_')) patch.google[f.slice(2)] = n
      else if (f.startsWith('m_')) { const [m, k] = f.slice(2).split('|'); (patch.ai_prices[m] ||= {})[k] = n }
      else patch[f] = n
    }
    setBusy(true); setError(null)
    try { await onSave('cost_rates', patch); setSaved(true); setTimeout(() => setSaved(false), 2500) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const input = (f, label) => (
    <Field key={f} label={label}>
      <input type="number" min={0} step="0.0001" value={form[f]} disabled={!isOwner} onChange={e => setForm(s => ({ ...s, [f]: e.target.value }))} />
    </Field>
  )
  return (
    <section className="a-impact a-controls__wide">
      <h3>Cost rates</h3>
      <div className="a-form--3">
        {RATE_FIELDS.map(([f, l]) => input(f, l))}
        {Object.entries(ENDPOINT).map(([e, l]) => input(`g_${e}`, `Google ${l.toLowerCase()} ($ a call)`))}
      </div>
      <h3>AI prices ($ per million tokens)</h3>
      <div className="a-form--3">
        {models.flatMap(m => PRICE_FIELDS.map(([f, l]) => input(`m_${m}|${f}`, `${m} ${l}${prices[m] ? '' : ' (not set yet)'}`)))}
      </div>
      {isOwner && (
        <div className="a-row">
          <button className="a-btn a-btn--primary a-btn--sm" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save rates'}</button>
          {saved && <span className="a-muted"><Icon name="check" size={14} /> Saved</span>}
          {error && <span className="a-field__error">{error}</span>}
        </div>
      )}
      <p className="a-hint">AI is priced from each call's tokens with the per-model prices (check deepseek.com and ai.google.dev pricing); the flat per-call rates only cover days before token logging started (24 Oct 2026). Google Places API (New) list prices: autocomplete $0.00283, details $0.005–0.017 (we ask for hours and ratings, so the higher tier), text and nearby search $0.032, photos $0.007; routes, geocoding and time zone $0.005. Change them when a bill says otherwise.{updated ? ` Last changed ${ago(updated)}.` : ''}</p>
    </section>
  )
}

function ConfirmModal({ title, body, confirm, danger, run, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const go = async () => {
    setBusy(true); setError(null)
    try { await run(); onClose() } catch (e) { setError(e.message); setBusy(false) }
  }
  return (
    <Modal title={title} onClose={onClose}
      footer={<><button className="a-btn a-btn--ghost" onClick={onClose}>Cancel</button>
        <button className={`a-btn ${danger ? 'a-btn--danger' : 'a-btn--primary'}`} onClick={go} disabled={busy}>{busy ? 'Saving…' : confirm}</button></>}>
      <p>{body}</p>
      <p className="a-hint">Logged in the audit trail.</p>
      {error && <p className="a-field__error">{error}</p>}
    </Modal>
  )
}

