import { api } from '../api'
import { Card, Badge, Table, Bars, Loading, ErrorNote, useLoad, ExportButton, num, ago, fmtDate } from '../ui'

// Money → Statement (admin_financials): gross → refunds → Stripe fees → net from Stripe's own ledger, then every cost
// we know (AI priced from tokens, Google estimated, fixed bills) down to profit. Anything not connected yet is listed
// as a placeholder line so nothing is silently missing.

const usd = (n, digits = 2) => n == null ? '—' : `${Number(n) < 0 ? '−' : ''}$${Math.abs(Number(n)).toFixed(digits)}`
const small = (n) => n == null ? '—' : Math.abs(Number(n)) > 0 && Math.abs(Number(n)) < 0.1 ? usd(n, 4) : usd(n)
const FEATURE = { 'generate-guide': 'City guides', 'generate-phrases': 'Phrases and translate', 'generate-checklist': 'Packing lists',
  'goosey-discover': 'HONK', 'parse-booking-email': 'Paste and file import', 'receive-booking-email': 'Email import',
  'admin-experiment-ai': 'Experiment design (you)', unknown: 'Unknown' }

function Line({ label, value, sub, strong, muted, placeholder, indent }) {
  return (
    <li className={`a-ledger__row ${strong ? 'is-total' : ''} ${muted ? 'is-muted' : ''} ${indent ? 'is-indent' : ''}`}>
      <span className="a-ledger__label">{label}{sub && <small>{sub}</small>}</span>
      <span className="a-ledger__value">{placeholder ? <Badge tone="warn">{placeholder}</Badge> : value}</span>
    </li>
  )
}

