import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { isNative } from './authRedirect'
import { resolveStoreLinks } from './appLinks'

// Public store links for the web (landing page, Settings, install sheet). Reads the same anon-safe
// beta_page_config() answer as /beta, once per page load. The native app never asks. Failure = no links.
let cached = null
const load = () => {
  if (!cached) {
    cached = Promise.resolve()
      .then(() => supabase.rpc('beta_page_config'))
      .then(({ data }) => resolveStoreLinks(data))
      .catch(() => resolveStoreLinks(null))
  }
  return cached
}

export function useStoreLinks() {
  const [links, setLinks] = useState(null)
  useEffect(() => {
    if (isNative) return undefined
    let alive = true
    load().then((l) => { if (alive) setLinks(l) })
    return () => { alive = false }
  }, [])
  return links
}
