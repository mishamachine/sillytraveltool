import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useUIStore, useAuthStore, useTripsStore } from '../../store'
import ShareNudge from '../../components/shared/ShareNudge'
import Goose from '../../components/goose/Goose'
import TranslateTool from './components/TranslateTool'
import { findCurrentOrNextTrip } from '../../lib/dates'
import { currencyForCountry } from '../../lib/currencies'
import { fetchWithTimeout } from '../../lib/http'
import { getCurrentPosition, reverseGeocodeCountry } from '../../lib/geo'
import { track } from '../../lib/analytics'

const TOOLBOX_TABS = [
  { id: 'currency', label: '💱 Currency' },
  { id: 'tip', label: '🧾 Tip Calc' },
  { id: 'sos', label: '🆘 SOS' },
  { id: 'translate', label: '🗣️ Translate' },
]

const ALL_CURRENCIES = [
  { code: 'AED', name: 'UAE Dirham' }, { code: 'AFN', name: 'Afghan Afghani' },
  { code: 'ALL', name: 'Albanian Lek' }, { code: 'AMD', name: 'Armenian Dram' },
  { code: 'ARS', name: 'Argentine Peso' }, { code: 'AUD', name: 'Australian Dollar' },
  { code: 'AZN', name: 'Azerbaijani Manat' }, { code: 'BAM', name: 'Bosnia Mark' },
  { code: 'BDT', name: 'Bangladeshi Taka' }, { code: 'BGN', name: 'Bulgarian Lev' },
  { code: 'BHD', name: 'Bahraini Dinar' }, { code: 'BMD', name: 'Bermudan Dollar' },
  { code: 'BND', name: 'Brunei Dollar' }, { code: 'BOB', name: 'Bolivian Boliviano' },
  { code: 'BRL', name: 'Brazilian Real' }, { code: 'BWP', name: 'Botswanan Pula' },
  { code: 'CAD', name: 'Canadian Dollar' }, { code: 'CHF', name: 'Swiss Franc' },
  { code: 'CLP', name: 'Chilean Peso' }, { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'COP', name: 'Colombian Peso' }, { code: 'CRC', name: 'Costa Rican Colón' },
  { code: 'CZK', name: 'Czech Koruna' }, { code: 'DKK', name: 'Danish Krone' },
  { code: 'DOP', name: 'Dominican Peso' }, { code: 'DZD', name: 'Algerian Dinar' },
  { code: 'EGP', name: 'Egyptian Pound' }, { code: 'ETB', name: 'Ethiopian Birr' },
  { code: 'EUR', name: 'Euro' }, { code: 'FJD', name: 'Fijian Dollar' },
  { code: 'GBP', name: 'British Pound' }, { code: 'GEL', name: 'Georgian Lari' },
  { code: 'GHS', name: 'Ghanaian Cedi' }, { code: 'GTQ', name: 'Guatemalan Quetzal' },
  { code: 'HKD', name: 'Hong Kong Dollar' }, { code: 'HNL', name: 'Honduran Lempira' },
  { code: 'HUF', name: 'Hungarian Forint' }, { code: 'IDR', name: 'Indonesian Rupiah' },
  { code: 'ILS', name: 'Israeli Shekel' }, { code: 'INR', name: 'Indian Rupee' },
  { code: 'IQD', name: 'Iraqi Dinar' }, { code: 'ISK', name: 'Icelandic Króna' },
  { code: 'JMD', name: 'Jamaican Dollar' }, { code: 'JOD', name: 'Jordanian Dinar' },
  { code: 'JPY', name: 'Japanese Yen' }, { code: 'KES', name: 'Kenyan Shilling' },
  { code: 'KRW', name: 'South Korean Won' }, { code: 'KWD', name: 'Kuwaiti Dinar' },
  { code: 'KZT', name: 'Kazakhstani Tenge' }, { code: 'LBP', name: 'Lebanese Pound' },
  { code: 'LKR', name: 'Sri Lankan Rupee' }, { code: 'LYD', name: 'Libyan Dinar' },
  { code: 'MAD', name: 'Moroccan Dirham' }, { code: 'MDL', name: 'Moldovan Leu' },
  { code: 'MKD', name: 'Macedonian Denar' }, { code: 'MXN', name: 'Mexican Peso' },
  { code: 'MYR', name: 'Malaysian Ringgit' }, { code: 'NAD', name: 'Namibian Dollar' },
  { code: 'NGN', name: 'Nigerian Naira' }, { code: 'NOK', name: 'Norwegian Krone' },
  { code: 'NPR', name: 'Nepalese Rupee' }, { code: 'NZD', name: 'New Zealand Dollar' },
  { code: 'OMR', name: 'Omani Rial' }, { code: 'PEN', name: 'Peruvian Sol' },
  { code: 'PHP', name: 'Philippine Peso' }, { code: 'PKR', name: 'Pakistani Rupee' },
  { code: 'PLN', name: 'Polish Zloty' }, { code: 'QAR', name: 'Qatari Rial' },
  { code: 'RON', name: 'Romanian Leu' }, { code: 'RSD', name: 'Serbian Dinar' },
  { code: 'RUB', name: 'Russian Ruble' }, { code: 'SAR', name: 'Saudi Riyal' },
  { code: 'SEK', name: 'Swedish Krona' }, { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'THB', name: 'Thai Baht' }, { code: 'TND', name: 'Tunisian Dinar' },
  { code: 'TRY', name: 'Turkish Lira' }, { code: 'TTD', name: 'Trinidad & Tobago Dollar' },
  { code: 'TWD', name: 'Taiwan Dollar' }, { code: 'TZS', name: 'Tanzanian Shilling' },
  { code: 'UAH', name: 'Ukrainian Hryvnia' }, { code: 'UGX', name: 'Ugandan Shilling' },
  { code: 'USD', name: 'US Dollar' }, { code: 'UYU', name: 'Uruguayan Peso' },
  { code: 'UZS', name: 'Uzbekistan Som' }, { code: 'VND', name: 'Vietnamese Dong' },
  { code: 'XAF', name: 'Central African CFA Franc' }, { code: 'XOF', name: 'West African CFA Franc' },
  { code: 'YER', name: 'Yemeni Rial' }, { code: 'ZAR', name: 'South African Rand' },
  { code: 'ZMW', name: 'Zambian Kwacha' },
]

