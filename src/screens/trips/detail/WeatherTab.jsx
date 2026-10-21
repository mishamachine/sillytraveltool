import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { useAuthStore } from '../../../store'
import { parseLocalDate, todayLocalISO, daysBetween } from '../../../lib/dates'
import { fetchWithTimeout } from '../../../lib/http'
import { formatRange, tripPhase } from '../../../lib/trips'
import { tripCoords, weatherInfo, fetchTripHistory } from '../../../lib/weather'
import { Card, Section, Text, Overline, Stack, Icon, Banner, ErrorState, Skeleton, EmptyState } from '../../../ui'

const toC = (t, unit) => (unit === 'F' ? (t - 32) * 5 / 9 : t)

function packingTip(day, unit) {
  if (!day) return null
  const hi = toC(day.high, unit), lo = toC(day.low, unit)
  if (day.code >= 60 || day.precip >= 2) return 'Rain on the way. Pack a waterproof layer and shoes that can take it.'
  if (hi <= 5) return 'Properly cold. Layers, gloves and a warm hat.'
  if (hi >= 30) return 'Hot. Light, breathable clothes, sunscreen and water.'
  if (hi - lo >= 10) return 'Warm days, cool evenings. Bring a layer for after sunset.'
  if (hi >= 20) return 'Mild. Light layers should cover it.'
  return 'Cool. Jeans and a light jacket should do it.'
}

function DayRow({ day, unit, today }) {
  const w = weatherInfo(day.code)
  return (
    <div className="weather-day">
      <span className="t-body w-600">{day.date === today ? 'Today' : format(parseLocalDate(day.date), 'EEE d')}</span>
      <span className="t-caption tone-muted truncate">{[w.label, day.precip >= 1 ? `${Math.round(day.precip)} mm rain` : null].filter(Boolean).join(' · ')}</span>
      <Icon name={w.icon} size={22} className={w.icon === 'sun' ? 'weather-sun' : 'tone-info'} />
      <span className="t-body ta-right tabular"><b>{day.high}°</b> <span className="tone-muted">{day.low}°</span></span>
    </div>
  )
}

