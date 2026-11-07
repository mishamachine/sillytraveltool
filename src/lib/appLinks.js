// Where to get the apps. Plain module (no imports) so the /beta page, the web app and the tests all share it.
// The web only: the native app never shows these (callers check isNative).
//
// Android is a closed beta until Play is public, so it is two steps: join the Google Group, then install from the Play
// testing page. The install link comes from app_settings.beta.android_url (shown when show_android is on); the group
// link falls back to the constant below unless app_settings.beta.android_group_url is set.
// iPhone: the App Store link shows only when app_settings.beta.show_ios_store is true, or IOS_STORE_LIVE is flipped
// here after Apple approves the app.

export const ANDROID_GROUP_URL = 'https://groups.google.com/g/sillytraveltool-beta'
export const ANDROID_INSTALL_URL = 'https://play.google.com/apps/testing/com.sillytraveltool.app'
export const APP_STORE_URL = 'https://apps.apple.com/app/id6826753531'
export const IOS_STORE_LIVE = false
export const IOS_WAITLIST_URL = '/beta/' // shown instead of the App Store link until the app is approved

export const https = (v) => (typeof v === 'string' && /^https:\/\/[^\s"<>]+$/.test(v) ? v : null)

/** cfg is the beta_page_config() answer (or null). Returns { ios: url|null, iosSoon: waitlist url|null, android: { group, install }|null }.
 *  Exactly one of ios / iosSoon is set: no App Store link anywhere until the switch is on. */
export function resolveStoreLinks(cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : {}
  const install = https(c.android_url)
  const iosOn = typeof c.show_ios_store === 'boolean' ? c.show_ios_store : IOS_STORE_LIVE
  return {
    ios: iosOn ? APP_STORE_URL : null,
    iosSoon: iosOn ? null : IOS_WAITLIST_URL,
    android: install ? { group: https(c.android_group_url) || ANDROID_GROUP_URL, install } : null,
  }
}
