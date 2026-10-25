import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store'
import { usePlanStore, isFirstClass } from '../../store/planStore'
import { STORE, canBuy, buy, restore, storePrices } from '../../lib/purchases'
import { track } from '../../lib/analytics'
import { Sheet, Stack, Text, Button, LinkButton, Banner, Icon, TagMark, cx } from '../../ui'
import './paywall.css'

// The First Class paywall (docs/PAYWALL_PLAN.md section 6), one sheet on web, iOS and Android. Opened through
// usePlanStore().openPaywall(trigger): a free-limit error, a locked feature, or Settings → First Class.
const BENEFITS = [
  { icon: 'map', title: 'Unlimited trips', text: 'Plan every trip on your list, not just the next few.' },
  { icon: 'ticket', title: 'Unlimited reservations', text: 'Every restaurant, ticket and tour on one plan.' },
  { icon: 'inbox', title: 'Unlimited email import', text: 'Forward every confirmation to Goose.' },
  { icon: 'book', title: 'Every past trip, kept', text: 'Your recaps and details, whenever you look back.' },
]

// The lead line for each trigger; numbers come from the owner's free-limit settings
const LEAD = {
  limit_trips: (n) => `You have ${n.upcoming_trips} upcoming trips, the most the free plan holds.`,
  limit_reservations: (n) => `This trip has ${n.reservations_per_trip} reservations, the most the free plan holds.`,
  limit_emails: (n) => `You’ve forwarded ${n.email_imports} emails. New ones are saved, and First Class opens them.`,
  handwritten_import: () => 'Reading handwritten agendas is part of First Class.',
}

// Web only. The apps show the store's own local prices and nothing else (Apple 3.1.1, Play billing policy)
const WEB_PRICES = { yearly: '$14.99', lifetime: '$29.99' }
const native = STORE !== 'stripe'

