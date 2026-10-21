// Primary flag color per ISO 3166-1 alpha-2 country code
// Used for subtle card accents on trip cards
// Defaults to var(--text) if country not found

export const COUNTRY_COLORS = {
  AD: '#003DA5', AE: '#00732F', AF: '#000000', AG: '#CE1126', AL: '#E41E20',
  AM: '#D90012', AO: '#CC0000', AR: '#74ACDF', AT: '#ED2939', AU: '#00008B',
  AZ: '#0092BC', BA: '#002395', BB: '#00267F', BD: '#006A4E', BE: '#000000',
  BF: '#EF2B2D', BG: '#FFFFFF', BH: '#CE1126', BI: '#CE1126', BJ: '#008751',
  BN: '#F7E017', BO: '#D52B1E', BR: '#009C3B', BS: '#00778B', BT: '#FF8000',
  BW: '#75AADB', BY: '#CF101A', BZ: '#003F87', CA: '#FF0000', CD: '#007FFF',
  CF: '#003082', CG: '#009543', CH: '#FF0000', CI: '#F77F00', CL: '#D52B1E',
  CM: '#007A5E', CN: '#DE2910', CO: '#FCD116', CR: '#002B7F', CU: '#002A8F',
  CV: '#003893', CY: '#FFFFFF', CZ: '#D7141A', DE: '#000000', DJ: '#6AB2E7',
  DK: '#C60C30', DM: '#006B3F', DO: '#002D62', DZ: '#006233', EC: '#FFD100',
  EE: '#0072CE', EG: '#CE1126', ER: '#4189DD', ES: '#AA151B', ET: '#078930',
  FI: '#003580', FJ: '#68BFE5', FM: '#75B2DD', FR: '#002395', GA: '#009E60',
  GB: '#012169', GD: '#CE1126', GE: '#FF0000', GH: '#006B3F', GM: '#3A7728',
  GN: '#CE1126', GQ: '#3E9A00', GR: '#0D5EAF', GT: '#4997D0', GW: '#CE1126',
  GY: '#009E60', HN: '#0073CF', HR: '#FF0000', HT: '#00209F', HU: '#CE2939',
  ID: '#CE1126', IE: '#169B62', IL: '#0038B8', IN: '#FF9933', IQ: '#CE1126',
  IR: '#239F40', IS: '#003897', IT: '#009246', JM: '#000000', JO: '#007A3D',
  JP: '#BC002D', KE: '#006600', KG: '#E8112D', KH: '#032EA1', KI: '#CE1126',
  KM: '#3A75C4', KN: '#009E60', KP: '#024FA2', KR: '#CD2E3A', KW: '#007A3D',
  KZ: '#00AFCA', LA: '#CE1126', LB: '#00A651', LC: '#65CFFF', LI: '#002B7F',
  LK: '#8D153A', LR: '#BF0A30', LS: '#009A44', LT: '#FDB913', LU: '#EF3340',
  LV: '#9E3039', LY: '#000000', MA: '#C1272D', MC: '#CE1126', MD: '#003DA5',
  ME: '#D4AF37', MG: '#FC3D32', MH: '#003893', MK: '#CE2028', ML: '#009A00',
  MM: '#FECB00', MN: '#C4272F', MR: '#006233', MT: '#CF142B', MU: '#EA2839',
  MV: '#D21034', MW: '#000000', MX: '#006847', MY: '#CC0001', MZ: '#009A44',
  NA: '#003580', NE: '#E05206', NG: '#008751', NI: '#3A7728', NL: '#AE1C28',
  NO: '#EF2B2D', NP: '#003893', NR: '#002B7F', NZ: '#00247D', OM: '#DB161B',
  PA: '#005293', PE: '#D91023', PG: '#000000', PH: '#0038A8', PK: '#01411C',
  PL: '#DC143C', PT: '#006600', PW: '#4AADD6', PY: '#D52B1E', QA: '#8D1B3D',
  RO: '#002B7F', RS: '#C6363C', RU: '#D52B1E', RW: '#20603D', SA: '#006C35',
  SB: '#0120A0', SC: '#003F87', SD: '#D21034', SE: '#006AA7', SG: '#EF3340',
  SI: '#003DA5', SK: '#FFFFFF', SL: '#1EB53A', SM: '#5EB6E4', SN: '#00853F',
  SO: '#4189DD', SR: '#377E3F', SS: '#078930', ST: '#12AD2B', SV: '#0F47AF',
  SY: '#CE1126', SZ: '#3E5EB9', TD: '#002664', TG: '#006A4E', TH: '#A51931',
  TJ: '#CC0000', TL: '#DC241F', TM: '#1C6B30', TN: '#E70013', TO: '#C10000',
  TR: '#E30A17', TT: '#CE1126', TV: '#009FCA', TZ: '#1EB53A', UA: '#005BBB',
  UG: '#000000', US: '#B22234', UY: '#FFFFFF', UZ: '#1EB53A', VA: '#FFE000',
  VC: '#009E60', VE: '#CF142B', VN: '#DA251D', VU: '#009543', WS: '#CE1126',
  YE: '#CE1126', ZA: '#007A4D', ZM: '#198A00', ZW: '#006400',
}

// Returns a CSS color string, defaulting to currentColor if not found
export function getCountryColor(countryCode) {
  if (!countryCode) return null
  return COUNTRY_COLORS[countryCode.toUpperCase()] || null
}

// Returns the flag emoji from a 2-letter country code
export function getFlagEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2) return '🌍'
  const code = countryCode.toUpperCase()
  return String.fromCodePoint(
    ...code.split('').map(c => 0x1F1E6 + c.charCodeAt(0) - 65)
  )
}
