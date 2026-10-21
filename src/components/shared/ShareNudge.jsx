import { useState } from 'react'

export default function ShareNudge() {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    const shareData = {
      title: 'Silly Travel Tool',
      text: 'Check out The Goose 🪿 — the AI-powered travel companion with a personality',
      url: 'https://sillytraveltool.com',
    }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
      } else {
        await navigator.clipboard.writeText('https://sillytraveltool.com')
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {}
  }

  return (
    <div style={{ padding: '16px 16px 8px', display: 'flex', justifyContent: 'center' }}>
      <button
        onClick={handleShare}
        style={{
          background: 'none',
          border: '1.5px solid var(--primary)',
          borderRadius: 99,
          padding: '7px 18px',
          fontSize: 13,
          color: 'var(--primary)',
          fontFamily: 'var(--font-heading)',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          transition: 'all 0.15s',
        }}
      >
        🪿 {copied ? 'Link copied!' : 'Know a traveller? Share the app'}
      </button>
    </div>
  )
}
