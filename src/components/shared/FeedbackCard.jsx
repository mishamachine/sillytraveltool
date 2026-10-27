import { reportIssueHref, trackReport } from '../../lib/reportIssue'
import { Card, Stack, Text, Overline, Icon, IconTile } from '../../ui'

/** Feedback card with "Report an issue" (bottom of Profile and Help). `where` is a short screen code for the report. */
export default function FeedbackCard({ where }) {
  return (
    <Card>
      <Stack gap={3}>
        <Stack row gap={3} align="start">
          <IconTile icon="flag" tone="accent" size="sm" />
          <Stack gap={1} grow>
            <Overline>Feedback</Overline>
            <Text variant="card-title" as="h2">Help shape STT</Text>
            <Text variant="caption" tone="secondary" as="p">
              If something breaks, looks odd or just annoys you, tell us and we'll fix it.
            </Text>
          </Stack>
        </Stack>
        <a className="c-btn c-btn--outline c-btn--md c-btn--block" href={reportIssueHref(where)} onClick={() => trackReport(where)}>
          <Icon name="alert-circle" size={18} strokeWidth={2} />
          <span className="c-btn__label">Report an issue</span>
        </a>
      </Stack>
    </Card>
  )
}
