import { useState } from 'react'
import { api } from '../api'
import { Card, Stat, Table, Badge, Loading, ErrorNote, useLoad, ExportButton, Segmented, fmtDate, ago, num } from '../ui'
import { USAGE_FLAGS, FLAG_LABEL, RECENT_KIND_LABEL, summarise, byAiCalls, canSeeUsage } from '../usage'

const FLAG_TONE = { over_ai_limit: 'danger', inbox_cap: 'danger', free_import_blocked: 'warn', far_above_median: 'warn' }

// Member usage for abuse watch: one row per member for a 7 or 30 day window (admin_usage_activity)
export default function UsageActivity({ go, role }) {
  const [days, setDays] = useState(7)
  const u = useLoad(() => (canSeeUsage(role) ? api.usageActivity(days) : null), [days, role])
  if (!canSeeUsage(role)) return null
  const d = u.data
  if (u.error && !d) return <ErrorNote error={u.error} onRetry={u.reload} />
  if (!d) return <Loading />
  const rows = byAiCalls(d.members)
  const open = (m) => go({ tab: 'members', mode: null, member: m.user_id })
  const lim = d.limits || {}

  return (
    <>
      <Card title="Abuse watch" icon="shield-check" className="a-span-12" subtitle={`last ${d.days} days`}
        actions={<Segmented size="sm" options={[[7, '7 days'], [30, '30 days']]} value={days} onChange={setDays} />}>
        <AbuseSummary d={d} />
        <h3 className="a-subhead">Latest inbox cap hits, refused inbox reads and blocked free imports</h3>
        <Table rowKey={r => r.id} rows={d.recent} empty="None recorded." onRow={r => r.user_id && open(r)} cols={[
          { key: 'ts', label: 'When', render: r => fmtDate(r.ts, true), sortValue: r => r.ts },
          { key: 'email', label: 'Member', render: r => r.email || '—' },
          { key: 'kind', label: 'What', render: r => <Badge tone={r.kind === 'inbox_cap_hit' ? 'danger' : r.kind === 'inbox_quota_refused' ? 'neutral' : 'warn'}>{RECENT_KIND_LABEL[r.kind] || r.kind}</Badge> },
          { key: 'fn', label: 'Function', render: r => <code>{r.fn}</code> },
        ]} />
        <p className="a-hint">These two kinds appear once the inbox cap and free-import logging are live; until then the list stays empty and cap hits are
          still caught from the daily inbox counter.</p>
      </Card>

      <Card title="Usage activity" icon="activity" className="a-span-12" subtitle={`${rows.length} members, most AI calls first`}
        actions={<ExportButton name={`usage-${d.days}d`} rows={rows.map(({ flags, ...m }) => ({ ...m, flags: (flags || []).join(' ') }))} />}>
        <ErrorNote error={u.error} onRetry={u.reload} />
        <Table rowKey={m => m.user_id} rows={rows} empty="No members yet." onRow={open} cols={[
          { key: 'email', label: 'Email', render: m => <div className="a-who"><strong>{m.email}</strong>{m.internal && <span>Test account</span>}</div> },
          { key: 'joined', label: 'Joined', render: m => <span className="a-nowrap">{fmtDate(m.joined)}</span>, sortValue: m => m.joined || '' },
          { key: 'last_seen', label: 'Last seen', render: m => ago(m.last_seen), sortValue: m => m.last_seen || '' },
          { key: 'plan', label: 'Plan', render: m => <Badge tone={m.plan === 'first_class' ? 'accent' : 'neutral'}>{m.plan === 'first_class' ? 'First Class' : 'Free'}</Badge> },
          { key: 'ai_calls', label: `AI attempts (${d.days}d)`, num: true },
          { key: 'ai_today', label: 'AI attempts today', num: true },
          { key: 'forwarded_imports', label: 'Forwarded imports', num: true },
          { key: 'in_app_imports', label: 'In-app bookings', num: true },
          { key: 'google_calls', label: 'Google calls', num: true },
          { key: 'errors', label: 'Errors', num: true },
          { key: 'inbox_cap_hits', label: 'Inbox cap hits', num: true, render: m => num(Math.max(m.inbox_cap_hits || 0, m.inbox_days_over || 0)), sortValue: m => Math.max(m.inbox_cap_hits || 0, m.inbox_days_over || 0) },
          { key: 'inbox_refusals', label: 'Inbox reads refused', num: true },
          { key: 'import_blocks', label: 'Import blocks', num: true },
          { key: 'flags', label: 'Flags', render: m => (m.flags || []).length
            ? <span className="a-flags">{m.flags.map(f => <Badge key={f} tone={FLAG_TONE[f] || 'warn'}>{FLAG_LABEL[f] || f}</Badge>)}</span> : <span className="a-muted">—</span>,
            sortValue: m => (m.flags || []).length },
        ]} />
        <p className="a-hint">Flags: over AI limit = a day above the per-member daily limit (AI {lim.ai_daily}, guide {lim.guide_daily}); inbox cap hit = a logged
          cap hit, or a day above {lim.inbox_daily} AI email reads; import blocked = a free-plan import refused; far above median = at least 5 times the
          median member with any AI attempt ({num(d.median_ai_calls)} now), and at least 50 attempts. AI attempts count the app, guide and inbox counters, which go up before the limit check, so refused attempts are included. In-app bookings are booking rows added through the in-app import. Inbox reads refused (kill switch, member status, project-wide cap) are shown apart and are not cap hits. Click a
          row for the member.</p>
      </Card>
    </>
  )
}

export function AbuseSummary({ d }) {
  const s = summarise(d.members)
  return (
    <div className="a-stats">
      <Stat label="Members flagged" value={s.flagged} invert />
      {USAGE_FLAGS.map(([k, label]) => <Stat key={k} label={label} value={s[k]} invert />)}
    </div>
  )
}

// Compact card for the System tab: the same counts, with a way into the full view
export function AbuseWatchCard({ go, role }) {
  const u = useLoad(() => (canSeeUsage(role) ? api.usageActivity(7) : null), [role])
  if (!canSeeUsage(role)) return null
  return (
    <Card title="Abuse watch" icon="shield-check" className="a-span-12" subtitle="last 7 days"
      actions={<button className="a-btn a-btn--ghost a-btn--sm" onClick={() => go({ tab: 'members', mode: 'usage' })}>Open usage activity</button>}>
      {u.error && !u.data ? <ErrorNote error={u.error} onRetry={u.reload} /> : !u.data ? <Loading /> : <AbuseSummary d={u.data} />}
    </Card>
  )
}
