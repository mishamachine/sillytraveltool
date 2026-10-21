import { createClient } from '@supabase/supabase-js'
import { isNative } from './authRedirect'
import { createDemoClient } from '../dev/demoClient'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

// Demo mode (offline fixtures for screenshots and design review): `?demo` in dev builds,
// or any build made with VITE_DEMO=1. Production builds compile this to false.
export const isDemo = (import.meta.env.DEV || import.meta.env.VITE_DEMO === '1') &&
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo')

export const supabase = isDemo ? createDemoClient() : createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    // Native: PKCE — auth links come back to the app as ?code=… via the custom
    // scheme and are exchanged in src/native/deepLinks.js. Web keeps implicit.
    flowType: isNative ? 'pkce' : 'implicit',
    detectSessionInUrl: !isNative
  },
  realtime: {
    params: { eventsPerSecond: 10 }
  }
})

export default supabase
