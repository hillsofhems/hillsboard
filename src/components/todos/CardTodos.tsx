import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { CardTodo, CardTodoAssignee, Profile } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { AssigneePicker } from './AssigneePicker'
import { TodoDoneSection, doneFields } from './TodoDone'
import { useAuth } from '@/context/AuthContext'
import { cn, isOverdue } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

/**
 * To-do-Liste einer Kanban-Karte: anlegen, abhaken, Fälligkeit setzen,
 * mehreren Personen ODER dem Team zuweisen, löschen. Meldet Änderungen via onChange.
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
  const { profile } = useAuth()
  const meId = profile?.id
  const [todos, setTodos] = useState<CardTodo[]>([])
  // todoId -> Menge zugewiesener User-IDs
  const [assignees, setAssignees] = useState<Record<string, Set<string>>>({})
  const [loading, setLoading] = useState(true)
  const [newText, setNewText] = useState('')
  const [adding, setAdding] = useState(false)
  // To-do, das gerade frisch abgehakt wurde (Notiz-Editor öffnet automatisch).
  const [justCheckedId, setJustCheckedId] = useState<string | null>(null)

  const nameOf = useMemo(() => {
    const m: Record<string, string> = {}
    profiles.forEach((p) => (m[p.id] = p.name))
    return (id: string | null) => (id ? m[id] ?? '' : '')
  }, [profiles])

  const load = async () => {
    const { data: todoData } = await supabase
      .from('card_todos')
      .select('*')
      .eq('card_id', cardId)
      .order('position')
    const list = (todoData as CardTodo[]) ?? []
    setTodos(list)

    const ids = list.map((t) => t.id)
    const amap: Record<string, Set<string>> = {}
    if (ids.length) {
      const { data: aData } = await supabase
        .from('card_todo_assignees')
        .select('*')
        .in('todo_id', ids)
      ;((aData as CardTodoAssignee[]) ?? []).forEach((a) => {
        ;(amap[a.todo_id] ??= new Set()).add(a.user_id)
      })
    }
    setAssignees(amap)
    setLoading(false)
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId])

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

  const toggleUser = async (todoId: string, userId: string) => {
    const has = assignees[todoId]?.has(userId)
    setAssignees((prev) => {
      const next = { ...prev }
      const s = new Set(next[todoId] ?? [])
      if (has) s.delete(userId)
      else s.add(userId)
      next[todoId] = s
      return next
    })
    if (has) {
      await supabase.from('card_todo_assignees').delete().eq('todo_id', todoId).eq('user_id', userId)
    } else {
      const { error } = await supabase
        .from('card_todo_assignees')
        .insert({ todo_id: todoId, user_id: userId })
      if (error) toast(error.message, 'error')
    }
  }

  const toggleTeam = (todo: CardTodo) => patch(todo.id, { is_team: !todo.is_team })

  // Abhaken/Öffnen: Abschluss-Felder setzen; bei „erledigt" Notiz-Editor öffnen.
  const toggleDone = (todo: CardTodo, checked: boolean) => {
    setJustCheckedId(checked ? todo.id : null)
    patch(todo.id, doneFields(checked, meId))
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
            const overdue = t.due_date && isOverdue(t.due_date) && !t.is_done
            const selected = assignees[t.id] ?? new Set<string>()
            return (
              <li key={t.id} className="group rounded-lg border border-line bg-surface p-2.5">
                {/* Zeile 1: Haken + To-do-Text + Löschen */}
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={t.is_done}
                    onChange={(e) => toggleDone(t, e.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-sage-500"
                    aria-label="Erledigt"
                  />
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
                      'min-w-0 flex-1 bg-transparent text-sm focus:outline-none',
                      t.is_done ? 'text-ink-faint line-through' : 'text-ink',
                    )}
                  />
                  <button
                    onClick={() => remove(t.id)}
                    className="shrink-0 cursor-pointer rounded p-1 text-ink-faint opacity-100 transition-opacity hover:text-terracotta-600 sm:opacity-0 sm:group-hover:opacity-100"
                    aria-label="To-do löschen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Zeile 2: Fälligkeit */}
                <div className="mt-2 flex flex-wrap items-center gap-2 pl-[26px]">
                  <input
                    type="date"
                    value={t.due_date ?? ''}
                    onChange={(e) => patch(t.id, { due_date: e.target.value || null })}
                    aria-label="Fälligkeitsdatum"
                    className={cn(
                      'h-9 w-[9.5rem] max-w-full shrink cursor-pointer rounded-md border bg-surface px-2.5 text-sm text-ink-soft',
                      'focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200',
                      'sm:h-7 sm:w-auto sm:text-xs',
                      overdue ? 'border-terracotta-300 text-terracotta-600' : 'border-line',
                    )}
                  />
                </div>

                {/* Zeile 3: Zuweisung (mehrere Personen oder Team) */}
                <div className="mt-2 pl-[26px]">
                  <AssigneePicker
                    profiles={profiles}
                    selected={selected}
                    isTeam={t.is_team}
                    onToggleUser={(uid) => toggleUser(t.id, uid)}
                    onToggleTeam={() => toggleTeam(t)}
                  />
                </div>

                {/* Zeile 4: Abschluss-Notiz (nur bei erledigten To-dos) */}
                {t.is_done && (
                  <div className="pl-[26px]">
                    <TodoDoneSection
                      todo={t}
                      byName={nameOf(t.done_by)}
                      autoEdit={justCheckedId === t.id}
                      onSaveComment={(comment) => patch(t.id, { done_comment: comment })}
                    />
                  </div>
                )}
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
