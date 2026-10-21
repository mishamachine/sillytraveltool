import { lazy, Suspense } from 'react'
import { useUIStore } from '../../store'
import { SegmentedControl, Loading } from '../../ui'
import './explore.css'

const GuideScreen = lazy(() => import('../guide/GuideScreen'))
const GooseyScreen = lazy(() => import('../goosey/GooseyScreen'))

const MODES = [
  { value: 'guide', label: 'City guide' },
  { value: 'honk', label: 'HONK nearby' },
]

// Explore = the city Guide + HONK (Goose's right-now picks), one tab.
export default function ExploreScreen() {
  const mode = useUIStore(s => s.exploreMode)
  const setMode = useUIStore(s => s.setExploreMode)
  const Active = mode === 'honk' ? GooseyScreen : GuideScreen
  return (
    <div className="explore-shell">
      <div className="explore-shell__switch">
        <SegmentedControl label="Explore" value={mode} onChange={setMode} options={MODES} idPrefix="explore" />
      </div>
      <div className="explore-shell__body" role="tabpanel" id={`explore-panel-${mode}`} aria-labelledby={`explore-tab-${mode}`}>
        <Suspense fallback={<Loading inline title="One moment" />}>
          <Active />
        </Suspense>
      </div>
    </div>
  )
}