export default function WeatherTab({ trip }) {
  const { profile } = useAuthStore()
  const unit = profile?.temp_unit || 'C'
  const [data, setData] = useState(null) // { mode: 'live'|'typical'|'past', now, days, history }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    const run = async () => {
      setLoading(true); setError(null)
      try {
        const coords = await tripCoords(trip)
        if (!coords) throw new Error('City not found')
        const { lat, lon } = coords
        const tempUnit = unit === 'F' ? 'fahrenheit' : 'celsius'
        const today = todayLocalISO()
        const daily = (d, shiftYear) => (d?.time || []).map((date, i) => ({
          date: shiftYear ? date.replace(/^\d{4}/, String(Number(date.slice(0, 4)) + shiftYear)) : date,
          high: Math.round(d.temperature_2m_max[i] ?? 0), low: Math.round(d.temperature_2m_min[i] ?? 0),
          code: d.weather_code[i] ?? 0, precip: d.precipitation_sum[i] ?? 0,
        }))

        if (tripPhase(trip) === 'past') {
          // Past trip: what the weather was, from the archive. Never today's forecast.
          const res = await fetchWithTimeout(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${trip.start_date}&end_date=${trip.end_date}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&temperature_unit=${tempUnit}&timezone=auto`)
          const d = await res.json()
          if (alive) setData({ mode: 'past', days: daily(d.daily).filter(x => x.high || x.low) })
          return
        }

        const daysUntilTrip = daysBetween(today, trip.start_date)
        const current = 'current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m'
        if (daysUntilTrip <= 16) {
          // Live forecast covering the trip window (up to 16 days out)
          const forecastDays = Math.min(16, Math.max(7, daysBetween(today, trip.end_date) + 1))
          const res = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&${current}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&temperature_unit=${tempUnit}&wind_speed_unit=mph&timezone=auto&forecast_days=${forecastDays}`)
          const d = await res.json()
          const from = trip.start_date > today ? trip.start_date : today
          const days = daily(d.daily).filter(x => x.date >= from && x.date <= trip.end_date)
          // Days of this trip that already happened: archive summary
          let history = null
          if (trip.start_date < today) {
            const y = new Date(); y.setDate(y.getDate() - 1)
            history = await fetchTripHistory(lat, lon, trip.start_date, format(y, 'yyyy-MM-dd'), tempUnit)
          }
          if (alive) setData({
            mode: 'live', days, history,
            now: { temp: Math.round(d.current.temperature_2m), code: d.current.weather_code, wind: Math.round(d.current.wind_speed_10m), humidity: d.current.relative_humidity_2m },
          })
        } else {
          // Too far ahead for a forecast: last year's weather on the same dates
          const tripStart = parseLocalDate(trip.start_date)
          const tripEnd = parseLocalDate(trip.end_date)
          const refStart = new Date(tripStart); refStart.setFullYear(refStart.getFullYear() - 1)
          const refEnd = new Date(tripEnd); refEnd.setFullYear(refEnd.getFullYear() - 1)
          const res = await fetchWithTimeout(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${format(refStart, 'yyyy-MM-dd')}&end_date=${format(refEnd, 'yyyy-MM-dd')}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&temperature_unit=${tempUnit}&timezone=auto`)
          const d = await res.json()
          if (alive) setData({ mode: 'typical', days: daily(d.daily, 1) })
        }
      } catch (e) {
        if (alive) setError(e?.name === 'TimeoutError' ? 'The weather service is taking too long. Check your connection and try again.' : 'Weather for this city isn\'t available right now.')
      } finally {
        if (alive) setLoading(false)
      }
    }
    run()
    return () => { alive = false }
  }, [trip, unit, attempt])

  if (loading) return <Card variant="raised" aria-busy="true" aria-label="Loading weather"><Skeleton lines={4} /></Card>
  if (error) return <ErrorState title="Goose lost the forecast" onRetry={() => setAttempt(a => a + 1)}>{error}</ErrorState>
  if (!data?.days?.length && !data?.now) {
    return <EmptyState goose="sleepy" title="No weather to show">There's no forecast or record for these dates yet.</EmptyState>
  }

  const today = todayLocalISO()
  const tipDay = data.days[0]

  return (
    <Stack gap={4}>
      {data.mode === 'live' && data.now && (() => {
        const w = weatherInfo(data.now.code)
        const todayRow = data.days.find(d => d.date === today)
        return (
          <Card variant="raised">
            <Stack row justify="between">
              <Overline tone="accent">Now · {trip.destination_city}</Overline>
              <Text variant="micro" tone="muted">Updated {format(new Date(), 'HH:mm')}</Text>
            </Stack>
            <Stack row gap={4}>
              <Icon name={w.icon} size={56} strokeWidth={1.6} className={w.icon === 'sun' ? 'weather-sun' : 'tone-info'} />
              <Stack gap={1}>
                <Text variant="display" as="p" className="weather-temp">{data.now.temp}°</Text>
                <Text variant="body" tone="muted">{w.label}{todayRow ? ` · H ${todayRow.high}° L ${todayRow.low}°` : ''}</Text>
              </Stack>
            </Stack>
            <Text variant="caption" tone="muted">Wind {data.now.wind} mph · Humidity {data.now.humidity}%</Text>
            {packingTip(todayRow || tipDay, unit) && <p className="weather-tip t-body">{packingTip(todayRow || tipDay, unit)}</p>}
          </Card>
        )
      })()}

      {data.mode === 'typical' && (
        <Banner tone="info" icon="calendar" title="Typical weather, not a forecast">
          Your trip is more than 16 days away, so this is last year's weather on the same dates.
        </Banner>
      )}
      {data.mode === 'past' && (
        <Banner tone="neutral" icon="clock" title="What the weather was">
          This trip ended on {format(parseLocalDate(trip.end_date), 'MMM d, yyyy')}. These are the recorded days, not a forecast.
        </Banner>
      )}

      {data.days.length > 0 && (
        <Section title={data.mode === 'live' ? 'Coming up' : data.mode === 'past' ? formatRange(trip.start_date, trip.end_date, { year: true }) : 'Your dates, last year'}>
          <Card variant="group">
            {data.days.map(day => <DayRow key={day.date} day={day} unit={unit} today={today} />)}
          </Card>
        </Section>
      )}

      {data.mode === 'typical' && packingTip(tipDay, unit) && (
        <Banner icon="shirt" title="Packing tip">{packingTip(tipDay, unit)}</Banner>
      )}

      {data.mode === 'live' && data.history && (
        <Banner variant="soft" tone="neutral" icon="clock">
          <b className="tone-ink">{formatRange(trip.start_date, format(new Date(Date.now() - 86400000), 'yyyy-MM-dd'))}</b>
          {` · was ${data.history.avg}° avg, ${data.history.rainyDays ? `${data.history.rainyDays} rainy day${data.history.rainyDays > 1 ? 's' : ''}` : 'dry'}. Past days show what happened, not a forecast.`}
        </Banner>
      )}
    </Stack>
  )
}
