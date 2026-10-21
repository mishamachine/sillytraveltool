import { useState } from 'react'
import { Dialog, Button } from '../../ui'

/**
 * Confirmation dialog for destructive actions.
 * Props: message (title), detail (body), confirmLabel, cancelLabel, onConfirm, onCancel, destructive
 */
export default function ConfirmDialog({
  message = 'Are you sure?',
  detail,
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
    <Dialog
      title={message}
      onClose={loading ? undefined : onCancel}
      actions={(
        <>
          <Button onClick={onCancel} disabled={loading}>{cancelLabel}</Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={handleConfirm} loading={loading}>
            {loading ? 'One moment' : confirmLabel}
          </Button>
        </>
      )}
    >
      {detail}
    </Dialog>
  )
}
