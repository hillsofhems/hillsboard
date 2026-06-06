import type { ReactNode } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Zentrierter Spinner für Ladezustände. */
export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-12 text-ink-muted', className)}>
      <Loader2 className="h-5 w-5 animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  )
}

/** Skeleton-Platzhalter (reserviert Platz, vermeidet Layout-Sprünge). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-sand-100', className)} />
}

/** Freundlicher Empty State mit Icon, Text und optionaler Aktion. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-sand-50/50 px-6 py-14 text-center',
        className,
      )}
    >
      {Icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sand-100 text-ink-muted">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <h3 className="font-serif text-lg text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/** Fehlerzustand mit Retry-Möglichkeit. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-terracotta-200 bg-terracotta-50 px-6 py-10 text-center">
      <AlertTriangle className="mb-2 h-6 w-6 text-terracotta-500" />
      <p className="text-sm text-terracotta-600">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 cursor-pointer text-sm font-medium text-terracotta-600 underline underline-offset-2 hover:text-terracotta-600"
        >
          Erneut versuchen
        </button>
      )}
    </div>
  )
}
