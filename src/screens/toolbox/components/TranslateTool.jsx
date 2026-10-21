import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { reverseGeocodeCountry } from '../../../lib/geo'
import { useTripsStore } from '../../../store'
import Goose from '../../../components/goose/Goose'

const PHRASE_CATEGORIES = [
  { id: 'greetings', label: 'Greetings', emoji: '👋' },
  { id: 'food', label: 'Food & Dining', emoji: '🍜' },
  { id: 'transport', label: 'Transport', emoji: '🚌' },
  { id: 'hotel', label: 'Hotel & Stay', emoji: '🏨' },
  { id: 'shopping', label: 'Shopping', emoji: '🛍️' },
  { id: 'health', label: 'Health & Safety', emoji: '🏥' },
  { id: 'social', label: 'Social', emoji: '💬' },
  { id: 'goose_specials', label: 'Goose Specials', emoji: '🪿' },
]

const COUNTRY_TO_LANGUAGE = {
  JP: { code: 'ja', name: 'Japanese' }, CN: { code: 'zh', name: 'Mandarin Chinese' },
  TW: { code: 'zh', name: 'Mandarin Chinese' }, KR: { code: 'ko', name: 'Korean' },
  TH: { code: 'th', name: 'Thai' }, VN: { code: 'vi', name: 'Vietnamese' },
  ID: { code: 'id', name: 'Indonesian' }, MY: { code: 'ms', name: 'Malay' },
  PH: { code: 'tl', name: 'Filipino' }, IN: { code: 'hi', name: 'Hindi' },
  PK: { code: 'ur', name: 'Urdu' }, BD: { code: 'bn', name: 'Bengali' },
  SA: { code: 'ar', name: 'Arabic' }, AE: { code: 'ar', name: 'Arabic' },
  EG: { code: 'ar', name: 'Arabic' }, MA: { code: 'ar', name: 'Arabic' },
  TR: { code: 'tr', name: 'Turkish' }, IR: { code: 'fa', name: 'Persian' },
  IL: { code: 'he', name: 'Hebrew' }, ET: { code: 'am', name: 'Amharic' },
  NG: { code: 'yo', name: 'Yoruba' }, ZA: { code: 'af', name: 'Afrikaans' },
  RU: { code: 'ru', name: 'Russian' }, UA: { code: 'uk', name: 'Ukrainian' },
  PL: { code: 'pl', name: 'Polish' }, CZ: { code: 'cs', name: 'Czech' },
  HU: { code: 'hu', name: 'Hungarian' }, RO: { code: 'ro', name: 'Romanian' },
  GR: { code: 'el', name: 'Greek' }, RS: { code: 'sr', name: 'Serbian' },
  HR: { code: 'hr', name: 'Croatian' }, BG: { code: 'bg', name: 'Bulgarian' },
  SK: { code: 'sk', name: 'Slovak' }, SI: { code: 'sl', name: 'Slovenian' },
  FR: { code: 'fr', name: 'French' }, DE: { code: 'de', name: 'German' },
  ES: { code: 'es', name: 'Spanish' }, IT: { code: 'it', name: 'Italian' },
  PT: { code: 'pt', name: 'Portuguese' }, BR: { code: 'pt', name: 'Portuguese' },
  NL: { code: 'nl', name: 'Dutch' }, BE: { code: 'fr', name: 'French' },
  CH: { code: 'de', name: 'German' }, AT: { code: 'de', name: 'German' },
  SE: { code: 'sv', name: 'Swedish' }, NO: { code: 'no', name: 'Norwegian' },
  DK: { code: 'da', name: 'Danish' }, FI: { code: 'fi', name: 'Finnish' },
  MX: { code: 'es', name: 'Spanish' }, AR: { code: 'es', name: 'Spanish' },
  CO: { code: 'es', name: 'Spanish' }, CL: { code: 'es', name: 'Spanish' },
  PE: { code: 'es', name: 'Spanish' }, VE: { code: 'es', name: 'Spanish' },
}

