import cx from './cx'
import Icon from './icons/Icon'

// Booking type → icon + tone, used by every booking row and the add-booking sheet.
export const CATEGORY = {
  flight: { icon: 'plane', tone: 'info', label: 'Flight' },
  hotel: { icon: 'stay', tone: 'stay', label: 'Stay' },
  stay: { icon: 'stay', tone: 'stay', label: 'Stay' },
  train: { icon: 'train', tone: 'accent', label: 'Train' },
  transport: { icon: 'train', tone: 'accent', label: 'Transport' },
  bus: { icon: 'bus', tone: 'accent', label: 'Bus' },
  ferry: { icon: 'ferry', tone: 'accent', label: 'Ferry' },
  car: { icon: 'car', tone: 'neutral', label: 'Car' },
  car_rental: { icon: 'car', tone: 'neutral', label: 'Car' },
  restaurant: { icon: 'restaurant', tone: 'accent', label: 'Restaurant' },
  activity: { icon: 'ticket', tone: 'success', label: 'Ticket' },
  ticket: { icon: 'ticket', tone: 'success', label: 'Ticket' },
  museum: { icon: 'museum', tone: 'success', label: 'Museum' },
  event: { icon: 'event', tone: 'success', label: 'Event' },
  note: { icon: 'note', tone: 'neutral', label: 'Note' },
  other: { icon: 'note', tone: 'neutral', label: 'Other' },
}

export function category(type) {
  return CATEGORY[type] || CATEGORY.other
}

/**
 * Icon on its soft category fill.
 * tone: accent | info | stay | success | danger | neutral | inverse | sun
 * size: sm (40) | md (48) | lg (56)
 */
export default function IconTile({ icon, tone = 'accent', size = 'sm', label, className }) {
  const iconSize = size === 'lg' ? 26 : size === 'md' ? 24 : 20
  return (
    <span className={cx('c-tile', `c-tile--${tone}`, `c-tile--${size}`, className)}>
      <Icon name={icon} size={iconSize} label={label} />
    </span>
  )
}
