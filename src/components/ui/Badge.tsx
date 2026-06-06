import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Tone = 'sage' | 'sand' | 'terracotta' | 'neutral' | 'blue'

const TONES: Record<Tone, string> = {
  sage: 'bg-sage-100 text-sage-700',
  sand: 'bg-sand-200 text-ink-soft',
  terracotta: 'bg-terracotta-100 text-terracotta-600',
  neutral: 'bg-sand-100 text-ink-muted',
  blue: 'bg-blue-100 text-blue-700',
}

/** Kleine farbige Status-/Kategorie-Pille (monday-artige Akzente, gedämpft). */
export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: Tone
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
