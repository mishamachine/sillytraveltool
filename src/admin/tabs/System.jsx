import { api } from '../api'
import { Card, Stat, Table, Loading, ErrorNote, useLoad, ExportButton, fmtDate, ago } from '../ui'

export default function System({ filters, go }) {
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
