import { useState } from 'react'
import Icon from '../../ui/icons/Icon'
import { api } from '../api'
import { Card, Stat, Table, Badge, Bars, BarList, Loading, ErrorNote, useLoad, Modal, Field, Segmented, ExportButton, download, toCsv,
  fmtDate, ago, num } from '../ui'
import { ReasonModal } from './MemberPanel'
import StripePanel, { money } from './StripePanel'
import CostsPanel from './CostsPanel'
import StatementPanel from './StatementPanel'
import FreePlanPanel from './FreePlanPanel'

const STATUS_TONE = { active: 'ok', paused: 'warn', ended: 'neutral', expired: 'neutral', archived: 'neutral' }
const ATTEMPT = { ok: 'Used', invalid: 'Wrong code', not_started: 'Not started yet', expired: 'Ended', paused: 'Paused', used_up: 'Fully used',
  not_eligible: 'Not eligible', already_used: 'Already used', already_member: 'Already lifetime', rate_limited: 'Too many tries',
  discount_at_checkout: 'Discount (checkout only)' }

const what = (c) => c.kind === 'first_class'
  ? (c.lifetime ? 'First Class for life' : `${c.days} days of First Class`)
  : `${c.discount_percent ? `${c.discount_percent}%` : `${c.discount_currency} ${c.discount_amount}`} off ${c.discount_duration === 'forever' ? 'every payment' : 'the first payment'}`

export default function Money({ filters, view, go, role }) {
  const codes = useLoad(() => api.codes(view.archived === '1'), [filters.tick, view.archived])
  const [creating, setCreating] = useState(view.new === 'code')
  const list = codes.data || []
  const open = list.find(c => c.id === view.code)
  const isOwner = role === 'owner'

  return (
    <div className="a-grid">
      <StatementPanel filters={filters} />
      <StripePanel filters={filters} go={go} />
      <FreePlanPanel filters={filters} role={role} />
      <CostsPanel filters={filters} go={go} role={role} />

      <Card title="Codes" icon="percent" className="a-span-12" subtitle={`${list.filter(c => c.status === 'active').length} active`}
        actions={<>
          <label className="a-check"><input type="checkbox" checked={view.archived === '1'} onChange={e => go({ archived: e.target.checked ? '1' : null })} /> Show archived</label>
          <ExportButton name="codes" rows={list} />
          {isOwner && <button className="a-btn a-btn--primary a-btn--sm" onClick={() => setCreating(true)}><Icon name="plus" size={16} /> New code</button>}
        </>}>
        <ErrorNote error={codes.error} onRetry={codes.reload} />
        {!codes.data ? <Loading /> : (
          <Table rows={list} onRow={c => go({ code: c.id })} empty="No codes yet. Create one for a launch, a partner or a single member." cols={[
            { key: 'label', label: 'Code', render: c => <div className="a-who"><strong><code>{c.label}</code></strong><span>{c.is_batch ? `${c.codes} single-use codes` : c.campaign ? `campaign: ${c.campaign}` : ' '}</span></div> },
            { key: 'kind', label: 'Gives', render: what },
            { key: 'status', label: 'Status', render: c => <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge> },
            { key: 'uses', label: 'Uses', num: true, render: c => `${num(c.uses)}${c.max_uses ? ` / ${num(c.max_uses)}` : ''}` },
            { key: 'members', label: 'Members', num: true },
            { key: 'still_first_class', label: 'Still First Class', num: true },
            { key: 'attempts', label: 'Attempts', num: true },
            { key: 'ends_at', label: 'Ends', render: c => c.ends_at ? fmtDate(c.ends_at) : 'No end' },
            { key: 'last_used', label: 'Last used', render: c => ago(c.last_used), sortValue: c => c.last_used || '' },
            { key: 'stripe', label: 'Stripe', render: c => c.kind !== 'discount' ? <span className="a-muted">Not needed</span>
              : c.stripe_promo_id ? <Badge tone="ok">In Stripe</Badge> : c.stripe_error ? <Badge tone="danger">Failed</Badge> : <Badge tone="warn">Not sent</Badge> },
          ]} />
        )}
        <p className="a-hint">First Class codes: members redeem them at sillytraveltool.com/redeem. Discount codes: created here and in Stripe at the same time (same code), used at Stripe checkout; uses, revenue and discount given come back from Stripe.</p>
      </Card>

      {creating && <CreateCode onClose={() => { setCreating(false); go({ new: null }) }} onDone={(r) => {
        codes.reload(); setCreating(false); go({ new: null })
        if (r?.batch) download(`codes-${r.batch}.csv`, toCsv(r.codes.map(code => ({ code }))))
      }} />}
      {open && <CodeReport code={open} isOwner={isOwner} role={role} onClose={() => go({ code: null })} onChanged={codes.reload} go={go} />}
    </div>
  )
}

