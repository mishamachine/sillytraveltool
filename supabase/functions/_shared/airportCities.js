// IATA airport code → the city it serves (common English name), country code and the airport's position
// (approximate, two decimals: enough for trip matching, which works in tens of kilometres).
// Same airports as airportZones.ts. A bare code is never sent to a geocoder: "MAD" alone geocodes to Mád, a village
// in Hungary, and "SEA" to nothing, which named trips "Trip to Mád" and "Trip to SEA".
// Plain JS so the app (Vite), the Edge Functions (Deno) and the offline tests share it.

const A = {
  // United States
  ATL: ['Atlanta', 'US', 33.64, -84.43], BOS: ['Boston', 'US', 42.36, -71.01], BWI: ['Baltimore', 'US', 39.18, -76.67],
  CLT: ['Charlotte', 'US', 35.21, -80.94], DCA: ['Washington', 'US', 38.85, -77.04], IAD: ['Washington', 'US', 38.95, -77.46],
  DTW: ['Detroit', 'US', 42.21, -83.35], EWR: ['New York', 'US', 40.69, -74.17], FLL: ['Fort Lauderdale', 'US', 26.07, -80.15],
  JFK: ['New York', 'US', 40.64, -73.78], LGA: ['New York', 'US', 40.78, -73.87], MCO: ['Orlando', 'US', 28.43, -81.31],
  MIA: ['Miami', 'US', 25.79, -80.29], PHL: ['Philadelphia', 'US', 39.87, -75.24], PIT: ['Pittsburgh', 'US', 40.49, -80.23],
  RDU: ['Raleigh', 'US', 35.88, -78.79], TPA: ['Tampa', 'US', 27.98, -82.53], CLE: ['Cleveland', 'US', 41.41, -81.85],
  CMH: ['Columbus', 'US', 40.00, -82.89], BNA: ['Nashville', 'US', 36.12, -86.68], ORD: ['Chicago', 'US', 41.98, -87.90],
  MDW: ['Chicago', 'US', 41.79, -87.75], DFW: ['Dallas', 'US', 32.90, -97.04], DAL: ['Dallas', 'US', 32.85, -96.85],
  IAH: ['Houston', 'US', 29.99, -95.34], HOU: ['Houston', 'US', 29.65, -95.28], AUS: ['Austin', 'US', 30.19, -97.67],
  SAT: ['San Antonio', 'US', 29.53, -98.47], MSP: ['Minneapolis', 'US', 44.88, -93.22], MSY: ['New Orleans', 'US', 29.99, -90.26],
  STL: ['St. Louis', 'US', 38.75, -90.37], MCI: ['Kansas City', 'US', 39.30, -94.71], MKE: ['Milwaukee', 'US', 42.95, -87.90],
  DEN: ['Denver', 'US', 39.86, -104.67], SLC: ['Salt Lake City', 'US', 40.79, -111.98], ABQ: ['Albuquerque', 'US', 35.04, -106.61],
  PHX: ['Phoenix', 'US', 33.43, -112.01], LAS: ['Las Vegas', 'US', 36.08, -115.15], LAX: ['Los Angeles', 'US', 33.94, -118.41],
  SFO: ['San Francisco', 'US', 37.62, -122.38], OAK: ['Oakland', 'US', 37.72, -122.22], SJC: ['San Jose', 'US', 37.36, -121.93],
  SAN: ['San Diego', 'US', 32.73, -117.19], SMF: ['Sacramento', 'US', 38.70, -121.59], SEA: ['Seattle', 'US', 47.45, -122.31],
  PDX: ['Portland', 'US', 45.59, -122.60], BUR: ['Burbank', 'US', 34.20, -118.36], SNA: ['Santa Ana', 'US', 33.68, -117.87],
  ANC: ['Anchorage', 'US', 61.17, -150.00], HNL: ['Honolulu', 'US', 21.32, -157.92], OGG: ['Kahului', 'US', 20.90, -156.43],
  KOA: ['Kailua-Kona', 'US', 19.74, -156.05], SJU: ['San Juan', 'PR', 18.44, -66.00],
  // Canada
  YYZ: ['Toronto', 'CA', 43.68, -79.63], YTZ: ['Toronto', 'CA', 43.63, -79.40], YOW: ['Ottawa', 'CA', 45.32, -75.67],
  YUL: ['Montreal', 'CA', 45.47, -73.74], YQB: ['Quebec City', 'CA', 46.79, -71.39], YHZ: ['Halifax', 'CA', 44.88, -63.51],
  YYC: ['Calgary', 'CA', 51.13, -114.01], YEG: ['Edmonton', 'CA', 53.31, -113.58], YVR: ['Vancouver', 'CA', 49.19, -123.18],
  YYJ: ['Victoria', 'CA', 48.65, -123.43], YWG: ['Winnipeg', 'CA', 49.91, -97.24], YYT: ["St. John's", 'CA', 47.62, -52.75],
  // Mexico, Caribbean, Central & South America
  MEX: ['Mexico City', 'MX', 19.44, -99.07], GDL: ['Guadalajara', 'MX', 20.52, -103.31], MTY: ['Monterrey', 'MX', 25.78, -100.11],
  CUN: ['Cancún', 'MX', 21.04, -86.87], SJD: ['San José del Cabo', 'MX', 23.15, -109.72], PVR: ['Puerto Vallarta', 'MX', 20.68, -105.25],
  TIJ: ['Tijuana', 'MX', 32.54, -116.97], HAV: ['Havana', 'CU', 22.99, -82.41], NAS: ['Nassau', 'BS', 25.04, -77.47],
  MBJ: ['Montego Bay', 'JM', 18.50, -77.91], PUJ: ['Punta Cana', 'DO', 18.57, -68.36], SDQ: ['Santo Domingo', 'DO', 18.43, -69.67],
  AUA: ['Oranjestad', 'AW', 12.50, -70.02], PTY: ['Panama City', 'PA', 9.07, -79.38], SJO: ['San José', 'CR', 9.99, -84.20],
  LIR: ['Liberia', 'CR', 10.59, -85.54], GUA: ['Guatemala City', 'GT', 14.58, -90.53], SAL: ['San Salvador', 'SV', 13.44, -89.06],
  BOG: ['Bogotá', 'CO', 4.70, -74.15], MDE: ['Medellín', 'CO', 6.16, -75.42], CTG: ['Cartagena', 'CO', 10.44, -75.51],
  UIO: ['Quito', 'EC', -0.13, -78.36], GYE: ['Guayaquil', 'EC', -2.16, -79.88], LIM: ['Lima', 'PE', -12.02, -77.11],
  CUZ: ['Cusco', 'PE', -13.54, -71.94], SCL: ['Santiago', 'CL', -33.39, -70.79], EZE: ['Buenos Aires', 'AR', -34.82, -58.54],
  AEP: ['Buenos Aires', 'AR', -34.56, -58.42], GRU: ['São Paulo', 'BR', -23.43, -46.47], CGH: ['São Paulo', 'BR', -23.63, -46.66],
  GIG: ['Rio de Janeiro', 'BR', -22.81, -43.25], SDU: ['Rio de Janeiro', 'BR', -22.91, -43.16], BSB: ['Brasília', 'BR', -15.87, -47.92],
  MVD: ['Montevideo', 'UY', -34.84, -56.03], ASU: ['Asunción', 'PY', -25.24, -57.52], VVI: ['Santa Cruz de la Sierra', 'BO', -17.64, -63.14],
  LPB: ['La Paz', 'BO', -16.51, -68.19], CCS: ['Caracas', 'VE', 10.60, -66.99],
  // United Kingdom & Ireland
  LHR: ['London', 'GB', 51.47, -0.45], LGW: ['London', 'GB', 51.15, -0.19], STN: ['London', 'GB', 51.89, 0.24],
  LTN: ['London', 'GB', 51.87, -0.37], LCY: ['London', 'GB', 51.50, 0.05], MAN: ['Manchester', 'GB', 53.35, -2.28],
  BHX: ['Birmingham', 'GB', 52.45, -1.75], BRS: ['Bristol', 'GB', 51.38, -2.72], EDI: ['Edinburgh', 'GB', 55.95, -3.37],
  GLA: ['Glasgow', 'GB', 55.87, -4.43], BFS: ['Belfast', 'GB', 54.66, -6.22], NCL: ['Newcastle upon Tyne', 'GB', 55.04, -1.69],
  LPL: ['Liverpool', 'GB', 53.33, -2.85], DUB: ['Dublin', 'IE', 53.42, -6.27], SNN: ['Shannon', 'IE', 52.70, -8.92],
  ORK: ['Cork', 'IE', 51.84, -8.49],
  // Western & Southern Europe
  CDG: ['Paris', 'FR', 49.01, 2.55], ORY: ['Paris', 'FR', 48.72, 2.38], NCE: ['Nice', 'FR', 43.66, 7.22],
  LYS: ['Lyon', 'FR', 45.73, 5.08], MRS: ['Marseille', 'FR', 43.44, 5.22], TLS: ['Toulouse', 'FR', 43.63, 1.37],
  BOD: ['Bordeaux', 'FR', 44.83, -0.72], NTE: ['Nantes', 'FR', 47.15, -1.61], AMS: ['Amsterdam', 'NL', 52.31, 4.76],
  EIN: ['Eindhoven', 'NL', 51.45, 5.37], BRU: ['Brussels', 'BE', 50.90, 4.48], CRL: ['Charleroi', 'BE', 50.46, 4.45],
  LUX: ['Luxembourg', 'LU', 49.63, 6.21], FRA: ['Frankfurt', 'DE', 50.03, 8.57], MUC: ['Munich', 'DE', 48.35, 11.79],
  BER: ['Berlin', 'DE', 52.37, 13.50], DUS: ['Düsseldorf', 'DE', 51.29, 6.77], HAM: ['Hamburg', 'DE', 53.63, 9.99],
  CGN: ['Cologne', 'DE', 50.87, 7.14], STR: ['Stuttgart', 'DE', 48.69, 9.22], ZRH: ['Zürich', 'CH', 47.46, 8.55],
  GVA: ['Geneva', 'CH', 46.24, 6.11], BSL: ['Basel', 'CH', 47.60, 7.53], VIE: ['Vienna', 'AT', 48.11, 16.57],
  SZG: ['Salzburg', 'AT', 47.79, 13.00], MAD: ['Madrid', 'ES', 40.47, -3.57], BCN: ['Barcelona', 'ES', 41.30, 2.08],
  AGP: ['Málaga', 'ES', 36.67, -4.50], PMI: ['Palma', 'ES', 39.55, 2.74], SVQ: ['Seville', 'ES', 37.42, -5.89],
  VLC: ['Valencia', 'ES', 39.49, -0.48], ALC: ['Alicante', 'ES', 38.28, -0.56], BIO: ['Bilbao', 'ES', 43.30, -2.91],
  GRX: ['Granada', 'ES', 37.19, -3.78], IBZ: ['Ibiza', 'ES', 38.87, 1.37], LPA: ['Las Palmas de Gran Canaria', 'ES', 27.93, -15.39],
  TFS: ['Tenerife', 'ES', 28.04, -16.57], TFN: ['Tenerife', 'ES', 28.48, -16.34], ACE: ['Arrecife', 'ES', 28.95, -13.61],
  LIS: ['Lisbon', 'PT', 38.77, -9.13], OPO: ['Porto', 'PT', 41.24, -8.68], FAO: ['Faro', 'PT', 37.01, -7.97],
  FNC: ['Funchal', 'PT', 32.69, -16.77], PDL: ['Ponta Delgada', 'PT', 37.74, -25.70], FCO: ['Rome', 'IT', 41.80, 12.25],
  CIA: ['Rome', 'IT', 41.80, 12.59], MXP: ['Milan', 'IT', 45.63, 8.72], LIN: ['Milan', 'IT', 45.45, 9.28],
  BGY: ['Milan', 'IT', 45.67, 9.70], VCE: ['Venice', 'IT', 45.51, 12.35], NAP: ['Naples', 'IT', 40.88, 14.29],
  BLQ: ['Bologna', 'IT', 44.53, 11.29], FLR: ['Florence', 'IT', 43.81, 11.20], PSA: ['Pisa', 'IT', 43.68, 10.39],
  CTA: ['Catania', 'IT', 37.47, 15.07], PMO: ['Palermo', 'IT', 38.18, 13.10], BRI: ['Bari', 'IT', 41.14, 16.76],
  TRN: ['Turin', 'IT', 45.20, 7.65], MLA: ['Valletta', 'MT', 35.86, 14.48], ATH: ['Athens', 'GR', 37.94, 23.94],
  HER: ['Heraklion', 'GR', 35.34, 25.18], JTR: ['Santorini', 'GR', 36.40, 25.48], JMK: ['Mykonos', 'GR', 37.44, 25.35],
  RHO: ['Rhodes', 'GR', 36.41, 28.09], CFU: ['Corfu', 'GR', 39.60, 19.91], SKG: ['Thessaloniki', 'GR', 40.52, 22.97],
  LCA: ['Larnaca', 'CY', 34.88, 33.63], PFO: ['Paphos', 'CY', 34.72, 32.49],
  // Northern, Central & Eastern Europe
  CPH: ['Copenhagen', 'DK', 55.62, 12.65], ARN: ['Stockholm', 'SE', 59.65, 17.92], GOT: ['Gothenburg', 'SE', 57.66, 12.28],
  OSL: ['Oslo', 'NO', 60.19, 11.10], BGO: ['Bergen', 'NO', 60.29, 5.22], HEL: ['Helsinki', 'FI', 60.32, 24.96],
  KEF: ['Reykjavík', 'IS', 63.98, -22.61], TLL: ['Tallinn', 'EE', 59.41, 24.83], RIX: ['Riga', 'LV', 56.92, 23.97],
  VNO: ['Vilnius', 'LT', 54.63, 25.29], WAW: ['Warsaw', 'PL', 52.17, 20.97], KRK: ['Kraków', 'PL', 50.08, 19.78],
  GDN: ['Gdańsk', 'PL', 54.38, 18.47], PRG: ['Prague', 'CZ', 50.10, 14.26], BUD: ['Budapest', 'HU', 47.44, 19.26],
  BTS: ['Bratislava', 'SK', 48.17, 17.21], LJU: ['Ljubljana', 'SI', 46.22, 14.46], ZAG: ['Zagreb', 'HR', 45.74, 16.07],
  SPU: ['Split', 'HR', 43.54, 16.30], DBV: ['Dubrovnik', 'HR', 42.56, 18.27], BEG: ['Belgrade', 'RS', 44.82, 20.31],
  OTP: ['Bucharest', 'RO', 44.57, 26.08], SOF: ['Sofia', 'BG', 42.70, 23.41], TIA: ['Tirana', 'AL', 41.41, 19.72],
  SKP: ['Skopje', 'MK', 41.96, 21.62], KBP: ['Kyiv', 'UA', 50.35, 30.89], IST: ['Istanbul', 'TR', 41.26, 28.74],
  SAW: ['Istanbul', 'TR', 40.90, 29.31], AYT: ['Antalya', 'TR', 36.90, 30.80], ADB: ['Izmir', 'TR', 38.29, 27.16],
  ESB: ['Ankara', 'TR', 40.13, 32.99], DLM: ['Dalaman', 'TR', 36.71, 28.79], BJV: ['Bodrum', 'TR', 37.25, 27.66],
  TBS: ['Tbilisi', 'GE', 41.67, 44.95], EVN: ['Yerevan', 'AM', 40.15, 44.40], GYD: ['Baku', 'AZ', 40.47, 50.05],
  // Middle East & Africa
  DXB: ['Dubai', 'AE', 25.25, 55.36], DWC: ['Dubai', 'AE', 24.90, 55.16], AUH: ['Abu Dhabi', 'AE', 24.43, 54.65],
  SHJ: ['Sharjah', 'AE', 25.33, 55.52], DOH: ['Doha', 'QA', 25.27, 51.61], BAH: ['Manama', 'BH', 26.27, 50.63],
  KWI: ['Kuwait City', 'KW', 29.24, 47.97], MCT: ['Muscat', 'OM', 23.59, 58.28], RUH: ['Riyadh', 'SA', 24.96, 46.70],
  JED: ['Jeddah', 'SA', 21.68, 39.16], DMM: ['Dammam', 'SA', 26.47, 49.80], AMM: ['Amman', 'JO', 31.72, 35.99],
  TLV: ['Tel Aviv', 'IL', 32.01, 34.89], BEY: ['Beirut', 'LB', 33.82, 35.49], CAI: ['Cairo', 'EG', 30.12, 31.41],
  HRG: ['Hurghada', 'EG', 27.18, 33.80], SSH: ['Sharm El Sheikh', 'EG', 27.98, 34.39], CMN: ['Casablanca', 'MA', 33.37, -7.59],
  RAK: ['Marrakesh', 'MA', 31.61, -8.04], TUN: ['Tunis', 'TN', 36.85, 10.23], ALG: ['Algiers', 'DZ', 36.69, 3.22],
  ADD: ['Addis Ababa', 'ET', 8.98, 38.80], NBO: ['Nairobi', 'KE', -1.32, 36.93], MBA: ['Mombasa', 'KE', -4.03, 39.59],
  DAR: ['Dar es Salaam', 'TZ', -6.88, 39.20], ZNZ: ['Zanzibar', 'TZ', -6.22, 39.22], JRO: ['Arusha', 'TZ', -3.43, 37.07],
  EBB: ['Entebbe', 'UG', 0.04, 32.44], KGL: ['Kigali', 'RW', -1.97, 30.14], LOS: ['Lagos', 'NG', 6.58, 3.32],
  ABV: ['Abuja', 'NG', 9.01, 7.26], ACC: ['Accra', 'GH', 5.61, -0.17], DSS: ['Dakar', 'SN', 14.67, -17.07],
  JNB: ['Johannesburg', 'ZA', -26.14, 28.24], CPT: ['Cape Town', 'ZA', -33.97, 18.60], DUR: ['Durban', 'ZA', -29.61, 31.12],
  WDH: ['Windhoek', 'NA', -22.48, 17.47], VFA: ['Victoria Falls', 'ZW', -18.10, 25.84], MRU: ['Port Louis', 'MU', -20.43, 57.68],
  SEZ: ['Victoria', 'SC', -4.67, 55.52], RUN: ['Saint-Denis', 'RE', -20.89, 55.51],
  // South & Central Asia
  DEL: ['New Delhi', 'IN', 28.56, 77.10], BOM: ['Mumbai', 'IN', 19.09, 72.87], BLR: ['Bengaluru', 'IN', 13.20, 77.71],
  MAA: ['Chennai', 'IN', 12.99, 80.17], HYD: ['Hyderabad', 'IN', 17.24, 78.43], CCU: ['Kolkata', 'IN', 22.65, 88.45],
  GOI: ['Goa', 'IN', 15.38, 73.83], GOX: ['Goa', 'IN', 15.73, 73.86], COK: ['Kochi', 'IN', 10.15, 76.40],
  AMD: ['Ahmedabad', 'IN', 23.07, 72.63], CMB: ['Colombo', 'LK', 7.18, 79.88], MLE: ['Malé', 'MV', 4.19, 73.53],
  KTM: ['Kathmandu', 'NP', 27.70, 85.36], DAC: ['Dhaka', 'BD', 23.84, 90.40], KHI: ['Karachi', 'PK', 24.91, 67.16],
  LHE: ['Lahore', 'PK', 31.52, 74.40], ISB: ['Islamabad', 'PK', 33.55, 72.83], TAS: ['Tashkent', 'UZ', 41.26, 69.28],
  ALA: ['Almaty', 'KZ', 43.35, 77.04], NQZ: ['Astana', 'KZ', 51.02, 71.47],
  // East & Southeast Asia
  NRT: ['Tokyo', 'JP', 35.77, 140.39], HND: ['Tokyo', 'JP', 35.55, 139.78], KIX: ['Osaka', 'JP', 34.43, 135.24],
  ITM: ['Osaka', 'JP', 34.79, 135.44], NGO: ['Nagoya', 'JP', 34.86, 136.81], CTS: ['Sapporo', 'JP', 42.78, 141.69],
  FUK: ['Fukuoka', 'JP', 33.59, 130.45], OKA: ['Naha', 'JP', 26.20, 127.65], ICN: ['Seoul', 'KR', 37.46, 126.44],
  GMP: ['Seoul', 'KR', 37.56, 126.79], PUS: ['Busan', 'KR', 35.18, 128.94], CJU: ['Jeju', 'KR', 33.51, 126.49],
  PEK: ['Beijing', 'CN', 40.08, 116.58], PKX: ['Beijing', 'CN', 39.51, 116.41], PVG: ['Shanghai', 'CN', 31.14, 121.81],
  SHA: ['Shanghai', 'CN', 31.20, 121.34], CAN: ['Guangzhou', 'CN', 23.39, 113.30], SZX: ['Shenzhen', 'CN', 22.64, 113.81],
  CTU: ['Chengdu', 'CN', 30.58, 103.95], TFU: ['Chengdu', 'CN', 30.31, 104.44], XIY: ["Xi'an", 'CN', 34.45, 108.75],
  KMG: ['Kunming', 'CN', 25.10, 102.93], HGH: ['Hangzhou', 'CN', 30.23, 120.43], HKG: ['Hong Kong', 'HK', 22.31, 113.92],
  MFM: ['Macau', 'MO', 22.15, 113.59], TPE: ['Taipei', 'TW', 25.08, 121.23], TSA: ['Taipei', 'TW', 25.07, 121.55],
  KHH: ['Kaohsiung', 'TW', 22.58, 120.35], ULN: ['Ulaanbaatar', 'MN', 47.65, 106.82], MNL: ['Manila', 'PH', 14.51, 121.02],
  CEB: ['Cebu', 'PH', 10.31, 123.98], SIN: ['Singapore', 'SG', 1.36, 103.99], KUL: ['Kuala Lumpur', 'MY', 2.74, 101.70],
  PEN: ['George Town', 'MY', 5.30, 100.28], BKI: ['Kota Kinabalu', 'MY', 5.94, 116.05], CGK: ['Jakarta', 'ID', -6.13, 106.66],
  DPS: ['Denpasar', 'ID', -8.75, 115.17], BKK: ['Bangkok', 'TH', 13.69, 100.75], DMK: ['Bangkok', 'TH', 13.91, 100.61],
  HKT: ['Phuket', 'TH', 8.11, 98.31], CNX: ['Chiang Mai', 'TH', 18.77, 98.96], USM: ['Ko Samui', 'TH', 9.55, 100.06],
  KBV: ['Krabi', 'TH', 8.10, 98.99], SGN: ['Ho Chi Minh City', 'VN', 10.82, 106.66], HAN: ['Hanoi', 'VN', 21.22, 105.81],
  DAD: ['Da Nang', 'VN', 16.04, 108.20], PNH: ['Phnom Penh', 'KH', 11.55, 104.84], REP: ['Siem Reap', 'KH', 13.41, 103.81],
  SAI: ['Siem Reap', 'KH', 13.37, 104.22], VTE: ['Vientiane', 'LA', 17.99, 102.56], LPQ: ['Luang Prabang', 'LA', 19.90, 102.16],
  RGN: ['Yangon', 'MM', 16.91, 96.13],
  // Oceania
  SYD: ['Sydney', 'AU', -33.94, 151.18], MEL: ['Melbourne', 'AU', -37.67, 144.84], BNE: ['Brisbane', 'AU', -27.38, 153.12],
  OOL: ['Gold Coast', 'AU', -28.16, 153.51], CNS: ['Cairns', 'AU', -16.88, 145.75], PER: ['Perth', 'AU', -31.94, 115.97],
  ADL: ['Adelaide', 'AU', -34.95, 138.53], CBR: ['Canberra', 'AU', -35.31, 149.19], HBA: ['Hobart', 'AU', -42.84, 147.51],
  DRW: ['Darwin', 'AU', -12.41, 130.88], AKL: ['Auckland', 'NZ', -37.01, 174.79], WLG: ['Wellington', 'NZ', -41.33, 174.81],
  CHC: ['Christchurch', 'NZ', -43.49, 172.53], ZQN: ['Queenstown', 'NZ', -45.02, 168.74], NAN: ['Nadi', 'FJ', -17.76, 177.44],
  PPT: ['Papeete', 'PF', -17.55, -149.61], NOU: ['Nouméa', 'NC', -22.01, 166.21],
}

/** The 3-letter code in "MAD", "MAD airport" or "Madrid (MAD)", else null. */
export function iataOf(s) {
  const t = String(s ?? '').trim()
  // Upper case only for a bare code: "Nan" (Thailand) and "Hue" (Vietnam) are city names
  const m = /^([A-Z]{3})$/.exec(t) || /^([A-Za-z]{3})\s+airport$/i.exec(t) || /\(([A-Z]{3})\)\s*$/.exec(t)
  return m ? m[1].toUpperCase() : null
}

/** { city, country_code, lat, lng } for a known airport code (or "XXX airport"), else null. */
export function airportCity(code) {
  const c = iataOf(code)
  const a = c && A[c]
  return a ? { code: c, city: a[0], country_code: a[1], lat: a[2], lng: a[3] } : null
}

/** A city name fit for a trip title: an airport code becomes its city; an unknown bare code gives null. */
export function cityName(s) {
  const t = String(s ?? '').trim()
  if (!t) return null
  const a = airportCity(t)
  if (a) return a.city
  return /^[A-Z]{3}$/.test(t) ? null : t
}
