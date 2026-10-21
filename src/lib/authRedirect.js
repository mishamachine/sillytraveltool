import { Capacitor } from '@capacitor/core'

// Where Supabase auth emails / OAuth send the user back to.
// Web: the site itself. Native: the app's custom scheme, which Android
// routes back into the app (see the intent-filter in AndroidManifest.xml).
// The Supabase project must allow `com.sillytraveltool.app://**` as a redirect URL.

export const isNative = Capacitor.isNativePlatform()
export const APP_SCHEME = 'com.sillytraveltool.app'

export function authRedirect(params) {
  const base = isNative ? `${APP_SCHEME}://auth-callback` : window.location.origin
  return params ? `${base}?${new URLSearchParams(params)}` : base
}
