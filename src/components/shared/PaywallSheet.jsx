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

const WEB_PRICES = { yearly: '$14.99', lifetime: '$29.99' }
const STORE_NAME = { app_store: 'the App Store', play_store: 'Google Play' }

export default function PaywallSheet() {
  const { paywall, closePaywall, load, plan, settings } = usePlanStore()
  // The owner can end the founders offer (Controls); the lifetime card then disappears everywhere
  const founders = settings.founders_offer?.active !== false
  const user = useAuthStore(s => s.user)
  const [choice, setChoice] = useState('yearly')
  // Same prices everywhere; the stores' local prices replace these once they load
  const [prices, setPrices] = useState(WEB_PRICES)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [welcome, setWelcome] = useState(false)
  const trigger = paywall?.trigger

  useEffect(() => {
    if (!paywall) return
    setError(null); setWelcome(false); setChoice('yearly')
    load()
    track('paywall_view', { trigger, store: STORE })
    if (STORE !== 'stripe' && canBuy && user) storePrices(user.id).then(p => p?.yearly && setPrices(p)).catch(() => {})
  }, [paywall])

  if (!paywall) return null

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
      const r = await buy(founders ? choice : 'yearly', { trigger, userId: user?.id })
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

  const price = (p) => prices?.[p] || '…'
  const footer = (
    <Stack gap={3} grow>
      {error && <Banner tone="danger" icon="alert-circle" role="alert">{error}</Banner>}
      {canBuy ? (
        <Button variant="primary" size="lg" block loading={busy === 'buy'} disabled={!!busy || !prices} onClick={purchase}>
          {STORE === 'stripe' ? 'Continue to secure payment' : choice === 'yearly' ? `Subscribe for ${price('yearly')} a year` : `Buy for ${price('lifetime')}`}
        </Button>
      ) : (
        <Banner tone="accent" icon="info">First Class in the app is coming soon.</Banner>
      )}
      {STORE !== 'stripe' && canBuy && (
        <LinkButton className="paywall__restore" onClick={doRestore} disabled={!!busy}>{busy === 'restore' ? 'Checking…' : 'Restore purchases'}</LinkButton>
      )}
    </Stack>
  )

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
          <PlanCard id="yearly" choice={choice} onPick={setChoice} title="Yearly" price={`${price('yearly')} / year`} note="Renews each year. Cancel any time." />
          {founders && <PlanCard id="lifetime" choice={choice} onPick={setChoice} title="Founders offer" price={`${price('lifetime')} once`} note="Pay once, First Class for life. For a limited time." />}
        </div>

        <Text variant="caption" tone="secondary">We keep STT as affordable as we can so more people travel, well informed and organised. Your subscription keeps the lights on (and the dog fed).</Text>

        <Text variant="micro" tone="muted" as="p">
          Yearly is {price('yearly')} a year and renews automatically until you cancel
          {STORE === 'stripe' ? ' in Settings → Plan' : ` in your ${STORE_NAME[STORE]} subscriptions`}, at least a day before it renews;
          you keep First Class to the end of the year you paid for.{founders && ' The founders offer is a one-time payment.'}{' '}
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
