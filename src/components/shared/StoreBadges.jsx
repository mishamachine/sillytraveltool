import { Icon } from '../../ui'
import './storeBadges.css'

/**
 * App links for the web (never rendered in the native app: useStoreLinks returns null there).
 * iPhone: a text badge to the App Store. Android: the two-step beta (join the group, then install).
 * No official store artwork is bundled, so these are plain Clay badges.
 */
export default function StoreBadges({ links, only, onOpen, className }) {
  if (!links) return null
  const showIos = !only || only === 'ios'
  const ios = showIos && links.ios
  const soon = showIos && !links.ios && links.iosSoon
  const android = links.android && (!only || only === 'android')
  if (!ios && !soon && !android) return null
  const open = (store) => () => onOpen?.(store)
  return (
    <div className={`store-badges ${className || ''}`}>
      {soon && (
        <a className="store-badge store-badge--soon" href={links.iosSoon} onClick={open('iphone_waitlist')}>
          <Icon name="smartphone" size={22} />
          <span className="store-badge__text"><small>iPhone: coming soon</small><strong>Join the list</strong></span>
        </a>
      )}
      {ios && (
        // TODO: swap for Apple's official "Download on the App Store" badge art once its marketing-guidelines licence is confirmed
        <a className="store-badge" href={links.ios} target="_blank" rel="noreferrer" onClick={open('app_store')}>
          <Icon name="smartphone" size={22} />
          <span className="store-badge__text"><small>Download on the</small><strong>App Store</strong></span>
        </a>
      )}
      {android && (
        <div className="store-steps" role="group" aria-label="Android beta, two steps">
          <p className="store-steps__title">Android beta, two steps</p>
          <a className="store-badge" href={links.android.group} target="_blank" rel="noreferrer" onClick={open('android_group')}>
            <span className="store-badge__num" aria-hidden="true">1</span>
            <span className="store-badge__text"><small>Use the Google account on your phone</small><strong>Join the Android testers group</strong></span>
          </a>
          <a className="store-badge" href={links.android.install} target="_blank" rel="noreferrer" onClick={open('android_install')}>
            <span className="store-badge__num" aria-hidden="true">2</span>
            <span className="store-badge__text"><small>Then open on your phone</small><strong>Install from Google Play</strong></span>
          </a>
        </div>
      )}
    </div>
  )
}
