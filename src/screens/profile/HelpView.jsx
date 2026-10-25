import { useState } from 'react'
import { HELP_GROUPS, HELP_TOPICS, HELP_FAQ, HELP_CONTACT, searchHelp } from '../../lib/helpContent'
import { track } from '../../lib/analytics'
import { useBackHandler } from '../../lib/backStack'
import { useUIStore } from '../../store'
import BetaCard from '../../components/shared/BetaCard'
import { Screen, ScreenHeader, Section, Card, ListRow, Field, Banner, EmptyState, Text, Stack, Icon, LinkButton } from '../../ui'

function TopicView({ topic, onBack }) {
  const group = HELP_GROUPS.find(g => g.id === topic.group)
  return (
    <Screen gap={4} labelledBy="help-topic-title">
      <ScreenHeader onBack={onBack} backLabel="Back to help" overline={group?.title} title={topic.title}
        titleId="help-topic-title" meta={topic.summary} />
      <Card>
        <ol className="help-steps">
          {topic.steps.map((s, i) => (
            <li key={i} className="help-step">
              <span className="help-step__num" aria-hidden="true">{i + 1}</span>
              <Text variant="body" as="span">{s}</Text>
            </li>
          ))}
        </ol>
      </Card>
      {topic.tips?.length > 0 && (
        <Banner tone="info" icon="lightbulb" title="Good to know">
          <Stack gap={2}>{topic.tips.map((t, i) => <p key={i}>{t}</p>)}</Stack>
        </Banner>
      )}
    </Screen>
  )
}

function FaqItem({ item }) {
  return (
    <details className="help-faq">
      <summary className="help-faq__q">
        <span>{item.q}</span>
        <Icon name="chevron-down" size={18} className="help-faq__caret" />
      </summary>
      <Text variant="body" tone="secondary" className="help-faq__a">{item.a}</Text>
    </details>
  )
}

/** How-to guide: searchable topics by group, then FAQ. Content lives in src/lib/helpContent.js. */
export default function HelpView({ onBack }) {
  const [query, setQuery] = useState('')
  const [topicId, setTopicId] = useState(null)
  const topic = HELP_TOPICS.find(t => t.id === topicId)
  const openTour = useUIStore(s => s.openTour)
  useBackHandler(!!topic, () => setTopicId(null))

  const open = (t) => { setTopicId(t.id); track('help_opened', { topic: t.id }); window.scrollTo?.(0, 0) }
  if (topic) return <TopicView topic={topic} onBack={() => setTopicId(null)} />

  const results = query.trim() ? searchHelp(query) : null
  const row = (t) => <ListRow key={t.id} icon={t.icon} tone={t.tone} title={t.title} meta={t.summary} chevron onClick={() => open(t)} />

  return (
    <Screen gap={4} labelledBy="help-title">
      <ScreenHeader onBack={onBack} backLabel="Back to profile" title="Guide and FAQ" titleId="help-title"
        meta="How every part of the app works, and answers to common questions." />
      <Field label="Search help" hideLabel icon="search" type="search" placeholder="Search, e.g. forward email"
        value={query} onChange={e => setQuery(e.target.value)} />

      {results ? (
        results.length
          ? <Card variant="group">{results.map(row)}</Card>
          : <EmptyState goose="worried" title="Goose has no notes on that">Try another word, or email us below.</EmptyState>
      ) : (
        <>
          <Card variant="group">
            <ListRow icon="compass" tone="accent" title="Take the tour" meta="A two-minute look at everything STT does" chevron onClick={openTour} />
          </Card>
          {HELP_GROUPS.map(g => (
            <Section key={g.id} title={g.title}>
              <Card variant="group">{HELP_TOPICS.filter(t => t.group === g.id).map(row)}</Card>
            </Section>
          ))}
          <Section title="Questions">
            <Card variant="group">{HELP_FAQ.map((f, i) => <FaqItem key={i} item={f} />)}</Card>
          </Section>
        </>
      )}

      <BetaCard where="help" />

      <Stack gap={1} align="center" className="profile-about">
        <Text variant="caption" tone="muted">Still stuck? Goose reads every email.</Text>
        <LinkButton href={`mailto:${HELP_CONTACT}?subject=${encodeURIComponent('Help with STT')}`}>{HELP_CONTACT}</LinkButton>
      </Stack>
    </Screen>
  )
}
