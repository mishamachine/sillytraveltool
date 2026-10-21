import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { reverseGeocodeCountry } from '../../../lib/geo'
import { useTripsStore } from '../../../store'
import {
  Card, ListRow, Button, IconButton, Chip, Sheet, Text, Stack, Section, Loading, ErrorState, EmptyState, LinkButton, Overline, Icon,
} from '../../../ui'

const PHRASE_CATEGORIES = [
  { id: 'greetings', label: 'Greetings', icon: 'chat' },
  { id: 'food', label: 'Food & dining', icon: 'restaurant' },
  { id: 'transport', label: 'Transport', icon: 'bus' },
  { id: 'hotel', label: 'Hotel & stay', icon: 'stay' },
  { id: 'shopping', label: 'Shopping', icon: 'bag' },
  { id: 'health', label: 'Health & safety', icon: 'medical' },
  { id: 'social', label: 'Social', icon: 'users' },
  { id: 'goose_specials', label: 'Goose specials', icon: 'sparkles' },
]

const REPORT_URL = 'mailto:hello@sillytraveltool.com?subject=' + encodeURIComponent('Report an AI phrase')

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
  const [featuredIdx, setFeaturedIdx] = useState(0)
  const [showBig, setShowBig] = useState(false)
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
    setLoading(true); setError(null); setPhrases(null); setFeaturedIdx(0)
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
  const featured = currentCategoryPhrases[featuredIdx] || currentCategoryPhrases[0]
  const featuredI = currentCategoryPhrases[featuredIdx] ? featuredIdx : 0
  const canSpeak = typeof window !== 'undefined' && !!window.speechSynthesis
  const pickLang = (lang) => { loadedLangRef.current = null; setSelectedLang(lang); setShowLangPicker(false) }

  return (
    <Stack gap={4}>
      <Stack row gap={2}>
        <span className="tools-lang tools-lang--static">English</span>
        <Icon name="arrow-right" size={18} className="tools-lang__arrow" />
        <button type="button" className="tools-lang" onClick={() => setShowLangPicker(true)}
          aria-label={currentLang ? `Phrases in ${currentLang.name}. Change language` : 'Choose a language'}>
          {currentLang ? currentLang.name : 'Choose a language'}
        </button>
      </Stack>
      {currentLang && autoLang && currentLang.code === autoLang.code && activeTrip?.destination_city && (
        <Text variant="micro" tone="muted">Picked for your trip to {activeTrip.destination_city}</Text>
      )}

      {!currentLang && (
        <EmptyState goose="happy" title="Pocket phrase book"
          action={<Button variant="primary" size="lg" block onClick={() => setShowLangPicker(true)}>Choose a language</Button>}>
          64 travel phrases in 8 topics, saved on your phone once loaded.
        </EmptyState>
      )}

      {currentLang && loading && (
        <Loading title={`Goose is learning ${currentLang.name}`}>64 essential phrases, usually under 15 seconds.</Loading>
      )}

      {currentLang && error && !loading && (
        <ErrorState onRetry={() => loadPhrases(currentLang)}>{error}</ErrorState>
      )}

      {currentLang && phrases && !loading && (
        <>
          {featured && (
            <Card variant="inverse" aria-live="polite">
              <Overline tone="inverse-muted">{currentLang.name}</Overline>
              <p className="tools-phrase-big" lang={currentLang.code}>{featured.native}</p>
              {featured.romanized && <Text variant="caption" tone="inverse-muted">{featured.romanized}</Text>}
              <Text variant="body" tone="inverse-muted">{featured.english}</Text>
              <Stack row gap={2} wrap>
                {canSpeak && (
                  <Button variant="primary" icon={speakingIdx === featuredI ? 'pause' : 'volume'} onClick={() => speak(featured, featuredI)}>
                    {speakingIdx === featuredI ? 'Stop' : 'Play'}
                  </Button>
                )}
                <Button variant="outline" className="tools-on-inverse" onClick={() => setShowBig(true)}>Show big</Button>
              </Stack>
            </Card>
          )}

          <div className="c-chip-row" role="tablist" aria-label="Phrase topics">
            {PHRASE_CATEGORIES.map(cat => (
              <Chip key={cat.id} icon={cat.icon} selected={activeCategory === cat.id} role="tab" aria-selected={activeCategory === cat.id} aria-pressed={undefined}
                onClick={() => { setActiveCategory(cat.id); setFeaturedIdx(0) }}>
                {cat.label}
              </Chip>
            ))}
          </div>

          <Section title={`${PHRASE_CATEGORIES.find(c => c.id === activeCategory)?.label} · ${currentCategoryPhrases.length}`}>
            {currentCategoryPhrases.length === 0 ? (
              <Text tone="secondary">No phrases in this topic yet.</Text>
            ) : (
              <Card variant="group">
                {currentCategoryPhrases.map((phrase, i) => (
                  <ListRow key={i} as="div" className={featuredI === i ? 'tools-phrase is-selected' : 'tools-phrase'}
                    trailing={canSpeak ? (
                      <IconButton icon={speakingIdx === i ? 'pause' : 'volume'} variant="sunken"
                        label={speakingIdx === i ? `Stop “${phrase.english}”` : `Hear “${phrase.english}”`}
                        onClick={(e) => { e.stopPropagation(); speak(phrase, i) }} />
                    ) : null}>
                    <button type="button" className="tools-phrase__pick" aria-pressed={featuredI === i} onClick={() => setFeaturedIdx(i)}>
                      <span className="c-row__title" lang={currentLang.code}>{phrase.native}</span>
                      <span className="c-row__meta">{[phrase.english, phrase.context].filter(Boolean).join(' · ')}</span>
                    </button>
                  </ListRow>
                ))}
              </Card>
            )}
          </Section>

          <Text variant="micro" tone="muted" align="center">
            Suggested by Goose (AI). Check anything important with a local. <LinkButton href={REPORT_URL}>Report a phrase</LinkButton>
          </Text>
        </>
      )}

      {showBig && featured && (
        <Sheet title="Show this" onClose={() => setShowBig(false)}>
          <p className="tools-phrase-huge" lang={currentLang?.code}>{featured.native}</p>
          <Text variant="body-lg" tone="secondary">{featured.english}</Text>
        </Sheet>
      )}

      {showLangPicker && (
        <Sheet title="Choose a language" onClose={() => setShowLangPicker(false)} size="tall">
          {autoLang && (
            <Section title="For your trip">
              <Card variant="group">
                <ListRow icon="plane" tone="info" title={autoLang.name} onClick={() => pickLang(autoLang)}
                  trailing={selectedLang?.code === autoLang.code ? <span className="tone-accent t-label">Selected</span> : undefined} />
              </Card>
            </Section>
          )}
          <Section title="All languages">
            <Card variant="group">
              {ALL_LANGUAGES.map(lang => (
                <ListRow key={lang.code} title={lang.name} onClick={() => pickLang(lang)} aria-current={selectedLang?.code === lang.code ? 'true' : undefined}
                  trailing={selectedLang?.code === lang.code ? <span className="tone-accent t-label">Selected</span> : undefined} />
              ))}
            </Card>
          </Section>
        </Sheet>
      )}
    </Stack>
  )
}
