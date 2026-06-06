import { cn } from '@/lib/utils'
import { initials, avatarColor } from '@/lib/utils'

/** Initialen-Avatar mit ruhiger, namensabhängiger Farbe. */
export function Avatar({
  name,
  size = 'md',
  className,
  title,
}: {
  name: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
  title?: string
}) {
  const sizes = {
    xs: 'h-6 w-6 text-2xs',
    sm: 'h-7 w-7 text-xs',
    md: 'h-9 w-9 text-sm',
    lg: 'h-12 w-12 text-base',
  }
  return (
    <span
      title={title ?? name}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-medium select-none',
        avatarColor(name || '?'),
        sizes[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
