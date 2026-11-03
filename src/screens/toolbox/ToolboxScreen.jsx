import { useState, useEffect } from 'react'
import { useUIStore, useTripsStore, useAuthStore } from '../../store'
import { currentPlace } from '../../lib/stops'
import { currencyForCountry } from '../../lib/currencies'
import { track } from '../../lib/analytics'
import { Screen, ScreenHeader, Card, IconTile, Text, Stack, Icon } from '../../ui'
import SectionTour from '../../components/shared/SectionTour'
import CurrencyTool from './CurrencyTool'
import TipTool from './TipTool'
import SosTool from './SosTool'
import TranslateTool from './components/TranslateTool'
import './toolbox.css'
import { useBackHandler } from '../../lib/backStack'

const TOOLS = {
  currency: { title: 'Currency', Component: CurrencyTool },
  tip: { title: 'Tip & split', Component: TipTool },
  sos: { title: 'SOS', Component: SosTool },
  translate: { title: 'Translate', Component: TranslateTool },
}

/** Tools hub: SOS first (danger), then Currency as the hero, Translate and Tip as tiles. */
function Hub({ open }) {
  const trips = useTripsStore(s => s.trips)
  const profile = useAuthStore(s => s.profile)
  // Where you are on the trip (today's stop), else where the next trip starts
  const cp = currentPlace(trips)
  const isLive = cp?.isLive
  const place = cp ? `${cp.country || cp.city}${cp.stop ? ` · stop ${cp.stop.n} of ${cp.stop.of}` : ''}` : null
  const from = currencyForCountry(cp?.country_code) || profile?.home_currency || 'USD'
  const home = profile?.home_currency || 'USD'

  return (
    <>
      <ScreenHeader title="Tools" titleId="tools-title" actions={<SectionTour section="toolbox" />}
        meta={place ? `Set for ${place} · from your ${isLive ? 'trip in progress' : 'next trip'}` : 'Travel essentials, ready offline'} />

      <a href="#sos" className="tools-sos" onClick={(e) => { e.preventDefault(); open('sos') }}>
        <span className="tools-sos__tile"><Icon name="sos" size={26} /></span>
        <span className="tools-sos__text">
          <span className="tools-sos__title">SOS</span>
          <span className="tools-sos__meta">Emergency numbers · embassy · emergency card</span>
        </span>
        <Icon name="chevron-right" size={20} />
      </a>

      <Card variant="raised" onClick={() => open('currency')} aria-label={`Currency converter, ${from} to ${from === home ? 'other currencies' : home}`}>
        <Stack row gap={3}>
          <IconTile icon="currency" tone="success" />
          <Text variant="body-lg" weight={600} as="span" className="grow">Currency</Text>
          <Icon name="chevron-right" size={20} className="tone-muted" />
        </Stack>
        <Stack row gap={2} align="baseline">
          <Text variant="h1" as="span">{from}</Text>
          <Text variant="body-lg" tone="muted" as="span">{from !== home ? `to ${home}` : "to any currency, live rates"}</Text>
        </Stack>
      </Card>

      <div className="grid-2">
        <Card variant="tile" className="tools-tile" onClick={() => open('translate')}>
          <IconTile icon="translate" tone="info" />
          <Stack gap={1}>
            <Text variant="body-lg" weight={600} as="span">Translate</Text>
            <Text variant="caption" tone="muted" as="span">Pocket phrase book</Text>
          </Stack>
        </Card>
        <Card variant="tile" className="tools-tile" onClick={() => open('tip')}>
          <IconTile icon="receipt" tone="accent" />
          <Stack gap={1}>
            <Text variant="body-lg" weight={600} as="span">Tip &amp; split</Text>
            <Text variant="caption" tone="muted" as="span">{place ? `In ${place}` : 'Any bill, any group'}</Text>
          </Stack>
        </Card>
      </div>
    </>
  )
}

export default function ToolboxScreen() {
  const { activeToolboxTab, setToolboxTab } = useUIStore()
  const [inTool, setInTool] = useState(false) // hub first; a tile opens its tool
  const [header, setHeader] = useState(null)   // tools may set a richer title (SOS · Spain)
  useBackHandler(inTool, () => setInTool(false))
  const tool = TOOLS[activeToolboxTab] || TOOLS.currency
  const ActiveTool = tool.Component

  // TranslateTool is owned elsewhere; record usage at the point the tool is opened
  useEffect(() => {
    if (inTool && activeToolboxTab === 'translate') track('translate_used', { trigger: 'tool_opened' }, 'toolbox')
  }, [activeToolboxTab, inTool])

  const open = (id) => { setHeader(null); setToolboxTab(id); setInTool(true) }

  return (
    <Screen gap={4} labelledBy={inTool ? 'tool-title' : 'tools-title'} key={inTool ? activeToolboxTab : 'hub'}>
      {inTool ? (
        <>
          <ScreenHeader onBack={() => setInTool(false)} backLabel="Back to tools" titleId="tool-title"
            title={header?.title || tool.title} meta={header?.meta} className="tools-header" />
          <ActiveTool onTitle={(title, meta) => setHeader({ title, meta })} />
        </>
      ) : <Hub open={open} />}
    </Screen>
  )
}
