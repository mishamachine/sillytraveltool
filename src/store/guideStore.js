import { create } from 'zustand'
import { supabase } from '../lib/supabase'

/**
 * guideStore — section-based lazy loading for city guides
 *
 * Key design decisions:
 * 1. loadingSections is a plain object { sectionName: true } — Zustand handles
 *    plain object spreads correctly. Sets and Maps do NOT trigger re-renders.
 *
 * 2. _inflight is a module-level plain object keyed by "destinationKey:section"
 *    — scoped to destination so switching cities never blocks new requests.
 *
 * 3. Every _finish closure captures the destinationKey at call time and checks
 *    it against current state before writing — stale responses from a previous
 *    city are silently dropped.
 *
 * 4. Clearing _inflight on loadGuide() uses the full scoped key pattern so
 *    only keys for that destination are removed, not keys mid-flight for a
 *    concurrent destination.
 */

// Module-level — never stale in closures, not part of reactive state
// Keys are "destinationKey:section" e.g. "tokyo-japan:overview"
const _inflight = {}

export const useGuideStore = create((set, get) => ({
  currentDestination: null,
  sections: {},
  loadingSections: {}, // { overview: true, eat_cheap: true, ... }
  error: null,
  lastSectionFromCache: false,

  getGuideData: () => {
    const s = get().sections
    if (!s.overview) return null
    return {
      history_text: s.overview?.history,
      wikipedia_url: s.overview?.wikipedia_url,
      britannica_url: s.overview?.britannica_url,
      city_stats: s.overview?.city_stats,
      eat_cheap: s.eat_cheap?.items || [],
      eat_mid: s.eat_mid?.items || [],
      eat_splurge: s.eat_splurge?.items || [],
      see_temples: s.see_temples?.items || [],
      see_neighbourhoods: s.see_neighbourhoods?.items || [],
      see_museums: s.see_museums?.items || [],
      see_parks: s.see_parks?.items || [],
      see_daytrips: s.see_daytrips?.items || [],
      move_content: s.move?.move || {},
      events: s.events?.events || [],
    }
  },

  loadGuide: async (city, country, countryCode) => {
    if (!city) return
    const key = `${city.toLowerCase().replace(/ /g, '-')}-${(countryCode || country).toLowerCase().replace(/ /g, '-')}`

    // Already loaded — no-op
    if (get().currentDestination?.key === key && get().sections.overview) return

    // Clear inflight entries for the OLD destination only
    const oldKey = get().currentDestination?.key
    if (oldKey) {
      Object.keys(_inflight).forEach(k => {
        if (k.startsWith(oldKey + ':')) delete _inflight[k]
      })
    }

    set({
      sections: {},
      error: null,
      currentDestination: { city, country, key },
      loadingSections: {},
    })

    await get().loadGuideSection(city, country, 'overview')
  },

  loadGuideSection: async (city, country, section) => {
    // Always re-read state fresh — avoid stale closure snapshots
    if (!get().currentDestination) return

    const { key } = get().currentDestination

    // Guard: if currentDestination doesn't match the requested city yet
    // (can happen when loadGuide's set() and tab useEffect fire simultaneously),
    // do a single short retry to let the state commit
    if (!key.startsWith(city.toLowerCase().replace(/ /g, '-'))) {
      await new Promise(r => setTimeout(r, 80))
      if (!get().currentDestination) return
      if (!get().currentDestination.key.startsWith(city.toLowerCase().replace(/ /g, '-'))) return
    }

    const currentKey = get().currentDestination.key
    if (get().sections[section]) return

    const inflightKey = `${currentKey}:${section}`
    if (_inflight[inflightKey]) return

    _inflight[inflightKey] = true
    set(s => ({ loadingSections: { ...s.loadingSections, [section]: true }, error: null }))

    // Capture destination key at call time — used to detect stale responses
    const destinationKeyAtCallTime = currentKey

    const _finish = (sectionData, err = null) => {
      delete _inflight[inflightKey]

      set(s => {
        // Destination changed while this request was in flight — discard
        if (s.currentDestination?.key !== destinationKeyAtCallTime) return {}

        const { [section]: _removed, ...restLoading } = s.loadingSections
        return {
          loadingSections: restLoading,
          ...(sectionData ? { sections: { ...s.sections, [section]: sectionData } } : {}),
          ...(err ? { error: err } : {}),
        }
      })
    }

    // 1. Check DB cache
    try {
      const { data: cached, error: cacheErr } = await supabase
        .from('guide_cache_sections')
        .select('data, expires_at')
        .eq('destination_key', key)
        .eq('section', section)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()

      if (!cacheErr && cached?.data) {
        set({ lastSectionFromCache: true })
        _finish(cached.data)
        return
      }
    } catch {
      // Cache miss — fall through to generate
    }

    // 2. Generate via Edge Function
    set({ lastSectionFromCache: false })
    try {
      const { generateGuideContent } = await import('../lib/gemini.js')
      // The Edge Function writes the shared cache (clients can only read it)
      const content = await generateGuideContent(city, country, section, [], currentKey)

      _finish(content)
    } catch (e) {
      console.error(`[guideStore] Section error — ${section}:`, e.message)
      _finish(null, e.message)
    }
  },

  clearGuide: () => {
    const key = get().currentDestination?.key
    if (key) {
      Object.keys(_inflight).forEach(k => {
        if (k.startsWith(key + ':')) delete _inflight[k]
      })
    }
    set({ currentDestination: null, sections: {}, loadingSections: {}, error: null })
  },

  loadMoreSection: async (city, country, section) => {
    const { sections, currentDestination } = get()
    if (!currentDestination) return

    const { key } = currentDestination
    const existing = sections[section]?.items || []
    const excludeNames = existing.map(i => i.name).filter(Boolean)
    const moreKey = `${section}_more`
    const destinationKeyAtCallTime = key

    set(s => ({ loadingSections: { ...s.loadingSections, [moreKey]: true }, error: null }))

    try {
      const { generateGuideContent } = await import('../lib/gemini.js')
      // The Edge Function appends these items to the cached section server-side
      const content = await generateGuideContent(city, country, section, excludeNames, key)
      const merged = [...existing, ...(content?.items || [])]
      const updatedSection = { ...sections[section], items: merged }

      set(s => {
        if (s.currentDestination?.key !== destinationKeyAtCallTime) return {}
        const { [moreKey]: _removed, ...restLoading } = s.loadingSections
        return { sections: { ...s.sections, [section]: updatedSection }, loadingSections: restLoading }
      })
    } catch (e) {
      console.error(`[guideStore] Load more error — ${section}:`, e.message)
      set(s => {
        const { [moreKey]: _removed, ...restLoading } = s.loadingSections
        return { error: e.message, loadingSections: restLoading }
      })
    }
  },
}))
