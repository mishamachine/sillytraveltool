import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store'
import { useWalletTable } from './useWallet'
import ProfileHome from './ProfileHome'
import DocumentsView from './DocumentsView'
import LoyaltyView from './LoyaltyView'
import BadgesView from './BadgesView'
import SettingsView from './SettingsView'
import DeleteAccountView from './DeleteAccountView'
import HelpView from './HelpView'
import { useBackHandler } from '../../lib/backStack'
import './profile.css'

// Profile tab: home → documents · loyalty · badges · help · settings → delete account
export default function ProfileScreen() {
  const { user, fetchStats } = useAuthStore()
  const [view, setView] = useState('home')
  const docs = useWalletTable('wallet_documents', user)
  const cards = useWalletTable('loyalty_cards', user)

  // Refresh on mount so score is always current
  useEffect(() => { if (user) fetchStats() }, [user?.id])

  const back = () => setView('home')
  useBackHandler(view !== 'home', back)
  switch (view) {
    case 'docs': return <DocumentsView wallet={docs} onBack={back} />
    case 'loyalty': return <LoyaltyView wallet={cards} onBack={back} />
    case 'badges': return <BadgesView onBack={back} />
    case 'help': return <HelpView onBack={back} />
    case 'settings': return <SettingsView onBack={back} onDelete={() => setView('delete')} />
    case 'delete': return <DeleteAccountView docCount={docs.rows.length} cardCount={cards.rows.length} onBack={() => setView('settings')} />
    default: return <ProfileHome docCount={docs.rows.length} cardCount={cards.rows.length} onOpen={setView} />
  }
}
