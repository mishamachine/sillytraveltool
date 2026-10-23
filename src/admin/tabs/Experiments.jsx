import { Card } from '../ui'

// Build step 4 (docs/ADMIN_PLAN.md section 7). Shown now so the shape and the rules are visible.
export default function Experiments() {
  return (
    <div className="a-grid">
      <Card title="Live test" icon="target" className="a-span-7">
        <p className="a-empty">No test running. The engine (assignment, exposure, readout) is build step 4.</p>
        <ul className="a-rules">
          <li>One test per surface at a time, with a primary metric and a guardrail.</li>
          <li>A test can't start unless it can finish within 6 weeks at current traffic. The page shows the people needed before launch.</li>
          <li>When a test ends, "No test running" goes to the top of Needs you with the next test from Up next.</li>
          <li>Today's traffic (a handful of active members) can't settle an in-app test, so the first tests run on the website.</li>
        </ul>
      </Card>
      <Card title="Archive" icon="book" className="a-span-5">
        <p className="a-empty">Every finished test lands here with its numbers, the decision (shipped, dropped, inconclusive) and what you learned.</p>
      </Card>
    </div>
  )
}
