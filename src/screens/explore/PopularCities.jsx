import { Section, Chip, Text } from '../../ui'

/** Shown in Explore when there is no trip or remembered city: tap one to open its guide (nothing is written until then). */
export default function PopularCities({ cities, onPick }) {
  return (
    <Section title="Popular cities">
      <Text variant="caption" tone="muted" as="p">Pick one to open its guide, or search any city above.</Text>
      <div className="c-chip-row explore-popular" role="group" aria-label="Popular cities">
        {cities.map(c => <Chip key={c.city} icon="map" onClick={() => onPick(c)}>{c.city}</Chip>)}
      </div>
    </Section>
  )
}
