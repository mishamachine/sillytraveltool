import { api } from '../api'
import { Card, Bars, BarList, Sized, Loading, ErrorNote, useLoad, ExportButton, STAGES, num } from '../ui'

// Step 1: our own data (sign-ups, activation, sources, trip stages). GA4 visits, campaigns and social come in steps 3 and 7.
export default function Growth({ filters, go }) {
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
      <Card title="Funnel" icon="filter" className="a-span-7" subtitle={`members who joined in the last ${filters.days} days`}
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
        <p className="a-empty">Instagram, Facebook and TikTok (through Postiz, the Meta Graph API and the TikTok API) and UTM campaign tracking are build step 7. You'll need: a Postiz API key, a Meta Business account linked to your Facebook Page and Instagram, and a TikTok developer app.</p>
      </Card>
    </div>
  )
}
