import { useState, useRef, useEffect } from 'react'
import { useTripsStore, useUIStore, useGuideStore } from '../../store'
import { parseLocalDate, hasTripEnded } from '../../lib/dates'
import { track } from '../../lib/analytics'

// Sub-sections each guide section needs (loaded lazily, per section, to avoid Edge Function timeouts)
export const TAB_SECTIONS = {
  know:   ['overview'],
  eat:    ['eat_cheap', 'eat_mid', 'eat_splurge'],
  see:    ['see_temples', 'see_neighbourhoods', 'see_museums', 'see_parks', 'see_daytrips'],
  move:   ['move'],
  events: ['events'],
}

// Destinations with no guide
export { GUIDE_EXCLUDED as EXCLUDED } from '../../store/guideStore'
import { GUIDE_EXCLUDED as EXCLUDED } from '../../store/guideStore'

const toDest = t => ({ city: t.destination_city, country: t.destination_country, country_code: t.destination_country_code })

/**
 * City-guide state for Explore: destination (defaults to the next trip), overview load on
 * destination change, sub-section load when a section is opened, analytics.
 * `open` = a section detail view is showing (its sections are requested).
 */
export function useCityGuide(open) {
  const { trips, fetchTrips, loading: tripsLoading } = useTripsStore()
  const { activeGuideTab, setGuideTab, activeTab } = useUIStore()
  const {
    getGuideData, loadingSections, error: guideError, currentDestination, sections,
    loadGuide, loadGuideSection, loadMoreSection, clearGuide, lastSectionFromCache,
  } = useGuideStore()
  const guideData = getGuideData()
  const [loadingMore, setLoadingMore] = useState(null)

  const upcomingTrips = trips
    .filter(t => !hasTripEnded(t) && t.status !== 'cancelled')
    .sort((a, b) => parseLocalDate(a.start_date) - parseLocalDate(b.start_date))
  const upcomingTrip = upcomingTrips[0]

  const [destination, setDestination] = useState(upcomingTrip ? toDest(upcomingTrip) : null)

  // Explore can be the first tab opened: make sure trips (for the default city) are loaded
  useEffect(() => { if (!trips.length && !tripsLoading) fetchTrips() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!destination && upcomingTrip) setDestination(toDest(upcomingTrip))
  }, [upcomingTrip]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load overview on destination change — also fires when the Explore tab becomes active
  useEffect(() => {
    if (destination && !EXCLUDED.includes(destination.country_code)) loadGuide(destination.city, destination.country, destination.country_code)
  }, [destination?.city, activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load sub-sections when a section is opened (lazy, parallel)
  useEffect(() => {
    if (!open || !destination || !currentDestination) return
    const needed = TAB_SECTIONS[activeGuideTab] || []
    needed.forEach(section => {
      if (!sections[section]) loadGuideSection(destination.city, destination.country, section)
    })
  }, [open, activeGuideTab, destination?.city, currentDestination?.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const neededSections = open ? TAB_SECTIONS[activeGuideTab] || [] : TAB_SECTIONS.know
  // A section is loading if any of its sub-sections are loading; loaded when ALL are present
  const isSectionLoading = neededSections.some(s => !!loadingSections[s])
  const isSectionLoaded = neededSections.length > 0 && neededSections.every(s => !!sections[s])

  // Analytics: one guide_viewed per destination + section once its content is on screen
  const viewedTab = open ? activeGuideTab : 'know'
  const lastViewedRef = useRef(null)
  useEffect(() => {
    if (!destination || !isSectionLoaded) return
    const key = `${destination.city}|${viewedTab}`
    if (lastViewedRef.current === key) return
    lastViewedRef.current = key
    track('guide_viewed', { section: viewedTab, country: destination.country_code || null }, 'guide')
  }, [isSectionLoaded, viewedTab, destination?.city]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (guideError) track('ai_error', { feature: 'guide', section: viewedTab }, 'guide')
  }, [guideError]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectCity = (result) => setDestination({ city: result.city, country: result.country, country_code: result.country_code })
  const selectTrip = (trip) => setDestination(toDest(trip))

  const loadMore = async (section) => {
    if (!destination) return
    setLoadingMore(section)
    await loadMoreSection(destination.city, destination.country, section)
    setLoadingMore(null)
  }

  const retrySection = (section) => destination && loadGuideSection(destination.city, destination.country, section)

  const retry = async () => {
    if (!destination) return
    if (!useGuideStore.getState().sections.overview) {
      clearGuide()
      await loadGuide(destination.city, destination.country, destination.country_code)
    }
    // Re-request any sub-sections this section still needs
    neededSections.forEach(s => {
      if (!useGuideStore.getState().sections[s]) loadGuideSection(destination.city, destination.country, s)
    })
  }

  return {
    destination, selectCity, selectTrip, upcomingTrips, upcomingTrip,
    guideData, sections, loadingSections, guideError, lastSectionFromCache,
    activeGuideTab, setGuideTab, neededSections, isSectionLoading, isSectionLoaded,
    loadMore, loadingMore, retry, retrySection,
    excluded: !!destination && EXCLUDED.includes(destination.country_code),
  }
}