const ALL_LANGUAGES = [
  { code: 'ar', name: 'Arabic' }, { code: 'zh', name: 'Chinese (Mandarin)' },
  { code: 'cs', name: 'Czech' }, { code: 'da', name: 'Danish' },
  { code: 'nl', name: 'Dutch' }, { code: 'fi', name: 'Finnish' },
  { code: 'fr', name: 'French' }, { code: 'de', name: 'German' },
  { code: 'el', name: 'Greek' }, { code: 'hi', name: 'Hindi' },
  { code: 'hu', name: 'Hungarian' }, { code: 'id', name: 'Indonesian' },
  { code: 'it', name: 'Italian' }, { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' }, { code: 'ms', name: 'Malay' },
  { code: 'no', name: 'Norwegian' }, { code: 'fa', name: 'Persian' },
  { code: 'pl', name: 'Polish' }, { code: 'pt', name: 'Portuguese' },
  { code: 'ro', name: 'Romanian' }, { code: 'ru', name: 'Russian' },
  { code: 'sr', name: 'Serbian' }, { code: 'es', name: 'Spanish' },
  { code: 'sv', name: 'Swedish' }, { code: 'tl', name: 'Tagalog' },
  { code: 'th', name: 'Thai' }, { code: 'tr', name: 'Turkish' },
  { code: 'uk', name: 'Ukrainian' }, { code: 'vi', name: 'Vietnamese' },
]

export default function TranslateTool() {
  const { activeTrip } = useTripsStore()
  const [activeCategory, setActiveCategory] = useState('greetings')
  const [phrases, setPhrases] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showLangPicker, setShowLangPicker] = useState(false)
  const [expandedPhrase, setExpandedPhrase] = useState(null)
  const [speakingIdx, setSpeakingIdx] = useState(null)

  const tripLang = activeTrip?.destination_country_code
    ? COUNTRY_TO_LANGUAGE[activeTrip.destination_country_code]
    : null

  const [geoLang, setGeoLang] = useState(null)
  const [selectedLang, setSelectedLang] = useState(null)
  const loadedLangRef = useRef(null)

  useEffect(() => {
    if (tripLang || geoLang || selectedLang) return
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          // Timed lookup (BigDataCloud, Nominatim fallback) — see lib/geo.js
          const { countryCode: cc } = await reverseGeocodeCountry(pos.coords.latitude, pos.coords.longitude)
          if (cc && COUNTRY_TO_LANGUAGE[cc]) setGeoLang(COUNTRY_TO_LANGUAGE[cc])
        } catch {}
      },
      () => {},
      { timeout: 3000, maximumAge: 600000 }
    )
  }, [tripLang])

  const autoLang = tripLang || geoLang

  useEffect(() => {
    if (autoLang && !selectedLang) setSelectedLang(autoLang)
  }, [autoLang?.code])

  const currentLang = selectedLang || autoLang

  const loadPhrases = async (lang) => {
    if (!lang) return
    setLoading(true); setError(null); setPhrases(null)
    try {
      const { data: cached } = await supabase
        .from('phrase_cache')
        .select('*')
        .eq('language_code', lang.code)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()

      if (cached) {
        const phraseData = {}
        PHRASE_CATEGORIES.forEach(cat => { phraseData[cat.id] = cached[cat.id] || [] })
        setPhrases(phraseData)
        setLoading(false)
        return
      }

      try {
        const local = localStorage.getItem('phrases_' + lang.code)
        if (local) {
          const parsed = JSON.parse(local)
          if (parsed.expires_at && new Date(parsed.expires_at) > new Date()) {
            setPhrases(parsed.data)
            setLoading(false)
            return
          }
        }
      } catch {}

      const { generatePhrases } = await import('../../../lib/gemini.js')
      // invokeFunction applies a 30s timeout and surfaces the server's { error } message
      const generated = await generatePhrases(lang.code, lang.name)

      const phraseData = {}
      PHRASE_CATEGORIES.forEach(cat => { phraseData[cat.id] = generated[cat.id] || [] })

      // generate-phrases writes the shared phrase_cache server-side
      try {
        const expiresLocal = new Date()
        expiresLocal.setDate(expiresLocal.getDate() + 30)
        localStorage.setItem('phrases_' + lang.code, JSON.stringify({ data: phraseData, expires_at: expiresLocal.toISOString() }))
      } catch {}

      setPhrases(phraseData)
    } catch (e) {
      setError(e?.message || 'Phrase generation failed. Check connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (currentLang && currentLang.code !== loadedLangRef.current) {
      loadedLangRef.current = currentLang.code
      loadPhrases(currentLang)
    }
  }, [currentLang?.code])

  const speak = (phrase, idx) => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    if (speakingIdx === idx) { setSpeakingIdx(null); return }
    const utterance = new SpeechSynthesisUtterance(phrase.native)
    const voices = window.speechSynthesis.getVoices()
    const langCode = currentLang?.code || 'en'
    const match = voices.find(v => v.lang.toLowerCase().startsWith(langCode.toLowerCase()) && !v.name.includes('Google UK')) ||
                  voices.find(v => v.lang.toLowerCase().startsWith(langCode.split('-')[0].toLowerCase()))
    if (match) utterance.voice = match
    utterance.rate = 0.85
    utterance.pitch = 1.0
    utterance.volume = 1.0
    utterance.lang = langCode
    setSpeakingIdx(idx)
    utterance.onend = () => setSpeakingIdx(null)
    utterance.onerror = () => setSpeakingIdx(null)
    window.speechSynthesis.speak(utterance)
  }

  useEffect(() => {
    const load = () => window.speechSynthesis?.getVoices()
    load()
    window.speechSynthesis?.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', load)
  }, [])

  const currentCategoryPhrases = phrases?.[activeCategory] || []

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Language selector — full box is tappable */}
      <button
        onClick={() => setShowLangPicker(true)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        <div style={{ flex: 1, background: 'var(--surface)', border: '1.5px solid var(--primary)', borderRadius: 12, padding: '10px 14px', textAlign: 'left', transition: 'background 0.15s' }}>
          {currentLang ? (
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{currentLang.name}</div>
              {autoLang && currentLang.code === autoLang.code && (
                <div style={{ fontSize: 11, color: 'var(--primary)', marginTop: 2 }}>✈️ Auto-detected from {activeTrip?.destination_city}</div>
              )}
            </div>
          ) : (
            <div style={{ color: 'var(--text-tert)', fontSize: 14 }}>Tap to select a language</div>
          )}
        </div>
        <span style={{ flexShrink: 0, padding: '10px 14px', borderRadius: 12, background: 'var(--primary)', color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13 }}>
          {currentLang ? 'Change' : 'Select'}
        </span>
      </button>

      {!currentLang && (
        <div className="empty-state" style={{ marginTop: 20 }}>
          <Goose variant="lost" size={100} animated />
          <div className="empty-state-title" style={{ fontSize: 20, marginTop: 12 }}>Phrase Book</div>
          <p className="empty-state-text">64 travel phrases across 8 categories. Select a language to get started.</p>
        </div>
      )}

      {currentLang && loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 24, textAlign: 'center' }}>
          <div style={{ animation: 'bounce 1.5s ease-in-out infinite' }}>
            <Goose variant="excited" size={88} />
          </div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 700 }}>Learning {currentLang.name}...</div>
          <p style={{ fontSize: 13, color: 'var(--text-sec)', lineHeight: 1.5 }}>The Goose is preparing 64 essential phrases.</p>
        </div>
      )}

      {currentLang && error && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 24, textAlign: 'center' }}>
          <Goose variant="worried" size={72} />
          <div style={{ fontSize: 14, color: 'var(--error)' }}>{error}</div>
          <button className="btn btn-primary" onClick={() => loadPhrases(currentLang)}>Retry</button>
        </div>
      )}

      {currentLang && phrases && !loading && (
        <>
          <div style={{ position: 'relative' }}>
            <select
              value={activeCategory}
              onChange={e => { setActiveCategory(e.target.value); setExpandedPhrase(null) }}
              style={{ width: '100%', padding: '10px 36px 10px 14px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer', outline: 'none' }}
            >
              {PHRASE_CATEGORIES.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.emoji} {cat.label}</option>
              ))}
            </select>
            <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-tert)', fontSize: 12 }}>▼</div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-tert)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
            {currentCategoryPhrases.length} phrases · tap 🔊 to hear
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {currentCategoryPhrases.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tert)', fontSize: 14 }}>No phrases available for this category.</div>
            )}
            {currentCategoryPhrases.map((phrase, i) => {
              const isExpanded = expandedPhrase === i
              const isSpeaking = speakingIdx === i
              return (
                <div key={i} style={{ background: 'var(--surface)', border: `1.5px solid ${isExpanded ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.15s ease' }}>
                  <button onClick={() => setExpandedPhrase(isExpanded ? null : i)} style={{ width: '100%', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{phrase.english}</div>
                    <div style={{ fontSize: 15, color: 'var(--primary)', marginTop: 4, fontWeight: 600 }}>{phrase.native}</div>
                    {phrase.romanized && <div style={{ fontSize: 12, color: 'var(--text-tert)', marginTop: 2, fontStyle: 'italic' }}>{phrase.romanized}</div>}
                    {isExpanded && phrase.context && (
                      <div style={{ fontSize: 12, color: 'var(--text-sec)', marginTop: 8, background: 'var(--surface-alt)', padding: '6px 10px', borderRadius: 8 }}>💡 {phrase.context}</div>
                    )}
                  </button>
                  {window.speechSynthesis && (
                    <button
                      onClick={() => speak(phrase, i)}
                      style={{ width: '100%', padding: '8px 14px', background: isSpeaking ? 'var(--primary-light)' : 'var(--surface-alt)', border: 'none', borderTop: '1px solid var(--border-light)', cursor: 'pointer', fontSize: 13, color: isSpeaking ? 'var(--primary)' : 'var(--text-tert)', fontFamily: 'var(--font-heading)', fontWeight: 600, transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      {isSpeaking ? '⏸' : '🔊'} {isSpeaking ? 'Stop' : 'Hear pronunciation'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-tert)', fontFamily: 'var(--font-mono)', marginTop: 4, paddingBottom: 16 }}>
            Cached offline · tap phrase for usage tip
          </div>
        </>
      )}

      {showLangPicker && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setShowLangPicker(false)}>
          <div style={{ background: 'var(--bg)', borderRadius: '20px 20px 0 0', padding: '20px 0', width: '100%', maxWidth: 428, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', marginBottom: 12 }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 700, margin: 0 }}>Select Language</h3>
              <button onClick={() => setShowLangPicker(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-tert)' }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {autoLang && (
                <>
                  <div style={{ padding: '6px 16px', fontSize: 11, color: 'var(--text-tert)', fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Suggested for your trip</div>
                  <button
                    onClick={() => { loadedLangRef.current = null; setSelectedLang(autoLang); setShowLangPicker(false) }}
                    style={{ width: '100%', padding: '14px 16px', background: 'var(--primary-light)', border: 'none', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--primary)' }}>✈️ {autoLang.name}</span>
                    {selectedLang?.code === autoLang.code && <span style={{ color: 'var(--primary)' }}>✓</span>}
                  </button>
                  <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
                </>
              )}
              <div style={{ padding: '6px 16px', fontSize: 11, color: 'var(--text-tert)', fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>All Languages</div>
              {ALL_LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => { loadedLangRef.current = null; setSelectedLang(lang); setShowLangPicker(false) }}
                  style={{ width: '100%', padding: '13px 16px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)' }}
                >
                  <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, color: 'var(--text)', fontSize: 15 }}>{lang.name}</span>
                  {selectedLang?.code === lang.code && <span style={{ color: 'var(--primary)' }}>✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
