import { format } from 'date-fns'
import { useAuthStore, useUIStore } from '../../store'
import FeedbackCard from '../../components/shared/FeedbackCard'
import { BADGES, BADGE_TIER_TONE } from '../../lib/tokens'
import { Screen, Section, Card, ListRow, IconButton, LinkButton, Text, Overline, Stack, GooseMark, Icon } from '../../ui'
import SectionTour from '../../components/shared/SectionTour'

export function displayName(profile, user) {
  return profile?.display_name || user?.email?.split('@')[0] || 'Traveler'
}

function ScoreStat({ value, label }) {
  return (
    <Stack gap={0}>
      <Text variant="card-title" tone="inverse" as="p" className="tabular">{value}</Text>
      <Text variant="micro" tone="inverse-muted" as="p">{label}</Text>
    </Stack>
  )
}

/** Badge tile: tone fill when earned, dashed outline when locked. */
export function BadgeTile({ badge, earned, onClick }) {
  return (
    <button type="button" className="profile-badge" onClick={onClick} aria-label={`${badge.name}${earned ? ', earned' : ', locked'}`}>
      <span className={earned ? `profile-badge__tile c-tile--${BADGE_TIER_TONE[badge.tier] || 'accent'}` : 'profile-badge__tile profile-badge__tile--locked'}>
        <Icon name={earned ? badge.icon : 'lock'} size={26} />
      </span>
      <span className={earned ? 'profile-badge__name' : 'profile-badge__name tone-muted'}>{badge.name}</span>
    </button>
  )
}

export default function ProfileHome({ docCount, cardCount, onOpen }) {
  const { profile, user, stats, badges } = useAuthStore()
  const openTour = useUIStore(s => s.openTour)
  const earnedIds = (badges || []).map(b => b.badge_id)
  const total = Object.keys(BADGES).length
  const earned = Object.entries(BADGES).filter(([id]) => earnedIds.includes(id))
  const nextLocked = Object.entries(BADGES).find(([id]) => !earnedIds.includes(id))
  // Up to three earned badges plus the next one to chase
  const shown = [
    ...earned.slice(0, nextLocked ? 3 : 4).map(([id, b]) => ({ id, b, earned: true })),
    ...(nextLocked ? [{ id: nextLocked[0], b: nextLocked[1], earned: false }] : []),
  ]
  const since = profile?.created_at ? format(new Date(profile.created_at), 'MMMM yyyy') : null
  const score = stats?.goose_score || 0

  return (
    <Screen gap={4} labelledBy="profile-title">
      <header className="profile-id">
        <GooseMark expression="happy" size={52} tile tileSize="sm" className="profile-id__avatar" />
        <Stack gap={0} grow>
          <Text variant="h1" id="profile-title" className="profile-id__name" truncate>{displayName(profile, user)}</Text>
          <Text variant="caption" tone="muted">{since ? `Travelling since ${since}` : user?.email}</Text>
        </Stack>
        <span className="profile-id__actions">
          <SectionTour section="profile" />
          <IconButton icon="settings" label="Settings" onClick={() => onOpen('settings')} />
        </span>
      </header>

      <Card variant="inverse" aria-label={`Goose score ${score.toLocaleString()}`}>
        <Stack row justify="between" align="end">
          <Stack gap={0}>
            <Overline tone="inverse-muted">Goose score</Overline>
            <Text variant="h1" tone="inverse" as="p" className="tabular">{score.toLocaleString()}</Text>
          </Stack>
          <Text variant="caption" tone="accent-on-inverse" as="p">{earned.length} of {total} badges</Text>
        </Stack>
        <div className="profile-score-grid">
          <ScoreStat value={stats?.trips_completed || 0} label="trips" />
          <ScoreStat value={stats?.countries_visited || 0} label="countries" />
          <ScoreStat value={stats?.days_abroad || 0} label="days abroad" />
          <ScoreStat value={stats?.total_flights || 0} label="flights" />
        </div>
      </Card>

      <Section title="Badges" action={<LinkButton onClick={() => onOpen('badges')}>{earned.length} of {total}</LinkButton>}>
        <div className="profile-badges">
          {shown.map(({ id, b, earned: e }) => <BadgeTile key={id} badge={b} earned={e} onClick={() => onOpen('badges')} />)}
        </div>
      </Section>

      <Card variant="group">
        <ListRow icon="help" tone="success" title="Guide and FAQ" meta="How everything works, including travelling together" chevron onClick={() => onOpen('help')} />
        <ListRow icon="compass" tone="accent" title="Take the tour" meta="A two-minute look at everything STT does" chevron onClick={openTour} />
      </Card>

      <Card variant="group">
        <ListRow icon="passport" tone="info" title="Travel documents" trailing={docCount ? String(docCount) : undefined} chevron onClick={() => onOpen('docs')} />
        <ListRow icon="card" tone="accent" title="Loyalty cards" trailing={cardCount ? String(cardCount) : undefined} chevron onClick={() => onOpen('loyalty')} />
        <ListRow icon="settings" tone="neutral" title="Settings and privacy" chevron onClick={() => onOpen('settings')} />
      </Card>

      <FeedbackCard where="profile" />
    </Screen>
  )
}
