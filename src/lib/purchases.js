import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { supabase, isDemo } from './supabase'
import { demoParams } from '../dev/demoClient'
import { track } from './analytics'

// How a member pays for First Class on this platform (docs/STRIPE_BILLING.md, plan A):
//   web     → sillytraveltool.com/upgrade/ (Stripe Checkout)
//   iOS     → App Store (StoreKit), Android → Google Play Billing, both through RevenueCat
// Store rules: the apps never link to or mention web checkout. Every purchase lands in entitlement() on the server
// (stripe-webhook / store-webhook), so buying on one platform unlocks all of them.
const native = Capacitor.isNativePlatform()
const ios = Capacitor.getPlatform() === 'ios'
// Demo app builds (cloud emulator checks): ?store=none stands in for a store that sends no prices, ?store=prices
// for one that does. Production builds compile this to null.
const demoStore = isDemo && native ? demoParams().get('store') : null
const RC_KEY = demoStore ? 'demo' : (ios ? import.meta.env.VITE_REVENUECAT_IOS_KEY : import.meta.env.VITE_REVENUECAT_ANDROID_KEY) || ''

export const STORE = native ? (ios ? 'app_store' : 'play_store') : 'stripe'
/** False in an app build without store billing set up yet (no RevenueCat key). */
export const canBuy = !native || !!RC_KEY
// RevenueCat default package ids for the offering's two packages
const PACKAGE = { yearly: '$rc_annual', lifetime: '$rc_lifetime' }

let configured
async function revenueCat(userId) {
  const { Purchases } = await import('@revenuecat/purchases-capacitor')
  // appUserID = Supabase user id, so the webhook knows whose purchase it is
  // A failed configure is forgotten, so "Try again" on the paywall really tries again
  configured ||= Purchases.configure({ apiKey: RC_KEY, appUserID: userId }).catch(e => { configured = null; throw e })
  await configured
  // Wrapped: a Capacitor plugin proxy answers every property, so returning it bare from an async function makes
  // JS treat it as a promise and call Purchases.then(), which throws "not implemented"
  return { Purchases }
}

async function storePackages(userId) {
  const { Purchases } = await revenueCat(userId)
  const { current } = await Purchases.getOfferings()
  return { Purchases, packages: current?.availablePackages || [] }
}

/**
 * Local store prices for the two plans (apps only; the web shows the Stripe prices). A plan the store doesn't offer
 * is null; throws when the store hasn't answered in 15 s. Callers never substitute a web price.
 */
export async function storePrices(userId) {
  if (!native || !RC_KEY) return null
  if (demoStore) { await new Promise(r => setTimeout(r, 1500)); return demoStore === 'prices' ? { yearly: '€13,99', lifetime: '€27,99' } : null }
  const late = new Promise((_, reject) => setTimeout(() => reject(new Error('The store didn’t answer.')), 15000))
  const { packages } = await Promise.race([storePackages(userId), late])
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
  if (demoStore) throw new Error('Demo build: nothing to buy.')
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
  if (!native || !RC_KEY || demoStore) return
  const { Purchases } = await revenueCat(userId)
  await Purchases.restorePurchases()
  track('purchase_restored', { store: STORE })
}

const STORE_PAGE = {
  app_store: 'https://apps.apple.com/account/subscriptions',
  play_store: 'https://play.google.com/store/account/subscriptions',
}

/**
 * Where "Manage" goes for this plan, or null when there is nothing to manage here.
 * A store plan bought on this platform opens RevenueCat's Customer Center (cancel, refund request, restore).
 * A web (Stripe) plan is managed in the Stripe portal from the website only; inside the apps it just shows its date.
 */
export function manageTarget(plan) {
  const store = plan?.store?.store
  // test_store = RevenueCat's Test Store (test_ key builds), which works on either platform
  if (native && RC_KEY && (store === STORE || store === 'test_store')) return 'customer_center'
  if (store === 'app_store') return ios || !native ? STORE_PAGE.app_store : null
  if (store === 'play_store') return !ios || !native ? STORE_PAGE.play_store : null
  if (!native && plan?.web?.customer) return 'stripe_portal'
  return null
}

export async function openManage(plan, userId) {
  const target = manageTarget(plan)
  if (target === 'customer_center') {
    try {
      await revenueCat(userId)
      const { RevenueCatUI } = await import('@revenuecat/purchases-capacitor-ui')
      await RevenueCatUI.presentCustomerCenter()
      track('customer_center_view', { store: STORE })
    } catch {
      // Customer Center not available (not set up in RevenueCat, old OS): the store's own page still works
      await Browser.open({ url: STORE_PAGE[STORE] })
    }
  } else if (target === 'stripe_portal') {
    const { data, error } = await supabase.functions.invoke('billing', { body: { action: 'portal' } })
    if (error || !data?.url) throw new Error('Billing is having a moment. Try again shortly.')
    window.location.assign(data.url)
  } else if (target) {
    if (native) {
      await Browser.open({ url: target })
    } else window.open(target, '_blank', 'noopener')
  }
}