const TOP_PAIRS = {
  USD: ['EUR', 'GBP', 'JPY', 'CAD', 'AUD'],
  EUR: ['USD', 'GBP', 'JPY', 'CHF', 'CAD'],
  GBP: ['USD', 'EUR', 'JPY', 'AUD', 'CAD'],
  CAD: ['USD', 'EUR', 'GBP', 'JPY', 'AUD'],
  AUD: ['USD', 'EUR', 'GBP', 'JPY', 'NZD'],
  JPY: ['USD', 'EUR', 'GBP', 'AUD', 'CNY'],
  CHF: ['USD', 'EUR', 'GBP', 'JPY', 'SEK'],
  CNY: ['USD', 'EUR', 'JPY', 'HKD', 'SGD'],
  INR: ['USD', 'EUR', 'GBP', 'AED', 'SGD'],
  MXN: ['USD', 'EUR', 'GBP', 'CAD', 'JPY'],
}

function getCurrencyName(code) {
  return ALL_CURRENCIES.find(c => c.code === code)?.name || code
}

// ============================================================
// CURRENCY TOOL
// ============================================================
function CurrencyTool() {
  const { profile, user } = useAuthStore()
  const { trips } = useTripsStore()
  const homeCurrency = profile?.home_currency || 'USD'

  // Default "from": current/next trip's destination currency, else home currency
  const destCurrency = currencyForCountry(findCurrentOrNextTrip(trips).trip?.destination_country_code)
  const defaultFrom = destCurrency || homeCurrency
  const defaultTo = defaultFrom !== homeCurrency ? homeCurrency : (TOP_PAIRS[homeCurrency] || TOP_PAIRS['USD'])[0]

  const [amount, setAmount] = useState('100')
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [rates, setRates] = useState(null)
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
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
        setLastUpdated(new Date().toLocaleTimeString())
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
      if (latestBase.current === base) { setRates(null); setError(e?.name === 'TimeoutError' ? 'Timed out' : 'No connection') }
    } finally {
      if (latestBase.current === base) setLoading(false)
    }
  }

  const rate = rates?.[to]
  const result = rate ? (parseFloat(amount || 0) * rate).toFixed(2) : null

  // Search by code or name ("eur", "yen", "peso")
  const q = query.trim().toLowerCase()
  const matches = (code) => !q || code.toLowerCase().includes(q) || getCurrencyName(code).toLowerCase().includes(q)
  const popularShown = topFive.filter(matches)

  // All currencies except home currency, alphabetically, minus the top 5
  const otherCurrencies = ALL_CURRENCIES
    .filter(c => c.code !== from && !topFive.includes(c.code) && matches(c.code))
    .sort((a, b) => a.code.localeCompare(b.code))

  const CurrencyRow = ({ code }) => {
    const isActive = to === code
    const rowRate = rates?.[code]
    const rowResult = rowRate ? (parseFloat(amount || 0) * rowRate).toFixed(2) : '—'

    return (
      <button
        onClick={() => setTo(code)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: isActive ? 'var(--primary-light)' : 'none',
          border: 'none',
          borderBottom: '1px solid var(--border-light)',
          cursor: 'pointer',
          transition: 'background var(--transition)',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '13px',
            color: isActive ? 'var(--primary)' : 'var(--text)',
            minWidth: 36,
          }}>
            {code}
          </span>
          <span style={{ fontSize: '13px', color: 'var(--text-sec)' }}>
            {getCurrencyName(code)}
          </span>
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600,
          color: isActive ? 'var(--primary)' : 'var(--text-sec)',
        }}>
          {rowResult}
        </span>
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Fixed calculator top */}
      <div style={{ padding: '16px', flexShrink: 0 }}>
        <div className="card card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Amount + from */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">Amount ({from})</label>
              <input
                type="number"
                className="form-input"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                inputMode="decimal"
                style={{ fontSize: '22px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
              />
            </div>
            <button
              onClick={() => { setFrom(to); setTo(from) }}
              style={{
                padding: '12px', background: 'var(--surface-alt)',
                border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)',
                fontSize: '18px', cursor: 'pointer', marginBottom: 0, flexShrink: 0,
              }}
            >⇄</button>
          </div>

          {/* Result */}
          <div style={{
            background: 'var(--primary-light)', borderRadius: 'var(--radius-md)',
            padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-tert)', fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '0.08em' }}>
                {to}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: 700, color: 'var(--primary)' }}>
                {loading ? '...' : error ? error : result || '—'}
              </div>
            </div>
            {rate && !loading && (
              <div style={{ fontSize: '11px', color: 'var(--text-tert)', textAlign: 'right' }}>
                <div>1 {from} = {rate.toFixed(4)} {to}</div>
                <div style={{ marginTop: '2px' }}>Updated {lastUpdated}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable currency list */}
      <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--border)' }}>
        {/* Search */}
        <div style={{ padding: '10px 16px 4px', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1 }}>
          <input
            type="search"
            className="form-input"
            placeholder="Search currency (code or name)"
            aria-label="Search currencies"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoComplete="off"
            style={{ padding: '8px 12px', fontSize: '14px' }}
          />
        </div>

        {/* Top 5 highlighted */}
        {popularShown.length > 0 && (
          <>
            <div style={{
              padding: '8px 16px 4px',
              fontSize: '11px', fontFamily: 'var(--font-heading)', fontWeight: 700,
              color: 'var(--text-tert)', letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              Popular
            </div>
            {popularShown.map(code => <CurrencyRow key={code} code={code} />)}
          </>
        )}

        {/* Divider */}
        {otherCurrencies.length > 0 && (
          <div style={{
            padding: '8px 16px 4px', marginTop: '4px',
            fontSize: '11px', fontFamily: 'var(--font-heading)', fontWeight: 700,
            color: 'var(--text-tert)', letterSpacing: '0.08em', textTransform: 'uppercase',
            borderTop: popularShown.length > 0 ? '1px solid var(--border)' : 'none',
          }}>
            All Currencies
          </div>
        )}
        {otherCurrencies.map(c => <CurrencyRow key={c.code} code={c.code} />)}

        {popularShown.length === 0 && otherCurrencies.length === 0 && (
          <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: '13px', color: 'var(--text-sec)' }}>
            No currency matches "{query.trim()}"
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// TIP CALC
// ============================================================
function TipCalc() {
  const [bill, setBill] = useState('50')
  const [tipPct, setTipPct] = useState(18)
  const [split, setSplit] = useState(1)

  const billNum = parseFloat(bill || 0)
  const tipAmt = billNum * (tipPct / 100)
  const total = billNum + tipAmt
  const perPerson = total / split

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="card card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Bill Total</label>
          <input type="number" className="form-input" value={bill}
            onChange={e => setBill(e.target.value)} inputMode="decimal"
            style={{ fontSize: '24px', fontFamily: 'var(--font-mono)', fontWeight: 700 }} />
        </div>
        <div>
          <label className="form-label" style={{ display: 'block', marginBottom: '8px' }}>Tip — {tipPct}%</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[10, 12, 15, 18, 20, 25].map(p => (
              <button key={p} onClick={() => setTipPct(p)} className={`pill-tab ${tipPct === p ? 'active' : ''}`} style={{ fontSize: '13px' }}>
                {p}%
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label className="form-label">Split</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => setSplit(Math.max(1, split - 1))} style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', fontSize: '18px', cursor: 'pointer' }}>−</button>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{split}</span>
            <button onClick={() => setSplit(split + 1)} style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', fontSize: '18px', cursor: 'pointer' }}>+</button>
          </div>
        </div>
        <div style={{ background: 'var(--primary-light)', borderRadius: 'var(--radius-md)', padding: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center' }}>
            {[['Tip', tipAmt.toFixed(2)], ['Total', total.toFixed(2)], [split > 1 ? `Each (${split})` : 'Total', perPerson.toFixed(2)]].map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize: '11px', color: 'var(--text-tert)', fontFamily: 'var(--font-heading)', fontWeight: 600 }}>{label}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: 'var(--primary)' }}>${val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// Human-readable names for passport country codes (used in Embassy section)
const PASSPORT_COUNTRY_NAMES = {
  US: 'American', GB: 'British', AU: 'Australian', CA: 'Canadian', NZ: 'New Zealand',
  IE: 'Irish', ZA: 'South African', IN: 'Indian', PK: 'Pakistani', NG: 'Nigerian',
  GH: 'Ghanaian', KE: 'Kenyan', FR: 'French', DE: 'German', IT: 'Italian',
  ES: 'Spanish', PT: 'Portuguese', NL: 'Dutch', BE: 'Belgian', CH: 'Swiss',
  AT: 'Austrian', SE: 'Swedish', NO: 'Norwegian', DK: 'Danish', FI: 'Finnish',
  PL: 'Polish', CZ: 'Czech', HU: 'Hungarian', RO: 'Romanian', GR: 'Greek',
  TR: 'Turkish', RU: 'Russian', UA: 'Ukrainian', JP: 'Japanese', KR: 'South Korean',
  CN: 'Chinese', SG: 'Singaporean', MY: 'Malaysian', TH: 'Thai', ID: 'Indonesian',
  PH: 'Filipino', VN: 'Vietnamese', BD: 'Bangladeshi', LK: 'Sri Lankan',
  BR: 'Brazilian', MX: 'Mexican', AR: 'Argentine', CO: 'Colombian', CL: 'Chilean',
  PE: 'Peruvian', EG: 'Egyptian', MA: 'Moroccan', IL: 'Israeli', SA: 'Saudi',
  AE: 'Emirati', QA: 'Qatari', JO: 'Jordanian', IR: 'Iranian',
}

// Embassy data: passport_country → destination_country → { address, phone, mapsQuery }
// Key format: `${passportCode}_${destCode}`  — falls back to null (Maps search shown instead)
const EMBASSY_DATA = {
  // US passport holders
  US_GB: { address: '33 Nine Elms Lane, London SW11 7US', phone: '+44 20 7499 9000' },
  US_FR: { address: '2 Avenue Gabriel, 75008 Paris', phone: '+33 1 43 12 22 22' },
  US_DE: { address: 'Pariser Platz 2, 10117 Berlin', phone: '+49 30 8305 0' },
  US_IT: { address: 'Via Vittorio Veneto 121, 00187 Rome', phone: '+39 06 46741' },
  US_ES: { address: 'Calle de Serrano 75, 28006 Madrid', phone: '+34 91 587 2200' },
  US_JP: { address: '1-10-5 Akasaka, Minato, Tokyo 107-8420', phone: '+81 3-3224-5000' },
  US_AU: { address: 'Moonah Place, Yarralumla ACT 2600, Canberra', phone: '+61 2 6214 5600' },
  US_CA: { address: '490 Sussex Drive, Ottawa ON K1N 1G8', phone: '+1 613 238 5335' },
  US_MX: { address: 'Paseo de la Reforma 305, Cuauhtémoc, 06500 CDMX', phone: '+52 55 5080 2000' },
  US_TH: { address: '95 Wireless Road, Lumphini, Bangkok 10330', phone: '+66 2 205 4000' },
  US_IN: { address: 'Shantipath, Chanakyapuri, New Delhi 110021', phone: '+91 11 2419 8000' },
  US_CN: { address: '55 An Jia Lou Road, Chaoyang District, Beijing', phone: '+86 10 8531 3000' },
  US_BR: { address: 'SES Quadra 801, Lote 3, Brasília DF 70403-900', phone: '+55 61 3312 7000' },
  US_SG: { address: '27 Napier Road, Singapore 258508', phone: '+65 6476 9100' },
  US_AE: { address: 'Embassies District, Plot 38, Sector W-59/02, Abu Dhabi', phone: '+971 2 414 2200' },
  US_ZA: { address: '877 Pretorius Street, Arcadia, Pretoria 0083', phone: '+27 12 431 4000' },
  // GB passport holders
  GB_US: { address: '3100 Massachusetts Ave NW, Washington DC 20008', phone: '+1 202 588 6500' },
  GB_FR: { address: '35 Rue du Faubourg Saint-Honoré, 75008 Paris', phone: '+33 1 44 51 31 00' },
  GB_DE: { address: 'Wilhelmstraße 70, 10117 Berlin', phone: '+49 30 204 570' },
  GB_IT: { address: 'Via XX Settembre 80a, 00187 Rome', phone: '+39 06 4220 0001' },
  GB_ES: { address: 'Torre Espacio, Paseo de la Castellana 259D, 28046 Madrid', phone: '+34 91 714 6300' },
  GB_JP: { address: '1 Ichiban-cho, Chiyoda-ku, Tokyo 102-8381', phone: '+81 3 5211 1100' },
  GB_AU: { address: 'Commonwealth Avenue, Yarralumla ACT 2600, Canberra', phone: '+61 2 6270 6666' },
  GB_TH: { address: '14 Wireless Road, Lumphini, Bangkok 10330', phone: '+66 2 305 8333' },
  GB_IN: { address: 'Shantipath, Chanakyapuri, New Delhi 110021', phone: '+91 11 2419 2100' },
  GB_SG: { address: '100 Tanglin Road, Singapore 247919', phone: '+65 6424 4200' },
  GB_AE: { address: 'Al Seef Road, PO Box 248, Abu Dhabi', phone: '+971 2 610 1100' },
  GB_ZA: { address: '255 Hill Street, Arcadia, Pretoria 0002', phone: '+27 12 421 7500' },
  // AU passport holders
  AU_US: { address: '1601 Massachusetts Ave NW, Washington DC 20036', phone: '+1 202 797 3000' },
  AU_GB: { address: 'Australia House, Strand, London WC2B 4LA', phone: '+44 20 7379 4334' },
  AU_JP: { address: '2-1-14 Mita, Minato-ku, Tokyo 108-8361', phone: '+81 3 5232 4111' },
  AU_FR: { address: '4 Rue Jean Rey, 75724 Paris', phone: '+33 1 40 59 33 00' },
  AU_DE: { address: 'Wallstraße 76-79, 10179 Berlin', phone: '+49 30 880 0880' },
  AU_SG: { address: '25 Napier Road, Singapore 258507', phone: '+65 6836 4100' },
  AU_TH: { address: '37 South Sathorn Road, Bangkok 10120', phone: '+66 2 344 6300' },
  AU_IN: { address: '1/50G Shantipath, Chanakyapuri, New Delhi 110021', phone: '+91 11 4139 9900' },
  AU_AE: { address: 'Al Sila Tower, 23rd Floor, Abu Dhabi Global Market Square', phone: '+971 2 401 0500' },
  // CA passport holders
  CA_US: { address: '501 Pennsylvania Ave NW, Washington DC 20001', phone: '+1 202 682 1740' },
  CA_GB: { address: 'Canada House, Trafalgar Square, London SW1Y 5BJ', phone: '+44 20 7004 6000' },
  CA_FR: { address: '35 Avenue Montaigne, 75008 Paris', phone: '+33 1 44 43 29 00' },
  CA_JP: { address: '7-3-38 Akasaka, Minato-ku, Tokyo 107-8503', phone: '+81 3 5412 6200' },
  CA_AU: { address: 'Commonwealth Avenue, Yarralumla ACT 2600, Canberra', phone: '+61 2 6270 4000' },
  CA_DE: { address: 'Leipziger Platz 17, 10117 Berlin', phone: '+49 30 20312 0' },
  CA_MX: { address: 'Schiller 529, Col. Bosque de Chapultepec, 11580 CDMX', phone: '+52 55 5724 7900' },
}

// Emergency numbers by country code
const EMERGENCY = {
  US: { police: '911', ambulance: '911', fire: '911', tourist: null },
  GB: { police: '999', ambulance: '999', fire: '999', tourist: '101' },
  AU: { police: '000', ambulance: '000', fire: '000', tourist: '131 444' },
  CA: { police: '911', ambulance: '911', fire: '911', tourist: null },
  JP: { police: '110', ambulance: '119', fire: '119', tourist: '0570-073-891' },
  FR: { police: '17', ambulance: '15', fire: '18', tourist: '3117' },
  DE: { police: '110', ambulance: '112', fire: '112', tourist: null },
  IT: { police: '113', ambulance: '118', fire: '115', tourist: '116' },
  ES: { police: '091', ambulance: '112', fire: '080', tourist: '902 102 112' },
  MX: { police: '911', ambulance: '911', fire: '911', tourist: '078' },
  IN: { police: '100', ambulance: '108', fire: '101', tourist: '1800-111-363' },
  CN: { police: '110', ambulance: '120', fire: '119', tourist: '12301' },
  BR: { police: '190', ambulance: '192', fire: '193', tourist: '0800 023 1313' },
  NZ: { police: '111', ambulance: '111', fire: '111', tourist: null },
  SG: { police: '999', ambulance: '995', fire: '995', tourist: null },
  TH: { police: '191', ambulance: '1669', fire: '199', tourist: '1155' },
  AE: { police: '999', ambulance: '998', fire: '997', tourist: '901' },
  ZA: { police: '10111', ambulance: '10177', fire: '107', tourist: '083 123 2345' },
  PK: { police: '15', ambulance: '115', fire: '16', tourist: null },
  NG: { police: '112', ambulance: '112', fire: '112', tourist: null },
  DEFAULT: { police: '112', ambulance: '112', fire: '112', tourist: null },
}

function regionName(code) {
  if (!code || code === 'DEFAULT') return null
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code } catch { return code }
}

// Last device-location lookup, reused for 10 minutes so reopening SOS is instant
let cachedLocation = null // { at, loc: { countryCode, countryName, city } }

// Resolves the device's current country. status: 'locating' | 'found' | 'unavailable'
function useCurrentCountry() {
  const fresh = cachedLocation && Date.now() - cachedLocation.at < 10 * 60 * 1000
  const [state, setState] = useState(fresh ? { status: 'found', loc: cachedLocation.loc } : { status: 'locating', loc: null })
  useEffect(() => {
    if (fresh) return
    let cancelled = false
    ;(async () => {
      try {
        const { latitude, longitude } = await getCurrentPosition({ timeout: 10000 })
        const loc = await reverseGeocodeCountry(latitude, longitude, 6000)
        cachedLocation = { at: Date.now(), loc }
        if (!cancelled) setState({ status: 'found', loc })
      } catch {
        if (!cancelled) setState({ status: 'unavailable', loc: null })
      }
    })()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}

function PinIcon({ color }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  )
}

function SOSTool() {
  const { profile } = useAuthStore()
  const { trips } = useTripsStore()
  const [showCard, setShowCard] = useState(false)
  const current = useCurrentCountry()

  // Priority: device location → active/next trip country → passport country → default
  const { trip: destinationTrip, isLive: hasLiveTrip } = findCurrentOrNextTrip(trips)
  const activeTrip = hasLiveTrip ? destinationTrip : null
  const nextTrip = hasLiveTrip ? null : destinationTrip
  const locCountry = current.status === 'found' ? current.loc : null
  const source = locCountry ? 'location'
    : activeTrip?.destination_country_code ? 'active_trip'
    : nextTrip?.destination_country_code ? 'next_trip'
    : profile?.passport_country ? 'passport'
    : 'default'
  const countryCode = locCountry?.countryCode || destinationTrip?.destination_country_code || profile?.passport_country || 'DEFAULT'
  const countryName = locCountry?.countryName || destinationTrip?.destination_country || regionName(profile?.passport_country) || 'your destination'
  const isLive = source === 'location' || source === 'active_trip'

  const sourceLabel = {
    location: `Based on your current location: ${countryName}`,
    active_trip: `Based on your active trip to ${countryName}`,
    next_trip: `Based on your next trip to ${countryName}`,
    passport: `Based on your passport country: ${countryName}`,
    default: 'General international emergency numbers',
  }[source]

  // Embassy lookup: the country you're in (by location) wins over the trip destination
  const embassyDest = locCountry
    ? { code: locCountry.countryCode, country: locCountry.countryName, city: locCountry.city }
    : destinationTrip
      ? { code: destinationTrip.destination_country_code, country: destinationTrip.destination_country, city: destinationTrip.destination_city }
      : null

  const trackedRef = useRef(false)
  useEffect(() => {
    if (trackedRef.current || current.status === 'locating') return
    trackedRef.current = true
    track('sos_opened', { source, country: countryCode === 'DEFAULT' ? null : countryCode }, 'toolbox')
  }, [current.status]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {showCard && <EmergencyCard onClose={() => setShowCard(false)} countryCode={countryCode} countryName={countryName} profile={profile} />}

      {/* Name missing banner */}
      {!profile?.display_name && (
        <div style={{ background: '#FFF8EC', border: '1.5px solid var(--warning)', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: 13, color: 'var(--text-sec)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>⚠️</span>
          <span>Set your name in <strong>Profile → Settings</strong> so it appears on the emergency card.</span>
        </div>
      )}

      {/* Context banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: isLive ? '#EDF7F1' : 'var(--surface-alt)', borderRadius: 'var(--radius-md)', border: `1.5px solid ${isLive ? '#2D8B55' : 'var(--border)'}` }}>
        <PinIcon color={isLive ? '#2D8B55' : 'var(--text-sec)'} />
        <span style={{ fontSize: 13, color: isLive ? '#2D8B55' : 'var(--text-sec)', fontFamily: 'var(--font-heading)', fontWeight: 600 }}>
          {sourceLabel}
          {current.status === 'locating' && (
            <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-tert)', marginTop: 2 }}>Checking your current location...</span>
          )}
        </span>
      </div>

      {/* Emergency numbers card */}
      <SOSCard countryCode={countryCode} countryName={countryName} onShowCard={() => setShowCard(true)} />

      {/* Embassy info */}
      <div className="card card-body" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Goose variant="passport" size={56} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Your Embassy</div>
          {profile?.passport_country && embassyDest && embassyDest.code === profile.passport_country ? (
            <p style={{ fontSize: 13, color: 'var(--text-sec)', lineHeight: 1.6 }}>
              {embassyDest.country} is your passport country, so no embassy needed. When you're abroad, your embassy shows up here.
            </p>
          ) : profile?.passport_country && embassyDest ? (() => {
            const passportCode = profile.passport_country
            const destCode = embassyDest.code
            const passportName = PASSPORT_COUNTRY_NAMES[passportCode] || passportCode
            const destCountry = embassyDest.country
            const destCity = embassyDest.city
            const embassyKey = `${passportCode}_${destCode}`
            const known = EMBASSY_DATA[embassyKey]
            const mapsQuery = known
              ? encodeURIComponent(known.address)
              : encodeURIComponent(`${passportName} embassy ${destCity || destCountry}`)
            const mapsUrl = `https://maps.google.com/?q=${mapsQuery}`
            return (
              <>
                <p style={{ fontSize: 13, color: 'var(--text-sec)', lineHeight: 1.6, marginBottom: known ? 10 : 8 }}>
                  <strong>{passportName} Embassy</strong> in {destCountry}:
                </p>
                {known ? (
                  <div style={{ background: 'var(--surface-alt)', borderRadius: 'var(--radius-md)', padding: '10px 12px', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>📍</span>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>{known.address}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>📞</span>
                      <a href={`tel:${known.phone.replace(/\s/g, '')}`} style={{ fontSize: 13, color: 'var(--primary)', fontFamily: 'var(--font-heading)', fontWeight: 700, textDecoration: 'none' }}>{known.phone}</a>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: 'var(--text-tert)', marginBottom: 8, lineHeight: 1.5 }}>
                    Exact details unavailable — use Maps to locate your nearest embassy.
                  </p>
                )}
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: 'var(--radius-md)', fontSize: 13, fontFamily: 'var(--font-heading)', fontWeight: 700, textDecoration: 'none', border: '1.5px solid var(--primary)' }}>
                  <span style={{ fontSize: 16 }}>🗺️</span>
                  <span>Open in Maps</span>
                </a>
                <p style={{ fontSize: 11, color: 'var(--text-tert)', marginTop: 6, lineHeight: 1.5 }}>
                  Register your trip with your embassy if abroad for extended stays.
                </p>
              </>
            )
          })() : profile?.passport_country && !embassyDest ? (
            <p style={{ fontSize: 13, color: 'var(--text-sec)', lineHeight: 1.6 }}>
              Add an upcoming trip to find your <strong>{PASSPORT_COUNTRY_NAMES[profile.passport_country] || profile.passport_country} embassy</strong> at your destination.
            </p>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text-sec)', lineHeight: 1.6 }}>
              Set your passport country in <strong>Profile → Settings</strong> to get embassy lookup here.
            </p>
          )}
        </div>
      </div>

      {/* General tips */}
      <div className="card card-body">
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 10 }}>🪿 Goose Safety Tips</div>
        {[
          'Screenshot this page before going offline',
          'Save your hotel address in local script',
          'Keep a photo of your passport on your phone',
          'Travel insurance number should be in your contacts',
          'Know the nearest hospital to your accommodation',
        ].map((tip, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, paddingBottom: 8, borderBottom: i < 4 ? '1px solid var(--border-light)' : 'none', marginBottom: i < 4 ? 8 : 0 }}>
            <span style={{ color: 'var(--primary)', fontWeight: 700, flexShrink: 0 }}>→</span>
            <span style={{ fontSize: 13, color: 'var(--text-sec)', lineHeight: 1.5 }}>{tip}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SOSCard({ countryCode, countryName, onShowCard }) {
  const nums = EMERGENCY[countryCode] || EMERGENCY.DEFAULT
  return (
    <div style={{ background: '#FFF5F5', border: '2px solid var(--error)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ background: 'var(--error)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Goose variant="sos" size={44} />
        <div><div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 700, color: '#fff' }}>Emergency Numbers</div><div style={{ fontSize: 12, opacity: 0.85, color: '#fff' }}>{countryName}</div></div>
      </div>
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[['🚔 Police', nums.police], ['🚑 Ambulance', nums.ambulance], ['🔥 Fire', nums.fire], nums.tourist && ['ℹ️ Tourist Help', nums.tourist]].filter(Boolean).map(([label, num]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, color: 'var(--text-sec)' }}>{label}</span>
            <a href={`tel:${num}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--error)', textDecoration: 'none' }}>{num}</a>
          </div>
        ))}
        <button onClick={onShowCard} style={{ marginTop: 4, background: 'var(--error)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', padding: '12px', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          📋 Full Emergency Card
        </button>
      </div>
    </div>
  )
}

function EmergencyCard({ onClose, countryCode, countryName, profile }) {
  const nums = EMERGENCY[countryCode] || EMERGENCY.DEFAULT
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#D93025', zIndex: 999, display: 'flex', flexDirection: 'column', padding: 24, color: '#fff', overflowY: 'auto' }}>
      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 700, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
        <span>🆘 EMERGENCY CARD</span>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 99, padding: '4px 12px', color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: 700 }}>CLOSE</button>
      </div>
      <div style={{ fontSize: 16, opacity: 0.9, marginBottom: 4, fontFamily: 'var(--font-heading)', fontWeight: 600 }}>{countryName}</div>
      <p style={{ fontSize: 13, opacity: 0.85, marginBottom: 24 }}>Show this screen to anyone who needs to help you</p>
      {[['Police', nums.police], ['Ambulance', nums.ambulance], ['Fire', nums.fire]].map(([label, num]) => (
        <div key={label} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 4 }}>{label}</div>
          <a href={`tel:${num}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 48, fontWeight: 700, color: '#fff', textDecoration: 'none', display: 'block', lineHeight: 1 }}>{num}</a>
        </div>
      ))}
      {profile?.display_name && (
        <div style={{ marginTop: 'auto', padding: '16px', background: 'rgba(255,255,255,0.15)', borderRadius: 12 }}>
          <div style={{ fontSize: 13, opacity: 0.85 }}>My name</div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 700 }}>{profile.display_name}</div>
        </div>
      )}
      {!profile?.display_name && (
        <div style={{ marginTop: 'auto', padding: '16px', background: 'rgba(255,255,255,0.15)', borderRadius: 12 }}>
          <div style={{ fontSize: 13, opacity: 0.85 }}>Tip</div>
          <div style={{ fontSize: 14, opacity: 0.9 }}>Set your name in Profile → Settings so it appears here in an emergency.</div>
        </div>
      )}
    </div>
  )
}


