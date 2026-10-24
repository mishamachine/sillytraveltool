// CI-only (branch ci/revenuecat-iphone): drives RevenueCat in an iPhone Simulator demo build where web content
// can't be tapped. VITE_CI_RC=buy → buys yearly through the paywall's own buy(); VITE_CI_RC=cc → opens the Customer
// Center the way Settings → Plan → Manage does. Logs land in the run's js.log (Capacitor console, ⚡️).
import { buy, openManage, storePrices } from '../lib/purchases'
import { DEMO_USER } from './fixtures'

const log = (...a) => console.log('[ci-rc]', ...a.map(x => typeof x === 'string' ? x : JSON.stringify(x)))

export async function runCiRevenueCat(mode) {
  await new Promise(r => setTimeout(r, 12000))
  try {
    log('prices', await storePrices(DEMO_USER.id))
    if (mode === 'buy') {
      log('buy result', await buy('yearly', { trigger: 'ci', userId: DEMO_USER.id }))
    } else if (mode === 'cc') {
      await openManage({ store: { store: 'test_store' } }, DEMO_USER.id)
      log('customer center closed')
    }
    const { Purchases } = await import('@revenuecat/purchases-capacitor')
    const { customerInfo } = await Purchases.getCustomerInfo()
    const e = customerInfo.entitlements.all.silly_travel_tool_pro
    log('entitlement', { user: customerInfo.originalAppUserId, active: Object.keys(customerInfo.entitlements.active),
      store: e?.store, product: e?.productIdentifier, expires: e?.expirationDate })
  } catch (e) { log('error', e?.message || String(e)) }
}
