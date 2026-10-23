import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { track } from './analytics'

// A/B tests set up in the cockpit (Experiments). The server picks each signed-in member's version once and keeps it
// (my_experiments); signed-out visitors and people outside a test get the fallback.
//
//   const [variant, exposed] = useVariant('paywall_badge_test_1a2b')   // key shown on the running test in the cockpit
//   useEffect(() => { if (paywallOpen) exposed() }, [paywallOpen])     // call when the version is actually on screen
//   return variant === 'b' ? <NewHeadline /> : <OldHeadline />
//
// exposed() is what the readout counts, so call it only when the person really sees the difference.

let loading = null
let versions = {}
const reported = new Set()

function load() {
  if (!loading) {
    loading = supabase.auth.getSession()
      .then(({ data }) => (data?.session ? supabase.rpc('my_experiments') : { data: {} }))
      .then(({ data }) => { versions = data || {}; return versions }, () => versions)
  }
  return loading
}

// New sign-in, new versions
supabase.auth.onAuthStateChange((event) => { if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') { loading = null; versions = {} } })

export async function getVariant(key, fallback = 'control') {
  const v = await load()
  return v[key] || fallback
}

export function exposeVariant(key) {
  const variant = versions[key]
  if (!variant || reported.has(key)) return
  reported.add(key)
  supabase.rpc('experiment_exposed', { p_key: key }).then(() => {}, () => {})
  track('experiment_exposure', { experiment: key.slice(0, 40), variant: String(variant).slice(0, 20) })
}

export function useVariant(key, fallback = 'control') {
  const [variant, setVariant] = useState(versions[key] || fallback)
  useEffect(() => {
    let live = true
    getVariant(key, fallback).then(v => live && setVariant(v))
    return () => { live = false }
  }, [key, fallback])
  return [variant, () => exposeVariant(key)]
}