const TOOL_COMPONENTS = { currency: CurrencyTool, tip: TipCalc, sos: SOSTool, translate: TranslateTool }

export default function ToolboxScreen() {
  const { activeToolboxTab, setToolboxTab } = useUIStore()
  const ActiveTool = TOOL_COMPONENTS[activeToolboxTab]

  // TranslateTool is owned elsewhere; record usage at the point the tool is opened
  useEffect(() => {
    if (activeToolboxTab === 'translate') track('translate_used', { trigger: 'tool_opened' }, 'toolbox')
  }, [activeToolboxTab])

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="screen-header" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Goose variant="pilot" size={52} />
          <div>
            <h1 className="screen-title" style={{ marginBottom: 0, lineHeight: 1 }}>Toolbox</h1>
            <div style={{ fontSize: 12, color: 'var(--text-tert)', marginTop: 2 }}>Travel essentials</div>
          </div>
        </div>
      </div>
      <div className="pill-tabs" style={{ flexShrink: 0 }}>
        {TOOLBOX_TABS.map(tab => (
          <button key={tab.id} className={`pill-tab ${activeToolboxTab === tab.id ? 'active' : ''}`} onClick={() => setToolboxTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <ActiveTool />
        <ShareNudge />
      </div>
    </div>
  )
}
