import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
type Size = 'sm' | 'md' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const VARIANTS: Record<Variant, string> = {
  // Salbeigrün als ruhiger Primär-Akzent
  primary:
    'bg-sage-500 text-white hover:bg-sage-600 active:bg-sage-700 shadow-card disabled:bg-sage-300',
  secondary:
    'bg-surface text-ink border border-line-strong hover:bg-sand-50 active:bg-sand-100',
  ghost: 'text-ink-soft hover:bg-sand-100 hover:text-ink',
  subtle: 'bg-sand-100 text-ink-soft hover:bg-sand-200',
  danger: 'bg-terracotta-500 text-white hover:bg-terracotta-600 active:bg-terracotta-600',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  icon: 'h-9 w-9 rounded-lg',
}

/** Standard-Button mit Varianten, Größen und Lade-Zustand (deaktiviert während async). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors duration-200',
        'focus-visible:ring-2 focus-visible:ring-sage-400 focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
        'disabled:cursor-not-allowed disabled:opacity-70',
        !disabled && !loading && 'cursor-pointer',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
})
