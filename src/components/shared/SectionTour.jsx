// "About this section" button + bottom sheet. One per tab header; never opens on its own. The button pulses once the
// first time that section is shown (remembered per section on this device), then stays still.
import { useEffect, useState } from 'react'
import { track } from '../../lib/analytics'
import { SECTION_TOURS, hasSeenSection, markSectionSeen } from '../../lib/sectionTours'
import { useUIStore } from '../../store'
import { Sheet, IconButton, IconTile, Text, Overline, Button, LinkButton, Stack } from '../../ui'
import './sectionTour.css'

function getStorage() {
  try { return window.localStorage } catch { return null }
}

export default function SectionTour({ section }) {
  const tour = SECTION_TOURS[section]
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  // Read once on mount: the pulse plays during this visit only
  const [pulse] = useState(() => { const s = getStorage(); return !!s && !hasSeenSection(section, s) })

  useEffect(() => {
    const s = getStorage()
    if (s) markSectionSeen(section, s)
  }, [section])

  if (!tour) return null
  const cards = tour.cards
  const card = cards[index]

  const show = () => { setIndex(0); setOpen(true); track('section_overview_open', { s: section }) }
  const close = () => setOpen(false)
  const fullTour = () => { setOpen(false); useUIStore.getState().openTour() }
  const onKeyDots = (e) => {
    if (e.key === 'ArrowRight') setIndex(i => Math.min(i + 1, cards.length - 1))
    if (e.key === 'ArrowLeft') setIndex(i => Math.max(i - 1, 0))
  }
  let startX = null
  const onTouchStart = (e) => { startX = e.touches[0].clientX }
  const onTouchEnd = (e) => {
    if (startX == null) return
    const dx = e.changedTouches[0].clientX - startX
    startX = null
    if (Math.abs(dx) < 50) return
    setIndex(i => (dx < 0 ? Math.min(i + 1, cards.length - 1) : Math.max(i - 1, 0)))
  }

  return (
    <>
      <IconButton icon="info" label="About this section" size="md"
        className={`section-tour__btn${pulse ? ' is-pulse' : ''}`} onClick={show} aria-haspopup="dialog" />
      <Sheet open={open} onClose={close} className="section-tour" labelledBy="section-tour-title"
        footer={(
          <Stack gap={2} grow>
            <Button variant="primary" size="lg" block onClick={close}>Got it</Button>
            <LinkButton className="section-tour__full" onClick={fullTour}>Take the full tour</LinkButton>
          </Stack>
        )}>
        <div className="section-tour__card" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <Overline tone="accent">{tour.overline}</Overline>
          <IconTile icon={card.icon} tone="accent" />
          <Text variant="h2" id="section-tour-title" as="h2" className="section-tour__title">{card.title}</Text>
          <Text variant="body-lg" tone="secondary" as="p">{card.body}</Text>
        </div>
        {cards.length > 1 && (
          <div className="section-tour__dots" role="group" aria-label="Cards" onKeyDown={onKeyDots}>
            {cards.map((c, i) => (
              <button key={c.title} type="button" className={`section-tour__dot${i === index ? ' is-current' : ''}`}
                aria-label={`Card ${i + 1} of ${cards.length}`} aria-current={i === index ? 'step' : undefined}
                onClick={() => setIndex(i)} />
            ))}
          </div>
        )}
      </Sheet>
    </>
  )
}
