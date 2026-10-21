import { createClient } from '@supabase/supabase-js'
import { isNative } from './authRedirect'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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
