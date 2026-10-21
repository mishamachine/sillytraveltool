import { useState } from 'react'
import { useAuthStore } from '../../store'
import { Banner, LinkButton } from '../../ui'

export function inboxAddress(profile) {
  return profile?.booking_email_token ? `${profile.booking_email_token}@bookings.sillytraveltool.com` : null
}

/** The address with its only line break before the @, so it never wraps mid-domain. */
export function InboxAddress({ address }) {
  const at = address.indexOf('@')
  return <>{address.slice(0, at)}<wbr />{address.slice(at)}</>
}

/** Copy the Goose inbox address; returns [copied, copy]. */
export function useCopyInbox() {
  const profile = useAuthStore(s => s.profile)
  const address = inboxAddress(profile)
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }
  return { address, copied, copy }
}

/** Small dashed hint row: the inbox is a one-time onboarding step, this is the reminder. */
export default function InboxHint({ text = 'Forward bookings to your Goose inbox' }) {
  const { address, copied, copy } = useCopyInbox()
  if (!address) return null
  return (
    <Banner variant="hint" icon="mail" action={<LinkButton onClick={copy} aria-label={copied ? 'Inbox address copied' : 'Copy Goose inbox address'}>{copied ? 'Copied' : 'Copy'}</LinkButton>}>
      {text}
    </Banner>
  )
}
