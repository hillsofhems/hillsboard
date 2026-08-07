import { useEffect, useRef, useState } from 'react'
import { Bold, ChevronDown, Heading2, Heading3, List, ListOrdered } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Read-only Darstellung von einfachem Rich-Text-HTML. */
export function RichTextView({ html, className }: { html: string; className?: string }) {
  if (!html?.trim()) {
    return <p className={cn('text-sm italic text-ink-faint', className)}>Keine Notizen.</p>
  }
  return <div className={cn('prose-hills text-sm', className)} dangerouslySetInnerHTML={{ __html: html }} />
}

/**
 * Rich-Text mit begrenzter Vorschau: lange Inhalte werden auf `collapsedHeight`
 * eingeklappt und lassen sich per „Mehr anzeigen" aufklappen. Kurze Inhalte
 * werden ohne Toggle vollständig angezeigt.
 */
export function CollapsibleRichText({
  html,
  collapsedHeight = 96,
  className,
}: {
  html: string
  collapsedHeight?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  // Prüfen, ob der Inhalt die Vorschauhöhe überschreitet (auch bei Resize).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setOverflowing(el.scrollHeight > collapsedHeight + 8)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [html, collapsedHeight])

  if (!html?.trim()) return null

  return (
    <div className={className}>
      <div className="relative">
        <div
          ref={ref}
          className="overflow-hidden"
          style={!expanded ? { maxHeight: collapsedHeight } : undefined}
        >
          <RichTextView html={html} />
        </div>
        {!expanded && overflowing && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-surface to-transparent" />
        )}
      </div>
      {overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-sage-700 transition-colors hover:text-sage-800"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
          {expanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}
        </button>
      )}
    </div>
  )
}

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  onBlur?: () => void
  placeholder?: string
  className?: string
}

/**
 * Schlanker Rich-Text-Editor (Überschriften, Fett, Listen) auf Basis von
 * contentEditable. Bewusst minimal – passend zu Meeting-Notizen & Info-Seiten.
 */
export function RichTextEditor({ value, onChange, onBlur, placeholder, className }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Externen Wert nur setzen, wenn er abweicht (verhindert Cursor-Sprünge).
  useEffect(() => {
    const el = ref.current
    if (el && el.innerHTML !== value) el.innerHTML = value || ''
  }, [value])

  const exec = (command: string, arg?: string) => {
    ref.current?.focus()
    // execCommand ist deprecated, für ein internes Tool aber völlig ausreichend.
    document.execCommand(command, false, arg)
    if (ref.current) onChange(ref.current.innerHTML)
  }

  const btn = (
    onClick: () => void,
    label: string,
    Icon: React.ComponentType<{ className?: string }>,
  ) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="cursor-pointer rounded-md p-1.5 text-ink-muted transition-colors hover:bg-sand-200 hover:text-ink"
    >
      <Icon className="h-4 w-4" />
    </button>
  )

  return (
    <div className={cn('rounded-lg border border-line-strong bg-surface', className)}>
      <div className="flex items-center gap-0.5 border-b border-line px-2 py-1.5">
        {btn(() => exec('formatBlock', 'h2'), 'Überschrift', Heading2)}
        {btn(() => exec('formatBlock', 'h3'), 'Unterüberschrift', Heading3)}
        {btn(() => exec('bold'), 'Fett', Bold)}
        {btn(() => exec('insertUnorderedList'), 'Aufzählung', List)}
        {btn(() => exec('insertOrderedList'), 'Nummerierte Liste', ListOrdered)}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        onBlur={onBlur}
        data-placeholder={placeholder}
        className={cn(
          'prose-hills min-h-[140px] px-3.5 py-3 text-sm focus:outline-none',
          'empty:before:text-ink-faint empty:before:content-[attr(data-placeholder)]',
        )}
      />
    </div>
  )
}
