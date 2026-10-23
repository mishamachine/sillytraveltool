import { useEffect, useState } from 'react'
import Icon from '../../ui/icons/Icon'
import { api } from '../api'
import { Card, Stat, Table, Badge, Bars, Loading, ErrorNote, useLoad, Modal, Field, Segmented, ExportButton, fmtDate, ago, STAGES, STAGE_LABEL } from '../ui'
import EmailComposer from './EmailComposer'

// Cohorts: saved groups of members. "Rules" cohorts update themselves (everyone matching, today); "fixed" cohorts are a
// list you choose. Sized every night (cohort_snapshots) so each one can be tracked over time.

// Rule fields the builder offers; values come from the Audience distribution so you pick from what exists
export const RULES = [
  ['stage', 'Trip stage'], ['plan', 'Plan'], ['status', 'Account status'], ['affluence', 'Affluence'], ['traveller_type', 'Travels as'],
  ['trip_style', 'Trip style'], ['planning_style', 'Planning'], ['persona', 'Uses STT as'], ['channel', 'Books through'],
  ['region', 'Visits region'], ['country', 'Country'], ['main_platform', 'Main platform'], ['platform_mix', 'Platform mix'], ['source', 'Came from'],
]
const STATIC_VALUES = {
  stage: STAGES.map(([v, l]) => [v, l]), plan: [['free', 'Free'], ['first_class', 'First Class']],
  status: [['active', 'Active'], ['warning', 'Warned'], ['restricted', 'Restricted'], ['suspended', 'Suspended'], ['banned', 'Banned']],
}
const ruleText = (rules) => Object.entries(rules || {}).filter(([k, v]) => v !== '' && v != null && k !== 'include_internal')
  .map(([k, v]) => `${RULES.find(r => r[0] === k)?.[1] || k.replace(/_/g, ' ')}: ${k === 'stage' ? STAGE_LABEL[v] || v : v}`).join(' · ') || 'Everyone'

export default function Cohorts({ role, go, filters }) {
  const list = useLoad(() => api.cohorts(), [filters.tick])
  const [editing, setEditing] = useState(null)
  const [open, setOpen] = useState(null)
  const canEdit = role !== 'analyst'
  return (
    <>
      <Card title="Cohorts" icon="users" className="a-span-12" subtitle="saved groups, sized every night"
        actions={canEdit && <button className="a-btn a-btn--primary a-btn--sm" onClick={() => setEditing({ kind: 'rules', rules: {} })}><Icon name="plus" size={16} /> New cohort</button>}>
        <ErrorNote error={list.error} onRetry={list.reload} />
        {!list.data ? <Loading /> : !list.data.length ? (
          <p className="a-empty">No cohorts yet. Make one here, or filter the member list and press "Save as cohort".</p>
        ) : (
          <div className="a-cohorts">
            {list.data.map(c => (
              <button key={c.id} className="a-cohort" onClick={() => setOpen(c)}>
                <div className="a-exp__title"><strong>{c.name}</strong><Badge>{c.kind === 'fixed' ? 'Fixed list' : 'Rules'}</Badge></div>
                <p className="a-small">{c.kind === 'fixed' ? `${c.fixed_count} chosen members` : ruleText(c.rules)}</p>
                <div className="a-cohort__nums">
                  <span><strong>{c.now?.size ?? 0}</strong> members</span><span><strong>{c.now?.active_7d ?? 0}</strong> active this week</span>
                  <span><strong>{c.now?.paying ?? 0}</strong> paying</span><span><strong>{c.now?.emails_ok ?? 0}</strong> can be emailed</span>
                </div>
                {c.history.length > 1 && <Bars height={36} data={c.history.map(h => ({ day: h.day, value: h.size }))} label="Size over time" />}
              </button>
            ))}
          </div>
        )}
      </Card>
      {editing && <CohortEditor c={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload() }} />}
      {open && <CohortPanel c={open} role={role} go={go} onClose={() => setOpen(null)} onEdit={() => { setEditing(open); setOpen(null) }} onChanged={list.reload} />}
    </>
  )
}

