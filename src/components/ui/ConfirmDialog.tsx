import { Modal } from './Modal'
import { Button } from './Button'

/** Bestätigungs-Dialog für destruktive Aktionen (Löschen etc.). */
export function ConfirmDialog({
  open,
  title = 'Wirklich löschen?',
  message,
  confirmLabel = 'Löschen',
  onConfirm,
  onClose,
  loading,
}: {
  open: boolean
  title?: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onClose: () => void
  loading?: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-soft">{message}</p>
    </Modal>
  )
}
