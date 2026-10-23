import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore, useTripsStore } from '../../store'
import { currentPlace } from '../../lib/stops'
import { currencyForCountry } from '../../lib/currencies'
import { fetchWithTimeout } from '../../lib/http'
import { track } from '../../lib/analytics'
import { Card, Field, IconButton, Sheet, ListRow, Section, Text, Stack, Icon, Banner, Button } from '../../ui'
import { ALL_CURRENCIES, TOP_PAIRS, getCurrencyName } from './data'

const QUICK = [5, 10, 50, 100]

export function formatMoney(value, code) {
  if (value == null || isNaN(value)) return '–'
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code, maximumFractionDigits: value >= 1000 ? 0 : 2 }).format(value)
  } catch { return `${value.toFixed(2)} ${code}` }
}

/** Sheet listing currencies: popular first, then all, with search by code or name. */
function CurrencyPicker({ title, exclude, popular, rates, amount, onPick, onClose }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const matches = (code) => !q || code.toLowerCase().includes(q) || getCurrencyName(code).toLowerCase().includes(q)
  const popularShown = popular.filter(matches)
  const others = ALL_CURRENCIES
    .filter(c => c.code !== exclude && !popular.includes(c.code) && matches(c.code))
    .sort((a, b) => a.code.localeCompare(b.code))
  const row = (code) => (
    <ListRow key={code} onClick={() => onPick(code)}
      leading={<span className="tools-code">{code}</span>}
      title={getCurrencyName(code)}
      trailing={rates?.[code] ? formatMoney(parseFloat(amount || 0) * rates[code], code) : undefined} />
  )
  return (
    <Sheet title={title} onClose={onClose} size="tall">
      <Field label="Search currencies" hideLabel icon="search" type="search" placeholder="Search any currency"
        value={query} onChange={e => setQuery(e.target.value)} autoComplete="off" />
      {popularShown.length > 0 && (
        <Section title="Popular"><Card variant="group">{popularShown.map(row)}</Card></Section>
      )}
      {others.length > 0 && (
        <Section title="All currencies"><Card variant="group">{others.map(c => row(c.code))}</Card></Section>
      )}
      {!popularShown.length && !others.length && (
        <Text tone="secondary" align="center">No currency matches “{query.trim()}”</Text>
      )}
    </Sheet>
  )
}

