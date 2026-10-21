import { create } from 'zustand'
import { getSavedTheme, saveTheme, resolveDark } from '../lib/theme'

// Read persisted tab from sessionStorage
function getSavedTab() {
  try { return sessionStorage.getItem('stt_active_tab') || 'trips' } catch { return 'trips' }
}

const initialTheme = getSavedTheme()

export const useUIStore = create((set) => ({
  activeTab: getSavedTab(),
  activeTripTab: 'itinerary',
  activeGuideTab: 'know',
  activeToolboxTab: 'currency',
  activeProfileTab: 'docs',
  showTripForm: false, showBookingForm: false, showActivityForm: false,
  editingItem: null, sheetContent: null,
  // themePref: 'system' | 'light' | 'dark'; darkMode is the resolved value
  themePref: initialTheme,
  darkMode: resolveDark(initialTheme),

  setTab: (tab) => {
    try { sessionStorage.setItem('stt_active_tab', tab) } catch {}
    set({ activeTab: tab })
  },
  setTripTab: (tab) => set({ activeTripTab: tab }),
  setGuideTab: (tab) => set({ activeGuideTab: tab }),
  setToolboxTab: (tab) => set({ activeToolboxTab: tab }),
  setProfileTab: (tab) => set({ activeProfileTab: tab }),

  openTripForm: (item = null) => set({ showTripForm: true, editingItem: item }),
  closeTripForm: () => set({ showTripForm: false, editingItem: null }),
  openBookingForm: (item = null) => set({ showBookingForm: true, editingItem: item }),
  closeBookingForm: () => set({ showBookingForm: false, editingItem: null }),
  openActivityForm: (item = null) => set({ showActivityForm: true, editingItem: item }),
  closeActivityForm: () => set({ showActivityForm: false, editingItem: null }),
  openSheet: (content) => set({ sheetContent: content }),
  closeSheet: () => set({ sheetContent: null }),

  setThemePref: (pref) => {
    saveTheme(pref)
    set({ themePref: pref, darkMode: resolveDark(pref) })
  },
  toggleDarkMode: () => set(s => {
    const pref = s.darkMode ? 'light' : 'dark'
    saveTheme(pref)
    return { themePref: pref, darkMode: !s.darkMode }
  }),
  setDarkMode: (val) => set({ darkMode: val }),
}))
