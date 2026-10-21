// Goose bust SVG component
// All 22 variants share viewBox="0 0 100 100"
// Usage: <Goose variant="happy" size={64} />

const variants = {
  happy: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <ellipse cx="4" cy="70" rx="14" ry="20" fill="#E8E3DB" stroke="#2A2520" strokeWidth="4" transform="rotate(-32 4 70)"/>
      <ellipse cx="96" cy="70" rx="14" ry="20" fill="#E8E3DB" stroke="#2A2520" strokeWidth="4" transform="rotate(32 96 70)"/>
      <path d="M33 60 Q29 78 27 100 L73 100 Q71 78 67 60 Q59 67 50 67 Q41 67 33 60Z" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4" strokeLinejoin="round"/>
      <circle cx="50" cy="35" r="28" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4"/>
      <circle cx="27" cy="42" r="7" fill="#C4561E" opacity=".18"/>
      <circle cx="64" cy="45" r="5" fill="#C4561E" opacity=".14"/>
      <circle cx="39" cy="29" r="8" fill="#fff" stroke="#2A2520" strokeWidth="3"/>
      <circle cx="37.5" cy="28" r="4.5" fill="#2A2520"/>
      <circle cx="35.5" cy="26" r="1.8" fill="#fff"/>
      <path d="M35 49 Q44 57 53 49" stroke="#2A2520" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
      <path d="M57 31 Q72 27 76 33 Q72 39 57 37Z" fill="#E8A820" stroke="#2A2520" strokeWidth="3" strokeLinejoin="round"/>
      <path d="M57 37 Q70 37 74 42 Q68 47 57 41Z" fill="#D4910A" stroke="#2A2520" strokeWidth="2.5" strokeLinejoin="round"/>
      <circle cx="84" cy="15" r="8" fill="#2D8B55" stroke="#2A2520" strokeWidth="3"/>
      <circle cx="84" cy="15" r="3.5" fill="#fff"/>
    </svg>
  ),

  sleeping: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <ellipse cx="10" cy="78" rx="12" ry="18" fill="#2E2A24" stroke="#4A453E" strokeWidth="4" transform="rotate(-12 10 78)"/>
      <ellipse cx="90" cy="78" rx="12" ry="18" fill="#2E2A24" stroke="#4A453E" strokeWidth="4" transform="rotate(12 90 78)"/>
      <path d="M33 60 Q29 78 27 100 L73 100 Q71 78 67 60 Q59 67 50 67 Q41 67 33 60Z" fill="#2E2A24" stroke="#4A453E" strokeWidth="4" strokeLinejoin="round"/>
      <circle cx="50" cy="37" r="28" fill="#2E2A24" stroke="#4A453E" strokeWidth="4"/>
      <path d="M28 31 Q39 25 48 31" stroke="#6B6355" strokeWidth="4.5" strokeLinecap="round" fill="none"/>
      <path d="M57 33 Q66 29 72 33" stroke="#6B6355" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
      <path d="M57 33 Q68 31 72 35 Q68 40 57 38Z" fill="#C47A10" stroke="#4A453E" strokeWidth="2.5" opacity=".6"/>
    </svg>
  ),

  excited: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <ellipse cx="2" cy="58" rx="14" ry="20" fill="#E8E3DB" stroke="#2A2520" strokeWidth="4" transform="rotate(-52 2 58)"/>
      <ellipse cx="98" cy="58" rx="14" ry="20" fill="#E8E3DB" stroke="#2A2520" strokeWidth="4" transform="rotate(52 98 58)"/>
      <path d="M33 60 Q29 78 27 100 L73 100 Q71 78 67 60 Q59 67 50 67 Q41 67 33 60Z" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4" strokeLinejoin="round"/>
      <circle cx="50" cy="35" r="28" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4"/>
      <circle cx="38" cy="29" r="10" fill="#fff" stroke="#2A2520" strokeWidth="3.5"/>
      <circle cx="36.5" cy="27.5" r="6" fill="#2A2520"/>
      <circle cx="34.5" cy="25.5" r="2.2" fill="#fff"/>
      <path d="M28 49 Q44 63 60 49" stroke="#2A2520" strokeWidth="4" strokeLinecap="round" fill="none"/>
      <path d="M57 31 Q72 27 76 33 Q72 39 57 37Z" fill="#E8A820" stroke="#2A2520" strokeWidth="3" strokeLinejoin="round"/>
    </svg>
  ),

  worried: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <ellipse cx="8" cy="76" rx="14" ry="22" fill="#E8E3DB" stroke="#2A2520" strokeWidth="4" transform="rotate(-22 8 76)"/>
      <ellipse cx="92" cy="76" rx="14" ry="22" fill="#E8E3DB" stroke="#2A2520" strokeWidth="4" transform="rotate(22 92 76)"/>
      <path d="M33 60 Q29 78 27 100 L73 100 Q71 78 67 60 Q59 67 50 67 Q41 67 33 60Z" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4" strokeLinejoin="round"/>
      <circle cx="50" cy="35" r="28" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4"/>
      <path d="M24 21 Q34 16 43 21" stroke="#2A2520" strokeWidth="4.5" strokeLinecap="round" fill="none"/>
      <circle cx="39" cy="29" r="8" fill="#fff" stroke="#2A2520" strokeWidth="3"/>
      <circle cx="37.5" cy="28" r="4.5" fill="#2A2520"/>
      <circle cx="35.5" cy="26" r="1.8" fill="#fff"/>
      <path d="M32 50 Q39 46 46 50 Q53 54 58 50" stroke="#2A2520" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
      <ellipse cx="70" cy="18" rx="4" ry="6" fill="#4A7FC4" stroke="#2A2520" strokeWidth="2.5"/>
      <circle cx="70" cy="13" r="3" fill="#4A7FC4" stroke="#2A2520" strokeWidth="2"/>
      <path d="M57 31 Q72 27 76 33 Q72 39 57 37Z" fill="#E8A820" stroke="#2A2520" strokeWidth="3" strokeLinejoin="round"/>
    </svg>
  ),

  lost: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <ellipse cx="8" cy="76" rx="14" ry="22" fill="#E8E3DB" stroke="#2A2520" strokeWidth="4" transform="rotate(-22 8 76)"/>
      <ellipse cx="92" cy="70" rx="13" ry="19" fill="#E8E3DB" stroke="#2A2520" strokeWidth="4" transform="rotate(16 92 70)"/>
      <rect x="73" y="52" width="22" height="16" rx="3" fill="#FFF0EB" stroke="#2A2520" strokeWidth="3" transform="rotate(12 84 60)"/>
      <path d="M33 60 Q29 78 27 100 L73 100 Q71 78 67 60 Q59 67 50 67 Q41 67 33 60Z" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4" strokeLinejoin="round"/>
      <circle cx="50" cy="35" r="28" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4"/>
      <circle cx="39" cy="29" r="8" fill="#fff" stroke="#2A2520" strokeWidth="3"/>
      <circle cx="39" cy="29" r="5" fill="none" stroke="#2A2520" strokeWidth="2"/>
      <circle cx="39" cy="29" r="2" fill="#2A2520"/>
      <path d="M35 50 Q43 47 50 51" stroke="#2A2520" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
      <text x="10" y="27" fontFamily="Space Grotesk" fontSize="22" fontWeight="900" fill="#C4561E" stroke="#2A2520" strokeWidth="2" paintOrder="stroke">?</text>
      <path d="M57 31 Q72 27 76 33 Q72 39 57 37Z" fill="#E8A820" stroke="#2A2520" strokeWidth="3" strokeLinejoin="round"/>
    </svg>
  ),

  hungry: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <ellipse cx="8" cy="76" rx="14" ry="22" fill="#E8E3DB" stroke="#2A2520" strokeWidth="4" transform="rotate(-22 8 76)"/>
      <ellipse cx="92" cy="70" rx="13" ry="19" fill="#E8E3DB" stroke="#2A2520" strokeWidth="4" transform="rotate(22 92 70)"/>
      <line x1="84" y1="53" x2="84" y2="78" stroke="#2A2520" strokeWidth="4.5" strokeLinecap="round"/>
      <circle cx="84" cy="50" r="5.5" fill="none" stroke="#2A2520" strokeWidth="3.5"/>
      <path d="M33 60 Q29 78 27 100 L73 100 Q71 78 67 60 Q59 67 50 67 Q41 67 33 60Z" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4" strokeLinejoin="round"/>
      <circle cx="50" cy="35" r="28" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4"/>
      <circle cx="39" cy="29" r="8" fill="#fff" stroke="#2A2520" strokeWidth="3"/>
      <circle cx="37.5" cy="28" r="4.5" fill="#2A2520"/>
      <circle cx="35.5" cy="26" r="1.8" fill="#fff"/>
      <ellipse cx="66" cy="50" rx="6" ry="5" fill="#E85C7A" stroke="#2A2520" strokeWidth="2.5"/>
      <path d="M57 31 Q72 27 76 33 Q72 39 57 37Z" fill="#E8A820" stroke="#2A2520" strokeWidth="3" strokeLinejoin="round"/>
    </svg>
  ),

  fancy: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <ellipse cx="8" cy="76" rx="14" ry="22" fill="#E8E3DB" stroke="#2A2520" strokeWidth="4" transform="rotate(-22 8 76)"/>
      <ellipse cx="92" cy="76" rx="14" ry="22" fill="#E8E3DB" stroke="#2A2520" strokeWidth="4" transform="rotate(22 92 76)"/>
      <path d="M33 60 Q29 78 27 100 L73 100 Q71 78 67 60 Q59 67 50 67 Q41 67 33 60Z" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4" strokeLinejoin="round"/>
      <path d="M32 66 L42 73 L32 80Z" fill="#C4561E" stroke="#2A2520" strokeWidth="2.5"/>
      <path d="M68 66 L58 73 L68 80Z" fill="#C4561E" stroke="#2A2520" strokeWidth="2.5"/>
      <circle cx="50" cy="73" r="5" fill="#A3431A" stroke="#2A2520" strokeWidth="2.5"/>
      <circle cx="50" cy="35" r="28" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4"/>
      <rect x="26" y="0" width="48" height="20" rx="4" fill="#2A2520" stroke="#2A2520" strokeWidth="3"/>
      <rect x="18" y="18" width="64" height="8" rx="3" fill="#2A2520" stroke="#2A2520" strokeWidth="3"/>
      <circle cx="41" cy="29" r="10" fill="rgba(180,210,255,.25)" stroke="#2A2520" strokeWidth="3.5"/>
      <circle cx="39.5" cy="27.5" r="5" fill="#2A2520"/>
      <circle cx="37.5" cy="25.5" r="2" fill="#fff"/>
      <line x1="50" y1="37" x2="55" y2="44" stroke="#2A2520" strokeWidth="3"/>
      <path d="M57 31 Q72 27 76 33 Q72 39 57 37Z" fill="#E8A820" stroke="#2A2520" strokeWidth="3" strokeLinejoin="round"/>
    </svg>
  ),

  broke: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <ellipse cx="8" cy="76" rx="14" ry="22" fill="#E8E3DB" stroke="#2A2520" strokeWidth="4" transform="rotate(-22 8 76)"/>
      <ellipse cx="93" cy="70" rx="12" ry="18" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4" transform="rotate(26 93 70)"/>
      <path d="M84 58 Q88 52 95 58 Q93 68 86 68Z" fill="#E8E3DB" stroke="#2A2520" strokeWidth="2.5"/>
      <path d="M33 60 Q29 78 27 100 L73 100 Q71 78 67 60 Q59 67 50 67 Q41 67 33 60Z" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4" strokeLinejoin="round"/>
      <circle cx="50" cy="35" r="28" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4"/>
      <circle cx="39" cy="29" r="8" fill="#fff" stroke="#2A2520" strokeWidth="3"/>
      <circle cx="37.5" cy="28" r="4.5" fill="#2A2520"/>
      <circle cx="35.5" cy="26" r="1.8" fill="#fff"/>
      <path d="M33 50 Q44 58 55 50" stroke="#2A2520" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
      <path d="M57 31 Q72 27 76 33 Q72 39 57 37Z" fill="#E8A820" stroke="#2A2520" strokeWidth="3" strokeLinejoin="round"/>
      <circle cx="17" cy="90" r="7" fill="#E8A820" stroke="#2A2520" strokeWidth="3"/>
    </svg>
  ),

  pilot: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <ellipse cx="8" cy="76" rx="14" ry="22" fill="#E8E3DB" stroke="#2A2520" strokeWidth="4" transform="rotate(-22 8 76)"/>
      <ellipse cx="92" cy="76" rx="14" ry="22" fill="#E8E3DB" stroke="#2A2520" strokeWidth="4" transform="rotate(22 92 76)"/>
      <path d="M33 60 Q29 78 27 100 L73 100 Q71 78 67 60 Q59 67 50 67 Q41 67 33 60Z" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4" strokeLinejoin="round"/>
      <circle cx="50" cy="35" r="28" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4"/>
      <rect x="26" y="3" width="48" height="17" rx="4" fill="#1A73E8" stroke="#2A2520" strokeWidth="4"/>
      <rect x="18" y="18" width="64" height="8" rx="3" fill="#1A73E8" stroke="#2A2520" strokeWidth="4"/>
      <rect x="20" y="19" width="60" height="4" rx="2" fill="#E8A820" stroke="#2A2520" strokeWidth="2"/>
      <rect x="21" y="25" width="20" height="12" rx="5" fill="rgba(26,115,232,.6)" stroke="#2A2520" strokeWidth="3.5"/>
      <rect x="45" y="25" width="20" height="12" rx="5" fill="rgba(26,115,232,.6)" stroke="#2A2520" strokeWidth="3.5"/>
      <line x1="41" y1="31" x2="45" y2="31" stroke="#2A2520" strokeWidth="3.5"/>
      <path d="M33 51 Q44 58 55 51" stroke="#2A2520" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
      <path d="M57 31 Q72 27 76 33 Q72 39 57 37Z" fill="#E8A820" stroke="#2A2520" strokeWidth="3" strokeLinejoin="round"/>
    </svg>
  ),

  sos: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <ellipse cx="8" cy="76" rx="14" ry="22" fill="#FFEEEE" stroke="#D93025" strokeWidth="4" transform="rotate(-22 8 76)"/>
      <ellipse cx="92" cy="70" rx="14" ry="20" fill="#fff" stroke="#D93025" strokeWidth="4" transform="rotate(22 92 70)"/>
      <rect x="85" y="57" width="14" height="5" rx="2.5" fill="#D93025"/>
      <rect x="90" y="52" width="5" height="14" rx="2.5" fill="#D93025"/>
      <path d="M33 60 Q29 78 27 100 L73 100 Q71 78 67 60 Q59 67 50 67 Q41 67 33 60Z" fill="#FFEEEE" stroke="#D93025" strokeWidth="4" strokeLinejoin="round"/>
      <circle cx="50" cy="35" r="28" fill="#FFEEEE" stroke="#D93025" strokeWidth="4"/>
      <circle cx="39" cy="29" r="8" fill="#fff" stroke="#D93025" strokeWidth="3"/>
      <circle cx="37.5" cy="28" r="4.5" fill="#2A2520"/>
      <circle cx="35.5" cy="26" r="1.8" fill="#fff"/>
      <line x1="33" y1="51" x2="57" y2="51" stroke="#D93025" strokeWidth="4.5" strokeLinecap="round"/>
      <path d="M57 31 Q72 27 76 33 Q72 39 57 37Z" fill="#E8A820" stroke="#D93025" strokeWidth="3" strokeLinejoin="round"/>
    </svg>
  ),

  celebrating: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <ellipse cx="2" cy="60" rx="14" ry="20" fill="#E8E3DB" stroke="#2A2520" strokeWidth="4" transform="rotate(-52 2 60)"/>
      <ellipse cx="98" cy="60" rx="14" ry="20" fill="#E8E3DB" stroke="#2A2520" strokeWidth="4" transform="rotate(52 98 60)"/>
      <path d="M33 60 Q29 78 27 100 L73 100 Q71 78 67 60 Q59 67 50 67 Q41 67 33 60Z" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4" strokeLinejoin="round"/>
      <circle cx="50" cy="35" r="28" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4"/>
      <path d="M28 12 L50 -8 L72 12Z" fill="#C4561E" stroke="#2A2520" strokeWidth="4" strokeLinejoin="round"/>
      <circle cx="50" cy="-8" r="6" fill="#E8A820" stroke="#2A2520" strokeWidth="3"/>
      <circle cx="38" cy="29" r="10" fill="#fff" stroke="#2A2520" strokeWidth="3.5"/>
      <circle cx="36.5" cy="27.5" r="6" fill="#2A2520"/>
      <circle cx="34.5" cy="25.5" r="2.2" fill="#fff"/>
      <path d="M25 50 Q44 66 63 50" stroke="#2A2520" strokeWidth="4.5" strokeLinecap="round" fill="none"/>
      <path d="M57 31 Q72 27 76 33 Q72 39 57 37Z" fill="#E8A820" stroke="#2A2520" strokeWidth="3" strokeLinejoin="round"/>
    </svg>
  ),

  trophy: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <ellipse cx="4" cy="66" rx="14" ry="19" fill="rgba(255,255,255,.22)" stroke="#fff" strokeWidth="4" transform="rotate(-40 4 66)"/>
      <ellipse cx="96" cy="66" rx="14" ry="19" fill="rgba(255,255,255,.22)" stroke="#fff" strokeWidth="4" transform="rotate(40 96 66)"/>
      <path d="M33 60 Q29 78 27 100 L73 100 Q71 78 67 60 Q59 67 50 67 Q41 67 33 60Z" fill="rgba(255,255,255,.22)" stroke="#fff" strokeWidth="4" strokeLinejoin="round"/>
      <path d="M68 28 L68 58 L88 58 L88 28Z" fill="#E8A820" stroke="#fff" strokeWidth="3.5"/>
      <path d="M68 34 Q60 34 60 43 Q60 52 68 52" stroke="#fff" strokeWidth="3" fill="none"/>
      <path d="M88 34 Q96 34 96 43 Q96 52 88 52" stroke="#fff" strokeWidth="3" fill="none"/>
      <circle cx="50" cy="35" r="28" fill="rgba(255,255,255,.22)" stroke="#fff" strokeWidth="4"/>
      <circle cx="39" cy="29" r="8" fill="#fff" stroke="#fff" strokeWidth="3"/>
      <circle cx="37.5" cy="28" r="4.5" fill="#2A2520"/>
      <circle cx="35.5" cy="26" r="1.8" fill="#fff"/>
      <path d="M29 50 Q44 63 59 50" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none"/>
      <path d="M57 31 Q72 27 76 33 Q72 39 57 37Z" fill="#E8A820" stroke="#fff" strokeWidth="3" strokeLinejoin="round"/>
    </svg>
  ),

  detective: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <ellipse cx="8" cy="76" rx="14" ry="22" fill="#E8E3DB" stroke="#2A2520" strokeWidth="4" transform="rotate(-22 8 76)"/>
      <ellipse cx="92" cy="76" rx="14" ry="22" fill="#E8E3DB" stroke="#2A2520" strokeWidth="4" transform="rotate(22 92 76)"/>
      <path d="M33 60 Q29 78 27 100 L73 100 Q71 78 67 60 Q59 67 50 67 Q41 67 33 60Z" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4" strokeLinejoin="round"/>
      <circle cx="50" cy="35" r="28" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4"/>
      {/* Magnifying glass in wing */}
      <circle cx="82" cy="62" r="9" fill="none" stroke="#2A2520" strokeWidth="3.5"/>
      <line x1="88" y1="68" x2="96" y2="76" stroke="#2A2520" strokeWidth="3.5" strokeLinecap="round"/>
      {/* Hat */}
      <rect x="22" y="0" width="56" height="14" rx="3" fill="#2A2520"/>
      <rect x="14" y="12" width="72" height="8" rx="3" fill="#2A2520"/>
      <circle cx="39" cy="30" r="8" fill="#fff" stroke="#2A2520" strokeWidth="3"/>
      <circle cx="37.5" cy="29" r="4.5" fill="#2A2520"/>
      <circle cx="35.5" cy="27" r="1.8" fill="#fff"/>
      <path d="M33 50 Q44 56 55 50" stroke="#2A2520" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
      <path d="M57 31 Q72 27 76 33 Q72 39 57 37Z" fill="#E8A820" stroke="#2A2520" strokeWidth="3" strokeLinejoin="round"/>
    </svg>
  ),



  museum: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <ellipse cx="8" cy="76" rx="14" ry="22" fill="#E8E3DB" stroke="#2A2520" strokeWidth="4" transform="rotate(-22 8 76)"/>
      <ellipse cx="92" cy="76" rx="14" ry="22" fill="#E8E3DB" stroke="#2A2520" strokeWidth="4" transform="rotate(22 92 76)"/>
      <path d="M33 60 Q29 78 27 100 L73 100 Q71 78 67 60 Q59 67 50 67 Q41 67 33 60Z" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4" strokeLinejoin="round"/>
      <circle cx="50" cy="35" r="28" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4"/>
      {/* Museum columns hat */}
      <rect x="20" y="14" width="60" height="6" rx="2" fill="#7B61C4" stroke="#2A2520" strokeWidth="3"/>
      <rect x="14" y="18" width="72" height="5" rx="2" fill="#7B61C4" stroke="#2A2520" strokeWidth="3"/>
      <rect x="24" y="4" width="8" height="12" rx="2" fill="#7B61C4" stroke="#2A2520" strokeWidth="2.5"/>
      <rect x="38" y="4" width="8" height="12" rx="2" fill="#7B61C4" stroke="#2A2520" strokeWidth="2.5"/>
      <rect x="52" y="4" width="8" height="12" rx="2" fill="#7B61C4" stroke="#2A2520" strokeWidth="2.5"/>
      <rect x="66" y="4" width="8" height="12" rx="2" fill="#7B61C4" stroke="#2A2520" strokeWidth="2.5"/>
      <circle cx="39" cy="32" r="8" fill="#fff" stroke="#2A2520" strokeWidth="3"/>
      <circle cx="37.5" cy="31" r="4.5" fill="#2A2520"/>
      <circle cx="35.5" cy="29" r="1.8" fill="#fff"/>
      <path d="M30 52 Q44 60 58 52" stroke="#2A2520" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
      <path d="M57 31 Q72 27 76 33 Q72 39 57 37Z" fill="#E8A820" stroke="#2A2520" strokeWidth="3" strokeLinejoin="round"/>
    </svg>
  ),

  passport: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <ellipse cx="8" cy="76" rx="14" ry="22" fill="#E8E3DB" stroke="#2A2520" strokeWidth="4" transform="rotate(-22 8 76)"/>
      <ellipse cx="92" cy="76" rx="14" ry="22" fill="#E8E3DB" stroke="#2A2520" strokeWidth="4" transform="rotate(22 92 76)"/>
      <path d="M33 60 Q29 78 27 100 L73 100 Q71 78 67 60 Q59 67 50 67 Q41 67 33 60Z" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4" strokeLinejoin="round"/>
      <circle cx="50" cy="35" r="28" fill="#F0EBE3" stroke="#2A2520" strokeWidth="4"/>
      {/* Passport book in right wing */}
      <rect x="72" y="55" width="20" height="26" rx="3" fill="#1A4480" stroke="#2A2520" strokeWidth="2.5"/>
      <rect x="74" y="57" width="16" height="22" rx="2" fill="#2A5FA8"/>
      <circle cx="82" cy="64" r="4" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"/>
      <line x1="76" y1="71" x2="88" y2="71" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5"/>
      <line x1="76" y1="74" x2="88" y2="74" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5"/>
      <circle cx="39" cy="29" r="8" fill="#fff" stroke="#2A2520" strokeWidth="3"/>
      <circle cx="37.5" cy="28" r="4.5" fill="#2A2520"/>
      <circle cx="35.5" cy="26" r="1.8" fill="#fff"/>
      <path d="M30 50 Q44 58 57 50" stroke="#2A2520" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
      <path d="M57 31 Q72 27 76 33 Q72 39 57 37Z" fill="#E8A820" stroke="#2A2520" strokeWidth="3" strokeLinejoin="round"/>
    </svg>
  ),

  // Icon-only version for app icon context
  icon: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <ellipse cx="8" cy="76" rx="14" ry="22" fill="rgba(255,255,255,.28)" stroke="rgba(255,255,255,.7)" strokeWidth="4" transform="rotate(-22 8 76)"/>
      <ellipse cx="92" cy="76" rx="14" ry="22" fill="rgba(255,255,255,.28)" stroke="rgba(255,255,255,.7)" strokeWidth="4" transform="rotate(22 92 76)"/>
      <path d="M33 60 Q29 78 27 100 L73 100 Q71 78 67 60 Q59 67 50 67 Q41 67 33 60Z" fill="rgba(255,255,255,.28)" stroke="rgba(255,255,255,.75)" strokeWidth="4" strokeLinejoin="round"/>
      <circle cx="50" cy="35" r="28" fill="rgba(255,255,255,.28)" stroke="rgba(255,255,255,.85)" strokeWidth="4"/>
      <circle cx="39" cy="29" r="8" fill="#fff" stroke="rgba(255,255,255,.8)" strokeWidth="3"/>
      <circle cx="37.5" cy="28" r="5" fill="#2A2520"/>
      <circle cx="35.5" cy="26" r="2" fill="#fff"/>
      <path d="M34 50 Q44 59 54 50" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none"/>
      <path d="M57 31 Q72 27 76 33 Q72 39 57 37Z" fill="#E8A820" stroke="rgba(255,255,255,.7)" strokeWidth="3" strokeLinejoin="round"/>
    </svg>
  ),
}

// Animation wrappers
const ANIMATED = {
  happy: 'bounce',
  excited: 'bounce',
  celebrating: 'bounce',
  sleeping: null,
  pilot: null,
}

export default function Goose({
  variant = 'happy',
  size = 64,
  animated = false,
  style = {},
  className = ''
}) {
  const Variant = variants[variant] || variants.happy
  const animClass = animated && ANIMATED[variant] ? `goose-${ANIMATED[variant]}` : ''

  return (
    <span
      className={`goose ${animClass} ${className}`}
      style={{ display: 'inline-flex', alignItems: 'center', ...style }}
      role="img"
      aria-label={`${variant} goose`}
    >
      <Variant size={size} />
    </span>
  )
}
