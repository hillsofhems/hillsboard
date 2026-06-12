import { useState } from 'react'
import { Check, Pencil, MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn, formatDateTime } from '@/lib/utils'
import type { CardTodo } from '@/lib/types'

/**
 * Felder, die beim Abhaken bzw. Wieder-Öffnen eines To-dos gesetzt werden.
 * Abhaken: Zeitpunkt + Person merken. Öffnen: Abschluss-Infos verwerfen.
 */
export function doneFields(isDone: boolean, meId: string | null | undefined): Partial<CardTodo> {
  return isDone
    ? { is_done: true, done_at: new Date().toISOString(), done_by: meId ?? null }
    : { is_done: false, done_at: null, done_by: null, done_comment: null }
}

/**
 * Abschluss-Bereich eines erledigten To-dos: zeigt „Erledigt von … am …" plus
 * optionale Notiz. Notiz lässt sich inline schreiben/ändern. `autoEdit` öffnet
 * den Editor direkt (frisch abgehakt).
 */
export function TodoDoneSection({
  todo,
  byName,
  onSaveComment,
  autoEdit,
  onClose,
}: {
  todo: CardTodo
  byName: string
  onSaveComment: (comment: string | null) => void
  autoEdit?: boolean
  /** Wird aufgerufen, wenn der Editor geschlossen wird (Speichern/Abbrechen). */
  onClose?: () => void
}) {
  const [editing, setEditing] = useState(Boolean(autoEdit))
  const [draft, setDraft] = useState(todo.done_comment ?? '')

  const save = () => {
    const v = draft.trim()
    onSaveComment(v || null)
    setEditing(false)
    onClose?.()
  }
  const cancel = () => {
    setDraft(todo.done_comment ?? '')
    setEditing(false)
    onClose?.()
  }

  return (
    <div className="mt-2 rounded-md border border-sage-200 bg-sage-50/70 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-2xs text-sage-700">
        <Check className="h-3.5 w-3.5" />
        <span>
          Erledigt{byName ? ` von ${byName}` : ''}
          {todo.done_at ? ` · ${formatDateTime(todo.done_at)}` : ''}
        </span>
      </div>

      {editing ? (
        <div className="mt-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Notiz zum Abschluss (optional) …"
            rows={2}
            autoFocus
            className={cn(
              'w-full resize-y rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink',
              'focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200',
            )}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save()
              if (e.key === 'Escape') cancel()
            }}
          />
          <div className="mt-1.5 flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={cancel}>
              Abbrechen
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={save}>
              Notiz speichern
            </Button>
          </div>
        </div>
      ) : todo.done_comment ? (
        <div className="group/note mt-1 flex items-start gap-1.5">
          <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-ink-soft">
            {todo.done_comment}
          </p>
          <button
            type="button"
            onClick={() => {
              setDraft(todo.done_comment ?? '')
              setEditing(true)
            }}
            className="shrink-0 cursor-pointer rounded p-0.5 text-ink-faint opacity-100 transition-opacity hover:text-sage-600 sm:opacity-0 sm:group-hover/note:opacity-100"
            aria-label="Notiz bearbeiten"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-1 inline-flex cursor-pointer items-center gap-1 text-xs text-ink-muted hover:text-sage-600"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          Notiz hinzufügen
        </button>
      )}
    </div>
  )
}
