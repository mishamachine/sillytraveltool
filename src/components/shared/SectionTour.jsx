// "About this section" button + a real walkthrough in a bottom sheet. One per tab header; never opens on its own. The
// button pulses once the first time that section is shown (remembered per section on this device), then stays still,
// and always replays the tour. Steps come from lib/sectionTours.js; the last one ends in a "Try it" button.
import { useEffect, useId, useState } from 'react'
import { track } from '../../lib/analytics'
import {
  SECTION_TOURS, hasSeenSection, markSectionSeen, stepCount, nextStep, prevStep, isLastStep, stepLabel, swipeTarget, keyTarget,
} from '../../lib/sectionTours'
import { useUIStore } from '../../store'
import { Sheet, IconButton, Text, Button, LinkButton } from '../../ui'
import StepArt from './SectionTourArt'
import './sectionTour.css'

function getStorage() {
  try { return window.localStorage } catch { return null }
}

const reduced = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

/** Closes-then-acts: scroll to the feature (and click or focus it), or run a store action. */
function runTryIt(tryIt) {
  if (tryIt.action === 'new-trip') { useUIStore.getState().openTripForm(); return }
  if (!tryIt.target) return
  // Wait a beat: the sheet is still handing focus back to the "i" button as it closes
  setTimeout(() => {
    const el = document.querySelector(`[data-tour="${tryIt.target}"]`)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' })
    if (tryIt.click) el.click()
    else (el.matches('a, button, input, [tabindex]') ? el : el.querySelector('a, button, input, [tabindex]'))?.focus({ preventScroll: true })
  }, 120)
}

export default function SectionTour({ section }) {
  const tour = SECTION_TOURS[section]
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const titleId = useId()
  // Read once on mount: the pulse plays during this visit only
  const [pulse] = useState(() => { const s = getStorage(); return !!s && !hasSeenSection(section, s) })

  useEffect(() => {
    const s = getStorage()
    if (s) markSectionSeen(section, s)
  }, [section])

  // Arrow keys, Home and End step through the tour while it is open (focus may be on any button in the sheet)
  const total = tour ? stepCount(tour) : 0
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select')) return
      const to = keyTarget(index, total, e.key)
      if (to == null) return
      e.preventDefault()
      setIndex(to)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, index, total])

  // "Try it" only when its target is on screen (it may not exist yet, e.g. no upcoming booking); otherwise the button is "Done"
  const lastStep = !!tour && index === total - 1
  const [canTry, setCanTry] = useState(true)
  useEffect(() => {
    if (!open || !lastStep) return
    const t = tour.tryIt
    setCanTry(t.action === 'new-trip' || (!!t.target && !!document.querySelector(`[data-tour="${t.target}"]`)))
  }, [open, lastStep, tour])

  if (!tour) return null
  const n = total
  const step = tour.steps[index]
  const last = isLastStep(index, n)

  const show = () => { setIndex(0); setOpen(true); track('section_overview_open', { s: section }) }
  const close = (how = 'close') => { setOpen(false); track('section_tour_end', { s: section, at: index + 1, how }) }
  const tryIt = () => { close(canTry ? 'try' : 'done'); if (canTry) runTryIt(tour.tryIt) }
  const go = (to) => setIndex(to)

  let startX = null
  const onTouchStart = (e) => { startX = e.touches[0].clientX }
  const onTouchEnd = (e) => {
    if (startX == null) return
    const dx = e.changedTouches[0].clientX - startX
    startX = null
    go(swipeTarget(index, n, dx))
  }

  return (
    <>
      <IconButton icon="info" label="About this section" size="md"
        className={`section-tour__btn${pulse ? ' is-pulse' : ''}`} onClick={show} aria-haspopup="dialog" />
      <Sheet open={open} onClose={() => close('close')} className="section-tour" title={tour.overline} subtitle={stepLabel(index, n)} labelledBy={titleId}
        footer={(
          <div className="section-tour__nav">
            <div className="section-tour__row">
            <div className="section-tour__dots" role="group" aria-label="Tour steps">
              {tour.steps.map((s, i) => (
                <button key={s.id} type="button" className={`section-tour__dot${i === index ? ' is-current' : ''}`}
                  aria-label={`${stepLabel(i, n)}: ${s.title}`} aria-current={i === index ? 'step' : undefined}
                  onClick={() => go(i)} />
              ))}
            </div>
            {!last || canTry ? <LinkButton className="section-tour__skip" onClick={() => close(last ? 'done' : 'skip')}>{last ? 'Done' : 'Skip'}</LinkButton> : <span />}
            </div>
            <div className="section-tour__btns">
              {index > 0 && <Button variant="secondary" size="lg" icon="chevron-left" onClick={() => go(prevStep(index, n))}>Back</Button>}
              {last
                ? <Button variant="primary" size="lg" className="grow" iconRight={canTry ? 'arrow-right' : undefined} onClick={tryIt}>{canTry ? tour.tryIt.label : 'Done'}</Button>
                : <Button variant="primary" size="lg" className="grow" iconRight="arrow-right" onClick={() => go(nextStep(index, n))}>Next</Button>}
            </div>
          </div>
        )}>
        <div className="section-tour__body" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div className="section-tour__art" key={step.id}><StepArt id={step.art} /></div>
          <p className="section-tour__sr" role="status" aria-live="polite" aria-atomic="true">{stepLabel(index, n)}: {step.title}</p>
          <div className="section-tour__copy" key={`c-${step.id}`}>
            <Text variant="h2" id={titleId} as="h2" className="section-tour__title">{step.title}</Text>
            <Text variant="body" tone="secondary" as="p">{step.body}</Text>
          </div>
        </div>
      </Sheet>
    </>
  )
}