export default function StatementPanel({ filters }) {
  const fin = useLoad(() => api.financials(filters), [filters])
  const d = fin.data
  if (fin.error) return <Card title="Statement" icon="receipt" className="a-span-12"><ErrorNote error={fin.error} onRetry={fin.reload} /></Card>
  if (!d) return <Card title="Statement" icon="receipt" className="a-span-12"><Loading /></Card>
  const s = d.stripe, c = d.costs, ds = d.deepseek
  const tokenDays = d.ai.estimated_days > 0

  return (
    <>
      <Card title="Statement" icon="receipt" className="a-span-7" subtitle={filters.label}
        actions={<>
          <Badge tone={s.livemode ? 'ok' : 'warn'}>{s.livemode ? 'Live' : 'Sandbox'}</Badge>
          <ExportButton name="statement-daily" rows={d.daily} />
        </>}>
        <ul className="a-ledger">
          <li className="a-ledger__head">Revenue</li>
          {s.connected ? (
            <>
              <Line label="Gross sales (Stripe)" value={usd(s.gross)} sub={`${num(s.transactions)} ledger entries`} />
              <Line label="Refunds" value={usd(s.refunds)} indent />
              {!!Number(s.disputes) && <Line label="Disputes and chargebacks" value={usd(s.disputes)} indent />}
              {s.fee_lines.length ? s.fee_lines.map(f => <Line key={f.label} label={f.label} value={usd(f.amount)} indent />)
                : <Line label="Stripe fees" value={usd(0)} indent />}
              {!!Number(s.other) && <Line label="Other adjustments" value={usd(s.other)} indent />}
              <Line strong label="Net from Stripe" value={usd(s.net)} />
            </>
          ) : (
            <Line label="Stripe ledger" placeholder="Not synced yet"
              sub="Needs Read on Balance transactions for the cockpit key; the sync fills it on the next refresh." />
          )}
          <Line label="App Store and Google Play" placeholder="Not connected" sub={d.stores.note} />

          <li className="a-ledger__head">Costs</li>
          <Line label="AI (DeepSeek, Gemini)" value={small(-c.ai)} indent
            sub={tokenDays ? `priced from tokens since ${fmtDate(d.ai.logged_since)}; ${d.ai.estimated_days} earlier day(s) at the flat rate` : 'priced from each call’s tokens'} />
          <Line label="City guides (AI)" value={small(-c.guides)} indent />
          <Line label="Google Maps" value={small(-c.google)} indent sub="calls × list price (estimate until the billing export is connected)" />
          {c.fixed.map(f => <Line key={f.label} label={f.label} value={usd(-f.amount)} indent sub={f.source} />)}
          {c.missing.map(m => <Line key={m.key} label={m.label} placeholder="Not tracked yet" sub={m.detail} indent muted />)}
          <Line strong label="Total costs" value={usd(-c.total)} />

          <li className="a-ledger__head" />
          <Line strong label="Profit" value={<span className={d.profit < 0 ? 'a-down' : 'a-up'}>{usd(d.profit)}</span>}
            sub="net from Stripe − all costs above (your own and test accounts included: they cost real money)" />
        </ul>
        {!!d.daily.length && (
          <div className="a-mini-charts">
            <span className="a-muted">Net from Stripe a day</span>
            <Bars data={d.daily.map(x => ({ day: x.day, value: Math.max(0, x.net) * 100 }))} label="Net revenue per day in cents" />
          </div>
        )}
      </Card>

      <Card title="Cash and balances" icon="wallet" className="a-span-5">
        <ul className="a-ledger">
          <li className="a-ledger__head">Stripe</li>
          <Line label="Paid out to your bank" value={usd(s.payouts)} sub={filters.label} />
          <Line label="Available in Stripe" value={s.balance ? usd(s.balance.available / 100) : '—'} />
          <Line label="Pending in Stripe" value={s.balance ? usd(s.balance.pending / 100) : '—'} sub={s.balance ? `as of ${ago(s.balance.at)}` : 'after the next sync'} />
          <Line label="Discounts given" value={usd(s.discounts)} sub="not collected, so not in gross" muted />
          <li className="a-ledger__head">DeepSeek</li>
          {ds.connected ? (
            <>
              <Line label="Account balance" value={`${usd(ds.latest.total)} ${ds.latest.currency === 'USD' ? '' : ds.latest.currency}`} sub={`checked ${ago(ds.latest.ts)}`} />
              <Line label="Spent (balance drop)" value={small(-ds.spent)} sub={`tracked since ${fmtDate(ds.tracked_since, true)}`} />
              <Line label="Spent (our token count)" value={small(-ds.tokens_usd)} sub="should match the balance drop; a gap means the rates need updating" />
            </>
          ) : <Line label="DeepSeek balance" placeholder="Not read yet" sub="Checked hourly with the API key the app already uses." />}
          <li className="a-ledger__head">Google Cloud</li>
          <Line label="Actual bill (Maps + Gemini)" placeholder="Not connected" sub="Turn on Cloud Billing → BigQuery export, then add GCP_BILLING_SA and GCP_BILLING_TABLE as Supabase secrets." />
        </ul>
      </Card>

      <Card title="AI by provider and model" icon="sparkles" className="a-span-6" actions={<ExportButton name="ai-providers" rows={d.ai.by_provider} />}>
        <Table rows={d.ai.by_provider} rowKey={r => `${r.provider}${r.model}`} empty="No AI calls logged in this window yet (logging started 24 Oct 2026)." cols={[
          { key: 'provider', label: 'Provider', render: r => <div className="a-who"><strong>{r.provider === 'deepseek' ? 'DeepSeek' : 'Gemini'}</strong><span>{r.model}</span></div> },
          { key: 'calls', label: 'Calls', num: true },
          { key: 'input_tokens', label: 'Tokens in', num: true },
          { key: 'cached_tokens', label: 'Cached', num: true },
          { key: 'output_tokens', label: 'Tokens out', num: true },
          { key: 'usd', label: 'Cost', num: true, render: r => small(r.usd) },
        ]} />
      </Card>
      <Card title="AI by feature" icon="list" className="a-span-6" actions={<ExportButton name="ai-features" rows={d.ai.by_feature} />}>
        <Table rows={d.ai.by_feature} rowKey={r => r.feature} empty="Nothing yet." cols={[
          { key: 'feature', label: 'Feature', render: r => FEATURE[r.feature] || r.feature },
          { key: 'calls', label: 'Calls', num: true },
          { key: 'avg_tokens', label: 'Avg tokens', num: true },
          { key: 'usd', label: 'Cost', num: true, render: r => small(r.usd) },
          { key: 'per_call', label: 'Per call', num: true, render: r => r.calls ? usd(r.usd / r.calls, 5) : '—', sortValue: r => r.calls ? r.usd / r.calls : 0 },
        ]} />
      </Card>
    </>
  )
}