export function CohortEditor({ c, onClose, onSaved }) {
  const [name, setName] = useState(c.name || '')
  const [description, setDescription] = useState(c.description || '')
  const [rules, setRules] = useState(c.rules || {})
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState(null)
  const audience = useLoad(() => api.audience({ excludeInternal: false }), [])
  const fixed = c.kind === 'fixed'

  useEffect(() => {
    if (fixed) return
    const id = setTimeout(() => api.cohortPreview(rules).then(setPreview, () => setPreview(null)), 300)
    return () => clearTimeout(id)
  }, [JSON.stringify(rules), fixed]) // eslint-disable-line react-hooks/exhaustive-deps

  const options = (k) => STATIC_VALUES[k] || (audience.data?.dist?.[k === 'region' ? 'region' : k] || []).map(x => [x.value, `${x.value} (${x.n})`])
  const setRule = (k, v) => setRules(r => { const n = { ...r }; if (v === '' || v == null) delete n[k]; else n[k] = v; return n })
  const save = async () => {
    if (!name.trim()) { setError('Give it a name'); return }
    try { await api.cohortSave({ id: c.id || null, name: name.trim(), description, kind: c.kind || 'rules', rules, ...(c.member_ids ? { member_ids: c.member_ids } : {}) }); onSaved() } catch (e) { setError(e.message) }
  }
  return (
    <Modal wide title={c.id ? `Edit ${c.name}` : fixed ? 'Save as a fixed list' : 'New cohort'} onClose={onClose}
      footer={<>
        {c.id && <button className="a-btn a-btn--ghost a-link--danger" onClick={async () => { await api.cohortSave({ id: c.id, archived: true }); onSaved() }}>Archive</button>}
        <button className="a-btn a-btn--ghost" onClick={onClose}>Cancel</button><button className="a-btn a-btn--primary" onClick={save}>Save cohort</button>
      </>}>
      <div className="a-form">
        <div className="a-form--2">
          <Field label="Name" error={error}><input value={name} onChange={e => { setName(e.target.value); setError(null) }} maxLength={80} placeholder="Premium travellers just back" /></Field>
          <Field label="Description (optional)"><input value={description} onChange={e => setDescription(e.target.value)} maxLength={500} /></Field>
        </div>
        {fixed ? <p>{(c.member_ids || []).length} members, chosen now. Add or remove people later from their member page.</p> : (
          <>
            <div className="a-rules-grid">
              {RULES.map(([k, label]) => (
                <Field key={k} label={label}>
                  <select value={rules[k] ?? ''} onChange={e => setRule(k, e.target.value)}>
                    <option value="">Any</option>{options(k).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
              ))}
              <Field label="Joined after"><input type="date" value={rules.joined_after || ''} onChange={e => setRule('joined_after', e.target.value)} /></Field>
              <Field label="Joined before"><input type="date" value={rules.joined_before || ''} onChange={e => setRule('joined_before', e.target.value)} /></Field>
              <Field label="Seen in the last (days)"><input type="number" min={1} value={rules.seen_within_days || ''} onChange={e => setRule('seen_within_days', e.target.value ? Number(e.target.value) : '')} /></Field>
              <Field label="At least (trips)"><input type="number" min={0} value={rules.min_trips ?? ''} onChange={e => setRule('min_trips', e.target.value === '' ? '' : Number(e.target.value))} /></Field>
              <Field label="Has tag"><input value={rules.tag || ''} onChange={e => setRule('tag', e.target.value.toLowerCase())} placeholder="vip" /></Field>
              <Field label="Uses platform"><select value={rules.platform || ''} onChange={e => setRule('platform', e.target.value)}>
                <option value="">Any</option>{['web', 'android', 'ios'].map(p => <option key={p} value={p}>{p}</option>)}</select></Field>
            </div>
            <label className="a-check"><input type="checkbox" checked={!!rules.include_internal} onChange={e => setRule('include_internal', e.target.checked || '')} /> Include owner and test accounts</label>
            <div className="a-impact"><strong>{preview ? preview.size : '…'}</strong> members match today{preview ? `, ${preview.emails_ok} can get marketing emails` : ''}. Rules cohorts update themselves as members change.</div>
          </>
        )}
      </div>
    </Modal>
  )
}

function CohortPanel({ c, role, go, onClose, onEdit, onChanged }) {
  const members = useLoad(() => api.cohortMembers(c.id), [c.id])
  const [emailing, setEmailing] = useState(false)
  const rows = members.data || []
  return (
    <Modal wide title={c.name} onClose={onClose}
      footer={<>
        {role !== 'analyst' && <button className="a-btn a-btn--ghost" onClick={onEdit}>Edit</button>}
        <ExportButton name={`cohort-${c.name.toLowerCase().replace(/\W+/g, '-')}`} rows={rows.map(({ tags, regions, platforms, ...m }) => ({ ...m, tags: (tags || []).join(' '), platforms: (platforms || []).join(' ') }))} />
        {role !== 'analyst' && <button className="a-btn a-btn--primary" disabled={!rows.length || rows.length > 200} onClick={() => setEmailing(true)}><Icon name="mail" size={16} /> Email this cohort</button>}
      </>}>
      <div className="a-stack">
        <p className="a-small">{c.kind === 'fixed' ? 'Fixed list' : ruleText(c.rules)}{c.description ? ` · ${c.description}` : ''}</p>
        <div className="a-stats">
          <Stat label="Members" value={c.now?.size ?? 0} prev={c.history.at(-8)?.size} hint="vs a week ago" />
          <Stat label="Active this week" value={c.now?.active_7d ?? 0} />
          <Stat label="Paying" value={c.now?.paying ?? 0} />
          <Stat label="Can be emailed" value={c.now?.emails_ok ?? 0} />
          <Stat label="Average health" value={c.now?.avg_health ?? '—'} />
        </div>
        {c.history.length > 1 ? <div><span className="a-muted">Size over time</span><Bars height={60} data={c.history.map(h => ({ day: h.day, value: h.size }))} label="Cohort size" /></div>
          : <p className="a-hint">Sized every night; the trend appears from tomorrow.</p>}
        {!members.data ? <Loading /> : (
          <Table rows={rows} onRow={m => { onClose(); go({ tab: 'members', member: m.id }) }} empty="Nobody in this cohort right now." cols={[
            { key: 'name', label: 'Member', render: m => <div className="a-who"><strong>{m.name || '—'}</strong><span>{m.email}</span></div> },
            { key: 'stage', label: 'Stage', render: m => STAGE_LABEL[m.stage] || m.stage },
            { key: 'country', label: 'Where', render: m => m.country || '—' },
            { key: 'main_platform', label: 'Main platform', render: m => m.main_platform || '—' },
            { key: 'plan', label: 'Plan', render: m => m.plan === 'first_class' ? 'First Class' : 'Free' },
            { key: 'last_seen', label: 'Last seen', render: m => ago(m.last_seen), sortValue: m => m.last_seen || '' },
            ...(c.kind === 'fixed' && role !== 'analyst' ? [{ key: 'remove', label: '', render: m => <button className="a-btn a-btn--ghost a-btn--sm"
              onClick={(e) => { e.stopPropagation(); api.cohortMember(c.id, m.id, false).then(() => { members.reload(); onChanged() }) }}>Remove</button> }] : []),
          ]} />
        )}
        <p className="a-hint">Created {fmtDate(c.created_at)}. Emails to a cohort follow the usual rules: marketing only reaches people who opted in.</p>
      </div>
      {emailing && <EmailComposer to={{ userIds: rows.map(m => m.id), label: `cohort "${c.name}" (${rows.length})` }} role={role} onClose={() => setEmailing(false)} onSent={onChanged} />}
    </Modal>
  )
}