export default function CurrencyTool() {
  const { profile, user } = useAuthStore()
  const { trips } = useTripsStore()
  const homeCurrency = profile?.home_currency || 'USD'

  // Default "from": current/next trip's destination currency, else home currency
  const destCurrency = currencyForCountry(currentPlace(trips)?.country_code)
  const defaultFrom = destCurrency || homeCurrency
  const defaultTo = defaultFrom !== homeCurrency ? homeCurrency : (TOP_PAIRS[homeCurrency] || TOP_PAIRS['USD'])[0]

  const [amount, setAmount] = useState('100')
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [rates, setRates] = useState(null)
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [error, setError] = useState(null)
  const [picking, setPicking] = useState(null) // 'from' | 'to' | null
  const latestBase = useRef(null)

  // Popular list: home currency first (when converting from elsewhere), then common pairs for `from`
  const topFive = [...new Set([
    ...(from !== homeCurrency ? [homeCurrency] : []),
    ...(TOP_PAIRS[from] || TOP_PAIRS[homeCurrency] || TOP_PAIRS['USD']),
  ])].filter(c => c !== from).slice(0, 5)

  useEffect(() => {
    setFrom(defaultFrom)
    setTo(defaultTo)
  }, [defaultFrom, defaultTo])

  useEffect(() => { fetchRates(from) }, [from])

  const fetchRates = async (base) => {
    latestBase.current = base
    setLoading(true)
    setError(null)
    try {
      const res = await fetchWithTimeout(`https://open.er-api.com/v6/latest/${base}`, {}, 8000)
      const data = await res.json()
      if (latestBase.current !== base) return // a newer request superseded this one
      if (data.result === 'success') {
        setRates(data.rates)
        setLastUpdated(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
        track('currency_converted', { from: base }, 'toolbox')
        // Stat increment — fire and forget; never block the result on it
        if (user?.id) {
          supabase.rpc('increment_user_stat', { p_user_id: user.id, p_field: 'currency_lookups', p_amount: 1 })
            .then(() => {}, () => {})
        }
      } else {
        setRates(null)
        setError('Could not load rates')
      }
    } catch (e) {
      if (latestBase.current === base) { setRates(null); setError(e?.name === 'TimeoutError' ? 'Rates timed out' : 'No connection') }
    } finally {
      if (latestBase.current === base) setLoading(false)
    }
  }

  const rate = rates?.[to]
  const result = rate ? parseFloat(amount || 0) * rate : null
  const swap = () => { setFrom(to); setTo(from) }

  return (
    <Stack gap={4}>
      <div className="tools-convert">
        <Card variant="raised" className="tools-convert__box">
          <button type="button" className="tools-ccy" onClick={() => setPicking('from')} aria-label={`Convert from ${getCurrencyName(from)}. Change currency`}>
            {from}<Icon name="chevron-down" size={16} strokeWidth={2} />
          </button>
          <label className="sr-only" htmlFor="ccy-amount">Amount in {getCurrencyName(from)}</label>
          <input id="ccy-amount" className="tools-amount" type="text" inputMode="decimal" value={amount}
            onChange={e => setAmount(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'))} />
        </Card>
        <IconButton icon="exchange" label="Swap currencies" variant="accent" className="tools-convert__swap" onClick={swap} />
        <Card variant="raised" className="tools-convert__box">
          <button type="button" className="tools-ccy" onClick={() => setPicking('to')} aria-label={`Convert to ${getCurrencyName(to)}. Change currency`}>
            {to}<Icon name="chevron-down" size={16} strokeWidth={2} />
          </button>
          <output className="tools-amount" aria-live="polite" htmlFor="ccy-amount">
            {loading ? '…' : result != null ? result.toFixed(2) : '–'}
          </output>
        </Card>
      </div>

      {error ? (
        <Banner tone="danger" icon="alert-circle" title={error} role="alert"
          action={<Button size="sm" onClick={() => fetchRates(from)}>Retry</Button>}>Check your connection, then try again.</Banner>
      ) : (
        <Stack row justify="between" className="tools-rate">
          <Text variant="micro" tone="muted" as="span">
            {rate ? `1 ${from} = ${rate.toFixed(4)} ${to}` : 'Loading rates'}{from === destCurrency ? ` · ${from} is this trip's currency` : ''}
          </Text>
          {lastUpdated && <Text variant="micro" tone="muted" as="span">{lastUpdated}</Text>}
        </Stack>
      )}

      {rate && (
        <Section title="Quick glance">
          <Card variant="group">
            {QUICK.map(n => (
              <ListRow key={n} as="div" title={formatMoney(n, from)} trailing={formatMoney(n * rate, to)} className="tools-quick" />
            ))}
          </Card>
        </Section>
      )}

      <Button variant="ghost" icon="search" onClick={() => setPicking('to')}>Search any currency</Button>

      {picking && (
        <CurrencyPicker
          title={picking === 'from' ? 'Convert from' : 'Convert to'}
          exclude={picking === 'from' ? to : from}
          popular={picking === 'from' ? [...new Set([destCurrency, homeCurrency, ...TOP_PAIRS.USD].filter(c => c && c !== to))].slice(0, 6) : topFive}
          rates={picking === 'to' ? rates : null}
          amount={amount}
          onPick={(code) => { if (picking === 'from') setFrom(code); else setTo(code); setPicking(null) }}
          onClose={() => setPicking(null)}
        />
      )}
    </Stack>
  )
}
