import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** 'md' Standard-Dialog | 'lg' breiter | 'panel' rechtes Slide-over-Panel */
  size?: 'md' | 'lg' | 'panel'
}

/** Zugängliches Modal/Panel: Escape schließt, Klick auf Backdrop schließt, Body-Scroll-Lock. */
export function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  const isPanel = size === 'panel'

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-50 flex bg-ink/30 backdrop-blur-[2px] animate-fade-in',
        isPanel ? 'justify-end' : 'items-start justify-center p-4 sm:p-6 overflow-y-auto',
      )}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          'bg-surface flex flex-col',
          isPanel
            ? 'h-full w-full max-w-xl shadow-panel animate-slide-in-right'
            : cn(
                'rounded-2xl border border-line shadow-panel animate-slide-up my-auto w-full',
                size === 'lg' ? 'max-w-3xl' : 'max-w-lg',
              ),
        )}
      >
        {(title || true) && (
          <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
            <h2 className="text-lg font-serif font-semibold text-ink">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Schließen"
              className="cursor-pointer rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-sand-100 hover:text-ink"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className={cn('px-5 py-4', isPanel ? 'flex-1 overflow-y-auto' : 'overflow-visible')}>
          {children}
        </div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
