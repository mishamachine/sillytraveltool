/**
 * ISO 3166-1 alpha-2 country code → ISO 4217 currency code.
 * Covers common travel destinations; unknown codes return null.
 */
const EUR = 'EUR'

const COUNTRY_CURRENCY = {
  // Eurozone + euro users
  AT: EUR, BE: EUR, HR: EUR, CY: EUR, EE: EUR, FI: EUR, FR: EUR, DE: EUR, GR: EUR, IE: EUR,
  IT: EUR, LV: EUR, LT: EUR, LU: EUR, MT: EUR, NL: EUR, PT: EUR, SK: EUR, SI: EUR, ES: EUR,
  AD: EUR, MC: EUR, SM: EUR, VA: EUR, ME: EUR, XK: EUR,
  // Rest of Europe
  GB: 'GBP', CH: 'CHF', LI: 'CHF', NO: 'NOK', SE: 'SEK', DK: 'DKK', IS: 'ISK', PL: 'PLN',
  CZ: 'CZK', HU: 'HUF', RO: 'RON', BG: 'BGN', RS: 'RSD', BA: 'BAM', MK: 'MKD', AL: 'ALL',
  MD: 'MDL', UA: 'UAH', RU: 'RUB', TR: 'TRY', GE: 'GEL', AM: 'AMD', AZ: 'AZN', BY: 'BYN',
  // Americas
  US: 'USD', CA: 'CAD', MX: 'MXN', BR: 'BRL', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN',
  UY: 'UYU', BO: 'BOB', PY: 'PYG', EC: 'USD', PA: 'USD', SV: 'USD', PR: 'USD', CR: 'CRC',
  GT: 'GTQ', HN: 'HNL', NI: 'NIO', DO: 'DOP', JM: 'JMD', TT: 'TTD', BS: 'BSD', BB: 'BBD',
  BM: 'BMD', CU: 'CUP', HT: 'HTG', BZ: 'BZD', VE: 'VES',
  // Asia-Pacific
  JP: 'JPY', CN: 'CNY', HK: 'HKD', MO: 'MOP', TW: 'TWD', KR: 'KRW', SG: 'SGD', MY: 'MYR',
  TH: 'THB', VN: 'VND', ID: 'IDR', PH: 'PHP', KH: 'KHR', LA: 'LAK', MM: 'MMK', BN: 'BND',
  IN: 'INR', LK: 'LKR', NP: 'NPR', BD: 'BDT', PK: 'PKR', MV: 'MVR', BT: 'BTN', MN: 'MNT',
  KZ: 'KZT', UZ: 'UZS', KG: 'KGS', TJ: 'TJS', TM: 'TMT', AF: 'AFN',
  AU: 'AUD', NZ: 'NZD', FJ: 'FJD', PG: 'PGK',
  // Middle East
  AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR', JO: 'JOD', LB: 'LBP',
  IL: 'ILS', IQ: 'IQD', IR: 'IRR', YE: 'YER', SY: 'SYP',
  // Africa
  EG: 'EGP', MA: 'MAD', TN: 'TND', DZ: 'DZD', LY: 'LYD', ZA: 'ZAR', NA: 'NAD', BW: 'BWP',
  ZW: 'USD', ZM: 'ZMW', MZ: 'MZN', KE: 'KES', TZ: 'TZS', UG: 'UGX', RW: 'RWF', ET: 'ETB',
  GH: 'GHS', NG: 'NGN', SN: 'XOF', CI: 'XOF', ML: 'XOF', BF: 'XOF', BJ: 'XOF', TG: 'XOF',
  NE: 'XOF', CM: 'XAF', GA: 'XAF', CG: 'XAF', TD: 'XAF', CF: 'XAF', GQ: 'XAF', MU: 'MUR',
  SC: 'SCR', MG: 'MGA', CV: 'CVE', AO: 'AOA', SD: 'SDG', MW: 'MWK',
}

export function currencyForCountry(countryCode) {
  if (!countryCode) return null
  return COUNTRY_CURRENCY[String(countryCode).toUpperCase()] || null
}
