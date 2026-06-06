import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastTone = 'success' | 'error'
interface Toast {
  id: number
  message: string
  tone: ToastTone
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let counter = 0

/** Globaler Toast-Provider für kurze Erfolg-/Fehler-Rückmeldungen. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = ++counter
      setToasts((t) => [...t, { id, message, tone }])
      window.setTimeout(() => remove(id), 4000)
    },
    [remove],
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto flex items-center gap-2.5 rounded-lg border px-4 py-3 text-sm shadow-pop animate-slide-up',
                t.tone === 'success'
                  ? 'border-sage-200 bg-sage-50 text-sage-700'
                  : 'border-terracotta-200 bg-terracotta-50 text-terracotta-600',
              )}
              role="status"
            >
              {t.tone === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0" />
              )}
              <span>{t.message}</span>
              <button
                onClick={() => remove(t.id)}
                className="cursor-pointer rounded p-0.5 opacity-60 hover:opacity-100"
                aria-label="Schließen"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

/** Hook für Toasts. Fällt auf console zurück, falls außerhalb des Providers. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    return { toast: (m) => console.log('[toast]', m) }
  }
  return ctx
}
