import { useState } from 'react'

/**
 * Confirmation dialog for destructive actions.
 * Props:
 *  - message: string — what you're confirming
 *  - confirmLabel: string (default "Delete")
 *  - cancelLabel: string (default "Cancel")
 *  - onConfirm: () => void | Promise<void>
 *  - onCancel: () => void
 *  - destructive: boolean (default true) — red styling
 */
export default function ConfirmDialog({
  message = 'Are you sure?',
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  destructive = true,
}) {
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm?.()
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div
        onClick={onCancel}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(42,37,32,0.55)',
          zIndex: 300, backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          animation: 'fadeIn 200ms ease',
        }}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'calc(100% - 48px)', maxWidth: 340,
        background: 'var(--surface)', borderRadius: 20,
        padding: '24px 20px 20px', zIndex: 301,
        boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
        textAlign: 'center',
      }}>
        <div style={{
          fontFamily: 'var(--font-heading)', fontWeight: 700,
          fontSize: 16, color: 'var(--text)', marginBottom: 8,
        }}>
          {message}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            onClick={onCancel}
            disabled={loading}
            className="btn btn-ghost"
            style={{ flex: 1 }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={destructive ? 'btn btn-danger' : 'btn btn-primary'}
            style={{ flex: 1 }}
          >
            {loading ? 'Deleting...' : confirmLabel}
          </button>
        </div>
      </div>
    </>
  )
}
