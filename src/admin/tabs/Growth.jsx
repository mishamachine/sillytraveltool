import { api } from '../api'
import { Card, Bars, BarList, Sized, Loading, ErrorNote, useLoad, ExportButton, STAGES, num } from '../ui'
import BetaPanel from './BetaPanel'

// Step 1: our own data (sign-ups, activation, sources, trip stages). GA4 visits, campaigns and social come in steps 3 and 7.
// Social: not connected (Nov 2026); the card says what it needs.
export default function Growth({ filters, go, role }) {
  const pulse = useLoad(() => api.pulse(filters), [filters])
  const members = useLoad(() => api.members({}, filters), [filters])
  if (pulse.error || members.error) return <ErrorNote error={pulse.error || members.error} onRetry={() => { pulse.reload(); members.reload() }} />
  if (!pulse.data || !members.data) return <Loading />
  const m = members.data
  const joined = m.filter(x => new Date(x.joined) >= new Date(filters.from))
  const steps = [
    ['Signed up', joined.length],
    ['Created a trip', joined.filter(x => x.trips > 0).length],
    ['Added a booking', joined.filter(x => x.bookings > 0).length],
    ['First Class', joined.filter(x => x.plan === 'first_class').length],
  ]
  const sources = Object.entries(m.reduce((acc, x) => { const k = x.source || 'Direct or unknown'; acc[k] = (acc[k] || 0) + 1; return acc }, {}))
    .sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))

  return (
    <div className="a-grid">
      <BetaPanel filters={filters} role={role} />

      <Card title="Funnel" icon="filter" className="a-span-7" subtitle={`members who joined ${filters.label.startsWith('last') || filters.label === 'today' ? filters.label : `in ${filters.label}`}`}
        actions={<ExportButton name="funnel" rows={steps.map(([step, n]) => ({ step, members: n }))} />}>
        <ol className="a-funnel">
          {steps.map(([name, n], i) => (
            <li key={name}>
              <span className="a-funnel__name">{name}</span>
              <span className="a-funnel__bar"><Sized vars={{ '--fill': `${steps[0][1] ? Math.max(2, (n / steps[0][1]) * 100) : 0}%` }} /></span>
              <span className="a-funnel__n">{num(n)}{i > 0 && steps[i - 1][1] ? <small> {Math.round((n / steps[i - 1][1]) * 100)}%</small> : null}</span>
            </li>
          ))}
        </ol>
        <p className="a-hint">Website visits (top of the funnel) need the GA4 Data API key, step 3. Paywall steps appear when the paywall ships.</p>
      </Card>

      <Card title="Where members come from" icon="globe" className="a-span-5">
        <BarList rows={sources} />
        <p className="a-hint">First touch (UTM or referrer) is recorded from this release on. Earlier members show as unknown.</p>
      </Card>

      <Card title="Sign-ups a day" icon="chart" className="a-span-7">
        <Bars height={90} data={pulse.data.series.map(d => ({ day: d.day, value: d.signups }))} label="Sign-ups per day" />
      </Card>

      <Card title="Trip stages" icon="compass" className="a-span-5" onOpen={() => go({ tab: 'members' })}>
        <BarList rows={STAGES.map(([s, label]) => ({ label, value: m.filter(x => x.stage === s).length, onClick: () => go({ tab: 'members', stage: s }) }))} />
      </Card>

      <Card title="Social and campaigns" icon="megaphone" className="a-span-12">
        <p className="a-empty">Not connected yet. Posts are scheduled in each platform's own scheduler, so no follower, reach or engagement numbers reach our database. Waitlist sign-ups by platform are in Beta waitlist above. To show social numbers here we need read access to Meta (Instagram and the Facebook Page, through the Meta business portfolio), YouTube and LinkedIn; TikTok's API needs a business account.</p>
      </Card>
    </div>
  )
}
