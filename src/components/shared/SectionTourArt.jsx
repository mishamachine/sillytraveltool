// The art for one section-tour step: either an onboarding scene reused as it is, or a scene from sectionTourScenes.js
// played in a phone frame with the same finger, caption and "Now showing / Replay" pill as the onboarding tour.
import { useMemo } from 'react'
import { Icon, cx } from '../../ui'
import { SCENES, resolveStages } from '../../lib/sectionTourScenes'
import {
  TripsArt, WeatherPackArt, InboxArt, InviteArt, TodayArt, TogetherArt, GuideArt, GuideMoreArt, HonkArt, ArtStage,
  Phone, TourScreen, ScreenTitle, Tabs, TourSheet, TourToast, MockRow, Caption, captionAt, useScript, delay,
} from '../../screens/auth/TourArt'
import '../../screens/auth/tour.css'

const REUSED = { TripsArt, WeatherPackArt, InboxArt, InviteArt, TodayArt, TogetherArt, GuideArt, GuideMoreArt, HonkArt }

function Rows({ items }) {
  return (
    <div className="c-card c-card--group tour-card-flat">
      {items.map((r, k) => {
        const end = r.end && <span className="t-caption tone-accent w-600">{r.end}</span>
        return r.icon
          ? <MockRow key={r.title} tap={r.tap} icon={r.icon} tone={r.tone} title={r.title} meta={r.meta} trailing={end} delay={k * 120} />
          : (
            <div key={r.title} className={cx('c-row tour-in', delay(k * 120))} data-tap={r.tap}>
              <span className="c-row__body"><span className="c-row__title">{r.title}</span></span>{end}
            </div>
          )
      })}
    </div>
  )
}

function Block({ b }) {
  switch (b.t) {
    case 'hero':
      return (
        <div data-tap={b.tap} className="c-card c-card--inverse tour-mini-hero">
          {b.over && <span className="t-overline tone-accent-on-inverse">{b.over}</span>}
          <span className={cx('tour-mini-hero__title', !b.big && b.title.length > 14 && 'tour-mini-hero__title--sm')}>{b.title}</span>
          {b.meta && <span className="t-micro tone-muted">{b.meta}</span>}
          {(b.btn || b.actions) && (
            <span className="tour-mini-hero__actions">
              {b.btn && <span data-tap={b.btn.tap} className="tour-pill tour-pill--light">{b.btn.icon && <Icon name={b.btn.icon} size={14} />}{b.btn.label}</span>}
              {(b.actions || []).map(a => <span key={a.label} data-tap={a.tap} className={cx('tour-pill', a.ghost ? 'tour-pill--ghost' : 'tour-pill--light')}>{a.label}</span>)}
            </span>
          )}
        </div>
      )
    case 'rows': return <Rows items={b.items} />
    case 'chips': {
      const on = [].concat(b.on ?? [])
      return (
        <div className="tour-chips">
          {b.items.map((c, k) => <span key={c} data-tap={k === on[0] ? b.tap : undefined} className={cx('c-chip c-chip--neutral', on.includes(k) && 'tour-chip--on')}>{c}</span>)}
        </div>
      )
    }
    case 'tabs': return <Tabs items={b.items} active={b.active} prefix={b.prefix} />
    case 'tiles':
      return (
        <div className="tour-tiles">
          {b.items.map(t => (
            <span key={`${t.big}-${t.meta}`} data-tap={t.tap} className="tour-tile">
              {t.icon && <Icon name={t.icon} size={20} className={`tone-${t.tone || 'accent'}`} />}
              <b>{t.big}</b><span className="t-micro tone-muted">{t.meta}</span>
            </span>
          ))}
        </div>
      )
    case 'facts':
      return <div className="tour-facts">{b.items.map(([k, v]) => <span key={k} className="tour-fact"><span className="t-micro tone-muted">{k}</span><b>{v}</b></span>)}</div>
    case 'note': return <span className="tour-goose-note"><Icon name={b.icon} size={18} className="tone-accent" /><span className="t-caption">{b.text}</span></span>
    case 'field': return <span className="tour-field"><Icon name={b.icon} size={16} className="tone-muted" />{b.text}</span>
    case 'btn': return <span data-tap={b.tap} className="tour-btn">{b.icon && <Icon name={b.icon} size={16} />}{b.label}</span>
    case 'big':
      return (
        <div className="tour-convert">
          <span className="t-micro tone-muted">{b.over}</span>
          <span className="tour-convert__big tabular">{b.value}</span>
          {b.sub && <span className="t-micro tone-muted">{b.sub}</span>}
        </div>
      )
    case 'stepper':
      return (
        <div className="tour-stepper"><span className="t-label">{b.label}</span>
          <span className="tour-stepper__ctl"><span><Icon name="minus" size={14} /></span>{b.value}<span data-tap={b.tap}><Icon name="plus" size={14} /></span></span>
        </div>
      )
    case 'label': return <span className="t-overline tone-muted tour-day">{b.text}</span>
    case 'badges':
      return (
        <span data-tap={b.tap} className="tour-score__badges">
          {b.items.map(([ic, tone]) => <span key={ic} className={cx('tour-score__badge', `c-tile--${tone}`)}><Icon name={ic} size={16} /></span>)}
        </span>
      )
    default: return null
  }
}

function SceneArt({ scene }) {
  const stages = useMemo(() => resolveStages(scene), [scene])
  const [s, st] = useScript(stages)
  const screen = scene.screens[st.screen]
  const sheet = st.sheet ? scene.sheets[st.sheet] : null
  const action = screen.action && (
    <span data-tap={screen.action.tap} className="tour-pill"><Icon name={screen.action.icon} size={14} strokeWidth={2.4} />{screen.action.label}</span>
  )
  return (
    <div className="tour-stage" aria-hidden="true">
      <Phone tap={st.tap} stage={s}>
        <TourScreen id={st.screen}>
          <ScreenTitle overline={screen.over} title={screen.title} back={screen.back} action={action} />
          {screen.blocks.map((b, i) => <Block key={i} b={b} />)}
        </TourScreen>
        {sheet && (
          <TourSheet key={st.sheet}>
            <span className="tour-sheet__title">{sheet.title}</span>
            {sheet.blocks.map((b, i) => <Block key={i} b={b} />)}
          </TourSheet>
        )}
        {st.toast && <TourToast>{st.toast}</TourToast>}
      </Phone>
      <Caption cap={captionAt(stages, s)} />
    </div>
  )
}

/** The art for one tour step. `id` is a reused onboarding scene or a key of SCENES. */
export default function StepArt({ id }) {
  const Reused = REUSED[id]
  const art = useMemo(() => (Reused || function Scene() { return <SceneArt scene={SCENES[id]} /> }), [id, Reused])
  return <ArtStage Art={art} />
}
