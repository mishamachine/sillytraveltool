import { useState } from 'react'
import { api } from '../api'
import EmailComposer from './EmailComposer'
import { AbuseWatchCard } from './UsageActivity'
import { Card, Stat, Table, Loading, ErrorNote, useLoad, ExportButton, Modal, Field, fmtDate, ago } from '../ui'

export default function System({ filters, go, role }) {
  const s = useLoad(() => api.system(filters), [filters])
  const d = s.data
  if (s.error) return <ErrorNote error={s.error} onRetry={s.reload} />
  if (!d) return <Loading />
  const ai = d.ai_usage.reduce((acc, x) => { acc[x.kind] = (acc[x.kind] || 0) + Number(x.calls); return acc }, {})

  return (
    <div className="a-grid">
      <Card title="Health" icon="shield-check" className="a-span-12">
        <div className="a-stats">
          <Stat label="Server function errors" value={d.function_errors.reduce((n, e) => n + e.n, 0)} invert />
          <Stat label="AI calls (personal)" value={ai.ai || 0} />
          <Stat label="Guide sections written" value={ai.guide || 0} />
          <Stat label="AI limit hits" value={d.quota_hits} invert />
          <Stat label="Live moderation steps" value={d.flags.length} />
        </div>
        <p className="a-hint">Server functions start reporting their errors here as each one is next deployed. Sentry turns on once its key (VITE_SENTRY_DSN) is set.</p>
      </Card>

      <AbuseWatchCard go={go} />

      <Card title="Server function errors" icon="alert-triangle" className="a-span-6" actions={<ExportButton name="function-errors" rows={d.function_errors} />}>
        <Table rowKey={(e, i) => i} rows={d.function_errors} empty="No server errors recorded." cols={[
          { key: 'fn', label: 'Function' }, { key: 'kind', label: 'Kind' }, { key: 'status', label: 'Status' },
          { key: 'n', label: 'Count', num: true }, { key: 'last', label: 'Last', render: e => ago(e.last) },
        ]} />
      </Card>

      <Card title="Admins" icon="lock" className="a-span-6">
        <Table rowKey={a => a.email} rows={d.admins} cols={[
          { key: 'email', label: 'Account' }, { key: 'role', label: 'Role' }, { key: 'added_at', label: 'Since', render: a => fmtDate(a.added_at) },
        ]} />
        <p className="a-hint">Owner: everything. Support: notes, warnings, up to 30 days of First Class, suspensions up to 7 days. Analyst: read-only, emails masked.</p>
      </Card>

      <FormerMembers role={role} />

      <Card title="Audit log" icon="clipboard" className="a-span-12" subtitle="every admin action, newest first" actions={<ExportButton name="audit" rows={d.audit} />}>
        <Table rowKey={(a, i) => i} rows={d.audit} empty="No admin actions yet." onRow={a => a.target && go({ tab: 'members', member: a.target })} cols={[
          { key: 'ts', label: 'When', render: a => fmtDate(a.ts, true), sortValue: a => a.ts },
          { key: 'action', label: 'Action', render: a => <code>{a.action}</code> },
          { key: 'email', label: 'Member', render: a => a.email || '—' },
          { key: 'detail', label: 'Detail', render: a => <span className="a-mono-sm">{Object.entries(a.detail || {}).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')}</span> },
        ]} />
      </Card>
    </div>
  )
}

// Fresh start (owner, 2026-10-23): keep only the owner's accounts, save everyone else's name and email first
function FormerMembers({ role }) {
  const former = useLoad(() => api.formerMembers(), [])
  const [open, setOpen] = useState(false)
  const [emailing, setEmailing] = useState(false)
  return (
    <Card title="Former members" icon="mail" className="a-span-12" subtitle="names and emails kept for later notes, after a fresh start"
      actions={<>
        <ExportButton name="former-members" rows={former.data} />
        {role === 'owner' && !!former.data?.length && <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => setEmailing(true)}>Email them</button>}
        {role === 'owner' && <button className="a-btn a-btn--danger a-btn--sm" onClick={() => setOpen(true)}>Start fresh…</button>}
      </>}>
      <ErrorNote error={former.error} onRetry={former.reload} />
      {!former.data ? <Loading /> : (
        <Table rowKey={f => f.email} rows={former.data} empty="Nobody saved yet." cols={[
          { key: 'name', label: 'Name', render: f => f.name || '—' }, { key: 'email', label: 'Email' },
          { key: 'joined', label: 'Joined', render: f => fmtDate(f.joined), sortValue: f => f.joined },
          { key: 'last_seen', label: 'Last seen', render: f => ago(f.last_seen), sortValue: f => f.last_seen || '' },
          { key: 'trips', label: 'Trips', num: true }, { key: 'was_internal', label: 'Test account', render: f => f.was_internal ? 'Yes' : '' },
          { key: 'marketing_consent', label: 'Marketing consent', render: f => f.marketing_consent === 'unknown' ? 'Not given' : f.marketing_consent },
        ]} />
      )}
      <p className="a-hint">You can write to them about the relaunch. Marketing emails need their consent first in the EU, UK and Canada.</p>
      {open && <FreshStart onClose={() => setOpen(false)} onDone={former.reload} />}
      {emailing && <EmailComposer to={{ formerAll: true, label: 'former members' }} template="relaunch" role={role} onClose={() => setEmailing(false)} />}
    </Card>
  )
}

function FreshStart({ onClose, onDone }) {
  const preview = useLoad(() => api.freshStartPreview(), [])
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const p = preview.data
  const run = async () => {
    setBusy(true); setError(null)
    try { setResult(await api.freshStart(confirm)); onDone() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal wide title="Start fresh" onClose={onClose}
      footer={result ? <button className="a-btn a-btn--primary" onClick={onClose}>Done</button> : <>
        <button className="a-btn a-btn--ghost" onClick={onClose}>Cancel</button>
        <button className="a-btn a-btn--danger" onClick={run} disabled={busy || confirm !== 'START FRESH' || !p?.remove?.length}>{busy ? 'Removing…' : `Remove ${p?.remove?.length ?? ''} accounts`}</button>
      </>}>
      {result ? <p>{result.removed} accounts removed. {result.saved} names and emails are saved under Former members.</p> : !p ? <Loading /> : (
        <div className="a-form">
          <p><strong>This can't be undone.</strong> Each account below is deleted with its trips, bookings, documents, loyalty cards,
            stats and activity. Your Supabase plan has no backups. Names and emails are saved first. Anything they added to a trip
            you keep moves to you.</p>
          <p>Kept: {(p.keep || []).join(', ')}</p>
          <Table rowKey={x => x.email} rows={p.remove} cols={[
            { key: 'email', label: 'Removed' }, { key: 'trips', label: 'Trips', num: true }, { key: 'bookings', label: 'Bookings', num: true },
            { key: 'saved', label: 'Email saved', render: x => x.saved ? 'Yes' : 'Will be saved' },
          ]} />
          <Field label="Type START FRESH to confirm"><input value={confirm} onChange={e => setConfirm(e.target.value.toUpperCase())} /></Field>
          {error && <p className="a-field__error">{error}</p>}
        </div>
      )}
    </Modal>
  )
}
