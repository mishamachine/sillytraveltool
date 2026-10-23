import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { supabase } from './supabase'
import { track } from './analytics'

// How a member pays for First Class on this platform (docs/STRIPE_BILLING.md, plan A):
//   web     → sillytraveltool.com/upgrade/ (Stripe Checkout)
//   iOS     → App Store (StoreKit), Android → Google Play Billing, both through RevenueCat
// Store rules: the apps never link to or mention web checkout. Every purchase lands in entitlement() on the server
// (stripe-webhook / store-webhook), so buying on one platform unlocks all of them.
const native = Capacitor.isNativePlatform()
const ios = Capacitor.getPlatform() === 'ios'
const RC_KEY = (ios ? import.meta.env.VITE_REVENUECAT_IOS_KEY : import.meta.env.VITE_REVENUECAT_ANDROID_KEY) || ''

export const STORE = native ? (ios ? 'app_store' : 'play_store') : 'stripe'
/** False in an app build without store billing set up yet (no RevenueCat key). */
export const canBuy = !native || !!RC_KEY
// RevenueCat default package ids for the offering's two packages
const PACKAGE = { yearly: '$rc_annual', lifetime: '$rc_lifetime' }

let configured
async function revenueCat(userId) {
  const { Purchases } = await import('@revenuecat/purchases-capacitor')
  // appUserID = Supabase user id, so the webhook knows whose purchase it is
  configured ||= Purchases.configure({ apiKey: RC_KEY, appUserID: userId })
  await configured
  return Purchases
}

async function storePackages(userId) {
  const Purchases = await revenueCat(userId)
  const { current } = await Purchases.getOfferings()
  return { Purchases, packages: current?.availablePackages || [] }
}

/** Local store prices for the two plans (apps only; the web shows the Stripe prices). */
export async function storePrices(userId) {
  if (!native || !RC_KEY) return null
  const { packages } = await storePackages(userId)
  const price = (id) => packages.find(p => p.identifier === id)?.product?.priceString || null
  return { yearly: price(PACKAGE.yearly), lifetime: price(PACKAGE.lifetime) }
}

/**
 * Starts a purchase. Web: leaves for /upgrade/ (returns { left: true }). Apps: the store's own sheet, then
 * { ok: true } or { cancelled: true }. Throws on a real failure.
 */
export async function buy(plan, { trigger, userId }) {
  track('purchase_started', { plan, store: STORE, trigger })
  if (!native) {
    window.location.assign(`/upgrade/?from=${encodeURIComponent(trigger || 'app')}`)
    return { left: true }
  }
  const { Purchases, packages } = await storePackages(userId)
  const aPackage = packages.find(p => p.identifier === PACKAGE[plan])
  if (!aPackage) throw new Error('This plan isn’t available in the store yet.')
  try {
    await Purchases.purchasePackage({ aPackage })
  } catch (e) {
    if (e?.userCancelled || e?.code === '1' || /cancel/i.test(e?.message || '')) return { cancelled: true }
    throw e
  }
  track('purchase_completed', { plan, store: STORE })
  return { ok: true }
}

/** Apps: asks the store for earlier purchases (new phone, reinstall). The webhook then updates the plan. */
export async function restore(userId) {
  if (!native || !RC_KEY) return
  const Purchases = await revenueCat(userId)
  await Purchases.restorePurchases()
  track('purchase_restored', { store: STORE })
}

/**
 * Where "Manage" goes for this plan, or null when there is nothing to manage here.
 * A web (Stripe) plan is managed in the Stripe portal from the website only; inside the apps it just shows its date.
 */
export function manageTarget(plan) {
  if (plan?.store?.store === 'app_store') return ios || !native ? 'https://apps.apple.com/account/subscriptions' : null
  if (plan?.store?.store === 'play_store') return !ios || !native ? 'https://play.google.com/store/account/subscriptions' : null
  if (!native && plan?.web?.customer) return 'stripe_portal'
  return null
}

export async function openManage(plan) {
  const target = manageTarget(plan)
  if (target === 'stripe_portal') {
    const { data, error } = await supabase.functions.invoke('billing', { body: { action: 'portal' } })
    if (error || !data?.url) throw new Error('Billing is having a moment. Try again shortly.')
    window.location.assign(data.url)
  } else if (target) {
    if (native) {
      await Browser.open({ url: target })
    } else window.open(target, '_blank', 'noopener')
  }
}
