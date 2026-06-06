import { useEffect, useState } from 'react'
import { Plus, Trash2, Calendar, UserRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { CardTodo, Profile } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { Avatar } from '@/components/ui/Avatar'
import { cn, formatShortDate, isOverdue } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

/**
 * To-do-Liste einer Kanban-Karte: anlegen, abhaken, Verantwortlichen + Fällig-
 * keit setzen, löschen. Meldet Änderungen über onChange (für Fortschrittsanzeige).
 */
export function CardTodos({
  cardId,
  profiles,
  onChange,
}: {
  cardId: string
  profiles: Profile[]
  onChange?: () => void
}) {
  const { toast } = useToast()
  const [todos, setTodos] = useState<CardTodo[]>([])
  const [loading, setLoading] = useState(true)
  const [newText, setNewText] = useState('')
  const [adding, setAdding] = useState(false)

  const load = () => {
    supabase
      .from('card_todos')
      .select('*')
      .eq('card_id', cardId)
      .order('position')
      .then(({ data }) => {
        setTodos((data as CardTodo[]) ?? [])
        setLoading(false)
      })
  }
  useEffect(load, [cardId])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = newText.trim()
    if (!text) return
    setAdding(true)
    const maxPos = todos.reduce((m, t) => Math.max(m, t.position), 0)
    const { data, error } = await supabase
      .from('card_todos')
      .insert({ card_id: cardId, text, position: maxPos + 1 })
      .select()
      .single()
    if (error) toast(error.message, 'error')
    else {
      setTodos((prev) => [...prev, data as CardTodo])
      setNewText('')
      onChange?.()
    }
    setAdding(false)
  }

  const patch = async (id: string, changes: Partial<CardTodo>) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...changes } : t)))
    const { error } = await supabase.from('card_todos').update(changes).eq('id', id)
    if (error) toast(error.message, 'error')
    onChange?.()
  }

  const remove = async (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id))
    const { error } = await supabase.from('card_todos').delete().eq('id', id)
    if (error) toast(error.message, 'error')
    onChange?.()
  }

  const done = todos.filter((t) => t.is_done).length

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">To-dos</h3>
        {todos.length > 0 && (
          <span className="text-xs text-ink-muted">
            {done}/{todos.length} erledigt
          </span>
        )}
      </div>

      {/* dünner Fortschrittsbalken */}
      {todos.length > 0 && (
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-sand-100">
          <div
            className="h-full rounded-full bg-sage-500 transition-all duration-300"
            style={{ width: `${(done / todos.length) * 100}%` }}
          />
        </div>
      )}

      {loading ? (
        <div className="py-3 text-sm text-ink-muted">Lädt …</div>
      ) : (
        <ul className="space-y-1.5">
          {todos.map((t) => {
            const assignee = profiles.find((p) => p.id === t.assignee_id)
            const overdue = t.due_date && isOverdue(t.due_date) && !t.is_done
            return (
              <li
                key={t.id}
                className="group flex items-start gap-2.5 rounded-lg border border-line bg-surface px-2.5 py-2"
              >
                <input
                  type="checkbox"
                  checked={t.is_done}
                  onChange={(e) => patch(t.id, { is_done: e.target.checked })}
                  className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-sage-500"
                  aria-label="Erledigt"
                />

                <div className="min-w-0 flex-1">
                  {/* Primär: der To-do-Text */}
                  <input
                    value={t.text}
                    onChange={(e) =>
                      setTodos((prev) =>
                        prev.map((x) => (x.id === t.id ? { ...x, text: e.target.value } : x)),
                      )
                    }
                    onBlur={(e) => patch(t.id, { text: e.target.value.trim() || t.text })}
                    placeholder="To-do …"
                    className={cn(
                      'w-full bg-transparent text-sm focus:outline-none',
                      t.is_done ? 'text-ink-faint line-through' : 'text-ink',
                    )}
                  />

                  {/* Sekundär: dezente Meta-Zeile (Fälligkeit + Verantwortlich) */}
                  <div className="mt-0.5 flex flex-wrap items-center gap-1">
                    <label
                      className={cn(
                        'inline-flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-2xs transition-colors',
                        overdue
                          ? 'bg-terracotta-50 text-terracotta-600'
                          : 'text-ink-faint hover:bg-sand-100 hover:text-ink-muted',
                      )}
                      title="Fälligkeitsdatum"
                    >
                      <Calendar className="h-3 w-3" />
                      {t.due_date ? formatShortDate(t.due_date) : 'Datum'}
                      <input
                        type="date"
                        value={t.due_date ?? ''}
                        onChange={(e) => patch(t.id, { due_date: e.target.value || null })}
                        className="sr-only"
                      />
                    </label>

                    {/* Verantwortlich – kompakt: Avatar/Icon + minimaler Select */}
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded px-1 py-0.5 text-2xs',
                        assignee ? 'text-ink-muted' : 'text-ink-faint',
                        'hover:bg-sand-100',
                      )}
                      title="Verantwortlich"
                    >
                      {assignee ? (
                        <Avatar name={assignee.name} size="xs" className="h-4 w-4 text-[9px]" />
                      ) : (
                        <UserRound className="h-3 w-3" />
                      )}
                      <select
                        value={t.assignee_id ?? ''}
                        onChange={(e) => patch(t.id, { assignee_id: e.target.value || null })}
                        aria-label="Verantwortlich"
                        className="cursor-pointer appearance-none bg-transparent text-2xs focus:outline-none"
                      >
                        <option value="">Wer?</option>
                        {profiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => remove(t.id)}
                  className="mt-0.5 cursor-pointer rounded p-1 text-ink-faint opacity-0 transition-opacity hover:text-terracotta-600 group-hover:opacity-100"
                  aria-label="To-do löschen"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={add} className="mt-2 flex gap-2">
        <Input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="Neues To-do …"
          className="h-9"
        />
        <Button type="submit" size="sm" variant="secondary" loading={adding} disabled={!newText.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </form>
    </div>
  )
}