export default function PaywallSheet() {
  const { paywall, closePaywall, load, plan, settings } = usePlanStore()
  // The owner can end the Founders Flock offer (Controls); the lifetime card then disappears everywhere
  const founders = settings.founders_offer?.active !== false
  const user = useAuthStore(s => s.user)
  const [choice, setChoice] = useState('yearly')
  // Apps: null until the store answers; pricesFailed when it sends nothing (Buy stays off, never a web figure)
  const [prices, setPrices] = useState(native ? null : WEB_PRICES)
  const [pricesFailed, setPricesFailed] = useState(false)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [welcome, setWelcome] = useState(false)
  const trigger = paywall?.trigger

  const loadPrices = () => {
    setPricesFailed(false)
    storePrices(user?.id).then(p => p?.yearly ? setPrices(p) : setPricesFailed(true)).catch(() => setPricesFailed(true))
  }

  useEffect(() => {
    if (!paywall) return
    // An app build without store billing (no RevenueCat key) has no paywall: entry points are hidden, limits say so inline
    if (!canBuy) { closePaywall(); return }
    setError(null); setWelcome(false); setChoice('yearly')
    load()
    track('paywall_view', { trigger, store: STORE })
    if (native && user && !prices) loadPrices()
  }, [paywall])

  if (!paywall || !canBuy) return null

  // After a store purchase the webhook updates the server; wait for it (up to ~30 s)
  const waitForPlan = async () => {
    for (let i = 0; i < 10; i++) {
      if (isFirstClass(await load())) return true
      await new Promise(r => setTimeout(r, 3000))
    }
    return false
  }

  const purchase = async () => {
    setError(null); setBusy('buy')
    try {
      const r = await buy(lifetime ? choice : 'yearly', { trigger, userId: user?.id })
      if (r.left || r.cancelled) return
      if (await waitForPlan()) setWelcome(true)
      else setError('Payment went through. First Class can take a minute to arrive; it will appear on its own.')
    } catch (e) {
      setError(e?.message || 'The purchase didn’t go through. Try again in a moment.')
    } finally { setBusy(null) }
  }

  const doRestore = async () => {
    setError(null); setBusy('restore')
    try {
      await restore(user?.id)
      if (await waitForPlan()) setWelcome(true)
      else setError('No earlier First Class purchase found for this store account.')
    } catch (e) { setError(e?.message || 'Couldn’t reach the store. Try again in a moment.') } finally { setBusy(null) }
  }

  if (welcome || isFirstClass(plan)) {
    return (
      <Sheet title="First Class" onClose={closePaywall}>
        <Stack gap={4} align="center" className="paywall__welcome">
          <TagMark size={64} />
          <Text variant="title" align="center">You have First Class</Text>
          <Text variant="body" tone="secondary" align="center">No limits on trips, reservations or email import, on every device you sign in to.</Text>
          <Button variant="primary" size="lg" block onClick={closePaywall}>Back to my trips</Button>
        </Stack>
      </Sheet>
    )
  }

  // Lifetime shows while the Flock is open, except in an app whose store has no lifetime product
  const lifetime = founders && !(prices && !prices.lifetime)
  const wait = <span className="c-skeleton__block paywall__price-wait" aria-label="Loading price" />
  const footer = (
    <Stack gap={3} grow>
      {error && <Banner tone="danger" icon="alert-circle" role="alert">{error}</Banner>}
      {pricesFailed && (
        <Banner tone="neutral" icon="info" title="Prices are loading" action={<Button size="sm" onClick={loadPrices}>Try again</Button>}>
          The store hasn’t sent them yet.
        </Banner>
      )}
      <Button variant="primary" size="lg" block loading={busy === 'buy'} disabled={!!busy || !prices} onClick={purchase}>
        {!native ? 'Continue to secure payment' : !prices ? 'Subscribe' : choice === 'lifetime' && lifetime ? `Buy for ${prices.lifetime}` : `Subscribe for ${prices.yearly} a year`}
      </Button>
      {native && (
        <LinkButton className="paywall__restore" onClick={doRestore} disabled={!!busy}>{busy === 'restore' ? 'Checking…' : 'Restore purchases'}</LinkButton>
      )}
    </Stack>
  )
  // Renewal terms per store: price, period, auto-renew, how to cancel (App Store Review 3.1.2, Play subscriptions policy)
  const yearly = prices ? `Yearly is ${prices.yearly} a year` : 'Yearly is a one-year subscription'
  const renewal = !native
    ? `${yearly} and renews automatically until you cancel in Settings → Plan, at least a day before it renews; you keep First Class to the end of the year you paid for.`
    : STORE === 'app_store'
      ? `${yearly}, charged to your Apple Account when you confirm. It renews automatically unless cancelled at least 24 hours before the end of the period, and the renewal is charged within the 24 hours before the period ends. Manage or cancel it in your App Store account settings; you keep First Class to the end of the year you paid for.`
      : `${yearly}, charged to your Google Play account when you confirm. It renews automatically each year unless you cancel before the renewal date. Manage or cancel it in Google Play under Payments and subscriptions; you keep First Class to the end of the year you paid for.`

  return (
    <Sheet title="First Class" subtitle="Silly Travel Tool" onClose={closePaywall} footer={footer} size="tall">
      <Stack gap={5} className="paywall">
        <div className="paywall__hero">
          <TagMark size={56} />
          <Text variant="body" tone="secondary">{LEAD[trigger]?.(settings.free_limits) || 'More room for every trip.'}</Text>
        </div>

        <ul className="paywall__benefits">
          {BENEFITS.map(b => (
            <li key={b.icon}>
              <span className="paywall__icon"><Icon name={b.icon} size={24} /></span>
              <span><Text variant="body" weight={600} as="span">{b.title}</Text><Text variant="caption" tone="muted" as="span">{b.text}</Text></span>
            </li>
          ))}
        </ul>

        <div className="paywall__plans" role="radiogroup" aria-label="Choose a plan">
          <PlanCard id="yearly" choice={choice} onPick={setChoice} title="Yearly" price={prices ? `${prices.yearly} / year` : wait} note="Renews each year. Cancel any time." />
          {lifetime && <PlanCard id="lifetime" choice={choice} onPick={setChoice} title="Founders Flock" price={prices ? `${prices.lifetime} once` : wait} note="LIFETIME First Class for one payment: about what two years of Yearly cost, then it’s yours for good. Only while the Flock is open." />}
        </div>

        <Text variant="caption" tone="secondary">We keep STT as affordable as we can so more people travel, well informed and organised. Your subscription keeps the lights on (and the dog fed).</Text>

        <Text variant="micro" tone="muted" as="p">
          {renewal}{lifetime && ' Founders Flock is a one-time payment, not a subscription.'}{' '}
          <a href="https://sillytraveltool.com/terms/" target="_blank" rel="noreferrer">Terms</a> ·{' '}
          <a href="https://sillytraveltool.com/privacy/" target="_blank" rel="noreferrer">Privacy</a>
        </Text>
      </Stack>
    </Sheet>
  )
}

function PlanCard({ id, choice, onPick, title, price, note }) {
  const on = choice === id
  return (
    <button type="button" role="radio" aria-checked={on} className={cx('paywall__plan', on && 'is-on')} onClick={() => onPick(id)}>
      <span className="paywall__radio" aria-hidden="true">{on && <Icon name="check" size={16} strokeWidth={2.5} />}</span>
      <span className="paywall__plan-body">
        <Text variant="body" weight={600} as="span">{title}</Text>
        <Text variant="caption" tone="muted" as="span">{note}</Text>
      </span>
      <Text variant="body" weight={600} as="span" className="paywall__price tabular">{price}</Text>
    </button>
  )
}