function CreateCode({ onClose, onDone }) {
  const [f, setF] = useState({ kind: 'first_class', mode: 'one', code: '', count: 20, prefix: '', length: '30', days: 30,
    percent: 20, duration: 'once', audience: 'anyone', member: '', maxUses: '', ends: '', campaign: '', note: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }))

  const submit = async () => {
    setError(null)
    if (f.mode === 'one' && f.code && !/^[A-Za-z0-9-]{4,32}$/.test(f.code)) { setError('Codes are 4–32 letters, numbers or dashes.'); return }
    if (f.audience === 'member' && !/^[0-9a-f-]{36}$/i.test(f.member.trim())) { setError('Paste the member ID from their profile.'); return }
    if (f.campaign && !/^[a-z0-9_-]{1,64}$/i.test(f.campaign)) { setError('Campaign tags are letters, numbers, - and _.'); return }
    const p = {
      kind: f.kind,
      code: f.mode === 'one' ? f.code.trim() || null : null,
      prefix: f.mode === 'batch' ? f.prefix.trim() || null : null,
      days: f.kind === 'first_class' && f.length !== 'life' ? Number(f.length === 'custom' ? f.days : f.length) : null,
      lifetime: f.kind === 'first_class' && f.length === 'life',
      discount_percent: f.kind === 'discount' ? Number(f.percent) : null,
      discount_duration: f.kind === 'discount' ? f.duration : null,
      audience: f.audience,
      audience_member: f.audience === 'member' ? f.member.trim() : null,
      max_uses: f.mode === 'one' && f.maxUses ? Number(f.maxUses) : null,
      ends_at: f.ends ? new Date(`${f.ends}T23:59:59`).toISOString() : null,
      campaign: f.campaign.trim() || null,
      note: f.note.trim() || null,
    }
    setBusy(true)
    try {
      const r = await api.codeCreate(p, f.mode === 'batch' ? Number(f.count) : 1)
      if (f.kind === 'discount') {
        // Same code in Stripe so it works at checkout; failures are shown on the code and can be retried
        for (const id of r.ids || []) await api.stripePushCode(id).catch(() => {})
      }
      onDone(r)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal wide title="New code" onClose={onClose}
      footer={<><button className="a-btn a-btn--ghost" onClick={onClose}>Cancel</button>
        <button className="a-btn a-btn--primary" onClick={submit} disabled={busy}>{f.mode === 'batch' ? `Create ${f.count} codes` : 'Create code'}</button></>}>
      <div className="a-form a-form--2">
        <Field label="Gives">
          <Segmented options={[['first_class', 'Free First Class'], ['discount', 'A discount']]} value={f.kind} onChange={set('kind')} />
        </Field>
        <Field label="Codes">
          <Segmented options={[['one', 'One shared code'], ['batch', 'Batch of single-use codes']]} value={f.mode} onChange={set('mode')} />
        </Field>
        {f.mode === 'one' ? (
          <Field label="Code" hint="Leave empty for a random one. Case doesn't matter.">
            <input value={f.code} onChange={set('code')} placeholder="GOOSE30" maxLength={32} />
          </Field>
        ) : (
          <>
            <Field label="How many"><input type="number" min={2} max={1000} value={f.count} onChange={set('count')} /></Field>
            <Field label="Prefix (optional)" hint="PARTNER → PARTNER-7KQ2M9XA"><input value={f.prefix} onChange={set('prefix')} maxLength={12} /></Field>
          </>
        )}
        {f.kind === 'first_class' ? (
          <Field label="Length">
            <Segmented options={[['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['365', '1 year'], ['life', 'Lifetime'], ['custom', 'Custom']]} value={f.length} onChange={set('length')} />
            {f.length === 'custom' && <input type="number" min={1} max={3650} value={f.days} onChange={set('days')} aria-label="Days" />}
          </Field>
        ) : (
          <>
            <Field label="Percent off"><input type="number" min={1} max={100} value={f.percent} onChange={set('percent')} /></Field>
            <Field label="Applies to"><Segmented options={[['once', 'First payment'], ['forever', 'Every renewal']]} value={f.duration} onChange={set('duration')} /></Field>
          </>
        )}
        <Field label="Who can use it">
          <select value={f.audience} onChange={set('audience')}>
            <option value="anyone">Anyone</option><option value="new_members">New members (joined in the last 30 days)</option><option value="member">One member</option>
          </select>
        </Field>
        {f.audience === 'member' && <Field label="Member ID"><input value={f.member} onChange={set('member')} placeholder="from their profile" /></Field>}
        {f.mode === 'one' && <Field label="Total uses" hint="Empty = no limit. Each member can use it once."><input type="number" min={1} value={f.maxUses} onChange={set('maxUses')} /></Field>}
        <Field label="Ends on" hint="Empty = no end date."><input type="date" value={f.ends} onChange={set('ends')} min={new Date().toISOString().slice(0, 10)} /></Field>
        <Field label="Campaign tag" hint="Links uses to a campaign: launch, tiktok_oct"><input value={f.campaign} onChange={set('campaign')} maxLength={64} /></Field>
        <Field label="Internal note"><input value={f.note} onChange={set('note')} maxLength={1000} placeholder="For the travel blogger partnership" /></Field>
      </div>
      {f.mode === 'batch' && <p className="a-hint">The codes download as a CSV when they're created.</p>}
      {error && <p className="a-field__error">{error}</p>}
    </Modal>
  )
}

function CodeReport({ code, isOwner, role, onClose, onChanged, go }) {
  const r = useLoad(() => api.codeReport(code.id), [code.id, code.uses])
  const [ending, setEnding] = useState(null)
  const [limit, setLimit] = useState(code.max_uses ?? '')
  const d = r.data
  const stripeInfo = useLoad(() => code.kind === 'discount' ? api.codeStripe(code.id) : null, [code.id, code.uses])
  const update = async (p) => {
    await api.codeUpdate(code.id, { ...p, ...(code.is_batch ? { whole_batch: true } : {}) })
    if (code.kind === 'discount' && p.status) {
      const ids = code.is_batch ? (r.data?.codes || []).map(c => c.id) : [code.id]
      for (const id of ids) await api.stripeCodeActive(id, p.status === 'active').catch(() => {})
    }
    onChanged()
  }
  const [pushing, setPushing] = useState(false)
  const push = async () => {
    setPushing(true)
    try {
      const ids = code.is_batch ? (r.data?.codes || []).map(c => c.id) : [code.id]
      for (const id of ids) await api.stripePushCode(id)
      onChanged(); stripeInfo.reload()
    } catch (e) { alert(e.message) } finally { setPushing(false) }
  }

  return (
    <Modal wide title={code.is_batch ? `Batch ${code.label}` : `Code ${code.label}`} onClose={onClose}
      footer={isOwner && <>
        {code.status === 'active' && <button className="a-btn" onClick={() => update({ status: 'paused' })}>Pause</button>}
        {code.status === 'paused' && <button className="a-btn" onClick={() => update({ status: 'active' })}>Resume</button>}
        {['active', 'paused'].includes(code.status) && <button className="a-btn a-btn--danger" onClick={() => update({ status: 'ended' })}>End code</button>}
        {code.status !== 'archived' && <button className="a-btn a-btn--ghost" onClick={() => update({ status: 'archived' }).then(onClose)}>Archive</button>}
      </>}>
      <div className="a-stack">
        <p>{what(code)} · {code.audience === 'anyone' ? 'anyone' : code.audience === 'new_members' ? 'new members only' : 'one member'}
          {code.campaign && <> · campaign <code>{code.campaign}</code></>}{code.note && <> · {code.note}</>}</p>
        <div className="a-stats">
          <Stat label="Uses" value={code.uses} hint={code.max_uses ? `of ${num(code.max_uses)}` : 'no limit'} />
          <Stat label="Members" value={code.members} />
          <Stat label="Still First Class" value={code.still_first_class} />
          <Stat label="Attempts" value={code.attempts} />
        </div>
        {code.kind === 'discount' && (
          <section className="a-impact">
            <div className="a-row a-row--between">
              <h3>In Stripe</h3>
              {isOwner && !code.stripe_promo_id && <button className="a-btn a-btn--sm" onClick={push} disabled={pushing}>{pushing ? 'Sending…' : code.stripe_error ? 'Retry sending to Stripe' : 'Send to Stripe'}</button>}
            </div>
            {code.stripe_error && <p className="a-field__error">{code.stripe_error}</p>}
            {!code.stripe_promo_id ? <p className="a-hint">Not in Stripe yet, so it can't be used at checkout.</p> : !stripeInfo.data ? <Loading /> : (
              <div className="a-stats">
                <Stat label="Used at checkout" value={stripeInfo.data.promotion?.times_redeemed ?? 0} hint={stripeInfo.data.promotion?.active ? 'active in Stripe' : 'off in Stripe'} />
                <Stat label="Revenue with code" value={money(stripeInfo.data.revenue)} />
                <Stat label="Discount given" value={money(stripeInfo.data.discount_given)} />
                <Stat label="Subscriptions still active" value={stripeInfo.data.subscriptions_active} hint={`${stripeInfo.data.subscriptions_canceled} canceled`} />
              </div>
            )}
          </section>
        )}
        {isOwner && !code.is_batch && ['active', 'paused'].includes(code.status) && (
          <div className="a-row">
            <Field label="Total uses"><input type="number" min={1} value={limit} onChange={e => setLimit(e.target.value)} /></Field>
            <button className="a-btn a-btn--sm" onClick={() => update({ max_uses: limit ? Number(limit) : null })}>Save limit</button>
          </div>
        )}
        {!d ? <Loading /> : (
          <>
            <section>
              <h3>Uses a day</h3>
              {d.daily.length ? <Bars data={d.daily.map(x => ({ day: x.day, value: x.uses }))} label="Uses per day" /> : <p className="a-empty">Not used yet.</p>}
            </section>
            <section>
              <h3>Attempts by result</h3>
              <BarList rows={Object.entries(d.attempts).map(([k, v]) => ({ label: ATTEMPT[k] || k, value: v }))} empty="No attempts yet." />
            </section>
            <section>
              <div className="a-row a-row--between"><h3>Who used it</h3><ExportButton name={`code-${code.label}-uses`} rows={d.redemptions} /></div>
              <Table rows={d.redemptions} onRow={x => go({ tab: 'members', member: x.user_id, code: null })} empty="Nobody yet." cols={[
                { key: 'email', label: 'Member' },
                { key: 'code', label: 'Code', render: x => <code>{x.code}</code> },
                { key: 'redeemed_at', label: 'Used', render: x => fmtDate(x.redeemed_at, true) },
                { key: 'plan_now', label: 'Plan now', render: x => x.plan_now === 'first_class' ? 'First Class' : 'Free' },
                { key: 'end', label: '', render: x => role !== 'analyst' && !x.ended_at
                  ? <button className="a-btn a-btn--ghost a-btn--sm" onClick={(e) => { e.stopPropagation(); setEnding(x) }}>End for them</button>
                  : x.ended_at ? <span className="a-muted">Ended</span> : null },
              ]} />
            </section>
            {code.is_batch && (
              <section>
                <div className="a-row a-row--between"><h3>Codes in this batch</h3><ExportButton name={`batch-${code.label}`} rows={d.codes} /></div>
                <p className="a-hint">{d.codes.filter(c => c.uses > 0).length} of {d.codes.length} used.</p>
              </section>
            )}
          </>
        )}
      </div>
      {ending && <ReasonModal title="End this member's use" confirm="End it" danger body="Their First Class from this code stops now. Nobody else is affected."
        onClose={() => setEnding(null)} onSubmit={(reason) => api.endRedemption(ending.id, reason).then(() => { r.reload(); onChanged() })} />}
    </Modal>
  )
}
