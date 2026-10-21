import { useAuthStore } from '../../store'
import { BADGES, BADGE_TIER_TONE } from '../../lib/tokens'
import { Screen, ScreenHeader, Section, Card, ListRow, IconTile, ProgressBar, Text, Chip } from '../../ui'

const TIER_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard', legendary: 'Legendary' }

export default function BadgesView({ onBack }) {
  const { stats, badges } = useAuthStore()
  const earnedIds = (badges || []).map(b => b.badge_id)
  const all = Object.entries(BADGES)
  const earned = all.filter(([id]) => earnedIds.includes(id))
  const locked = all.filter(([id]) => !earnedIds.includes(id))

  return (
    <Screen gap={4} labelledBy="badges-title">
      <ScreenHeader onBack={onBack} backLabel="Back to profile" title="Badges" titleId="badges-title"
        meta={`${earned.length} of ${all.length} earned`} />

      {earned.length > 0 && (
        <Section title="Earned">
          <Card variant="group">
            {earned.map(([id, badge]) => (
              <ListRow key={id} leading={<IconTile icon={badge.icon} tone={BADGE_TIER_TONE[badge.tier]} />}
                title={badge.name} meta={badge.description}
                trailing={<Chip tone="success" icon="check">{TIER_LABEL[badge.tier]}</Chip>} />
            ))}
          </Card>
        </Section>
      )}

      <Section title="Still to earn">
        <Card variant="group">
          {locked.map(([id, badge]) => {
            const currentVal = badge.stat ? (stats?.[badge.stat] || 0) : null
            const progress = (badge.target && currentVal !== null) ? Math.min(1, currentVal / badge.target) : null
            return (
              <ListRow key={id} leading={<IconTile icon={badge.icon} tone="neutral" />} title={badge.name}
                meta={badge.description}
                trailing={progress !== null ? <Text variant="caption" tone="muted" className="tabular">{Math.min(currentVal, badge.target)}/{badge.target}</Text> : undefined}>
                {progress !== null && <ProgressBar value={progress} label={`${badge.name} progress`} className="profile-badge-progress" />}
              </ListRow>
            )
          })}
        </Card>
      </Section>
    </Screen>
  )
}
