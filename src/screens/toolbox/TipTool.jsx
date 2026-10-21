import { useState } from 'react'
import { useAuthStore, useTripsStore } from '../../store'
import { findCurrentOrNextTrip } from '../../lib/dates'
import { currencyForCountry } from '../../lib/currencies'
import { Card, IconButton, SegmentedControl, Banner, Text, Stack, Field } from '../../ui'
import { formatMoney } from './CurrencyTool'

const PRESETS = ['10', '15', '18', '20']

export default function TipTool() {
  const profile = useAuthStore(s => s.profile)
  const trips = useTripsStore(s => s.trips)
  const trip = findCurrentOrNextTrip(trips).trip
  const currency = currencyForCountry(trip?.destination_country_code) || profile?.home_currency || 'USD'

  const [bill, setBill] = useState('50')
  const [tipPct, setTipPct] = useState(18)
  const [split, setSplit] = useState(1)

  const billNum = parseFloat(bill || 0) || 0
  const tipAmt = billNum * (tipPct / 100)
  const total = billNum + tipAmt
  const perPerson = total / split
  const preset = PRESETS.includes(String(tipPct)) ? String(tipPct) : null

  return (
    <Stack gap={4}>
      {trip && (
        <Banner icon="lightbulb" title={`Tipping in ${trip.destination_country || trip.destination_city}`}>
          Customs vary. When in doubt, ask staff or check the bill for a service charge.
        </Banner>
      )}

      <Card variant="raised" className="tools-bill">
        <label htmlFor="tip-bill" className="t-overline tone-muted">Bill</label>
        <Stack row gap={1} align="baseline">
          <span className="tools-amount tools-amount--prefix" aria-hidden="true">{currency}</span>
          <input id="tip-bill" className="tools-amount tools-amount--left" type="text" inputMode="decimal" value={bill}
            onChange={e => setBill(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'))} />
        </Stack>
      </Card>

      <Stack gap={2}>
        <Text variant="label" as="p" id="tip-label">Tip · {tipPct}%</Text>
        <SegmentedControl role="radiogroup" label="Tip percentage" value={preset} onChange={v => setTipPct(Number(v))}
          options={PRESETS.map(p => ({ value: p, label: `${p}%` }))} />
        <Field label="Other percentage" type="number" inputMode="numeric" min={0} max={100}
          value={preset ? '' : tipPct} placeholder="Other %"
          onChange={e => setTipPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
      </Stack>

      <Card className="tools-split">
        <Text variant="body" weight={500} as="span" id="split-label">Split between</Text>
        <Stack row gap={2}>
          <IconButton icon="minus" variant="sunken" label="One fewer person" disabled={split <= 1} onClick={() => setSplit(Math.max(1, split - 1))} />
          <output className="tools-split__n" aria-labelledby="split-label" aria-live="polite">{split}</output>
          <IconButton icon="plus" variant="sunken" label="One more person" onClick={() => setSplit(split + 1)} />
        </Stack>
      </Card>

      <Card variant="inverse" aria-live="polite">
        <Stack row justify="between"><Text variant="body" tone="inverse-muted" as="span">Tip</Text><Text variant="body" tone="inverse-muted" as="span">{formatMoney(tipAmt, currency)}</Text></Stack>
        <Stack row justify="between"><Text variant="body" tone="inverse-muted" as="span">Total</Text><Text variant="body" tone="inverse-muted" as="span">{formatMoney(total, currency)}</Text></Stack>
        <hr className="tools-divider" />
        <Stack row justify="between" align="baseline">
          <Text variant="body" weight={600} tone="inverse" as="span">{split > 1 ? 'Each pays' : 'You pay'}</Text>
          <Text variant="stat" tone="inverse" as="span">{formatMoney(perPerson, currency)}</Text>
        </Stack>
      </Card>
    </Stack>
  )
}
