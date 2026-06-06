import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import type { DragStartEvent, DragOverEvent, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { BoardCard, BoardColumn } from '@/lib/types'
import { useProfiles } from '@/hooks/useProfiles'
import { PageHeader } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { Spinner, ErrorState } from '@/components/ui/States'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { BoardColumnView } from '@/components/board/BoardColumnView'
import { BoardCardItem } from '@/components/board/BoardCardItem'
import { CardDetail } from '@/components/board/CardDetail'
import { useToast } from '@/components/ui/Toast'

type Containers = Record<string, string[]> // columnId -> geordnete cardIds

/** Kanban-Board: Spalten + Karten mit Drag & Drop (dnd-kit) und Detail-Panel. */
export function BoardPage() {
  const { toast } = useToast()
  const { profiles } = useProfiles()
  const [searchParams, setSearchParams] = useSearchParams()

  const [columns, setColumns] = useState<BoardColumn[]>([])
  const [cardMap, setCardMap] = useState<Record<string, BoardCard>>({})
  const [containers, setContainers] = useState<Containers>({})
  const [todoCounts, setTodoCounts] = useState<Record<string, { total: number; done: number }>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  const [deletingColumn, setDeletingColumn] = useState<BoardColumn | null>(null)
  const [addingColumn, setAddingColumn] = useState(false)
  const [newColLabel, setNewColLabel] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // -------- Laden --------
  const load = async () => {
    setLoading(true)
    setError(null)
    const [cols, cards, todos] = await Promise.all([
      supabase.from('board_columns').select('*').order('position'),
      supabase.from('board_cards').select('*').order('position'),
      supabase.from('card_todos').select('card_id,is_done'),
    ])
    if (cols.error || cards.error) {
      setError(cols.error?.message || cards.error?.message || 'Fehler beim Laden')
      setLoading(false)
      return
    }
    const colList = (cols.data as BoardColumn[]) ?? []
    const cardList = (cards.data as BoardCard[]) ?? []

    const cm: Record<string, BoardCard> = {}
    const cont: Containers = {}
    colList.forEach((c) => (cont[c.id] = []))
    cardList.forEach((card) => {
      cm[card.id] = card
      ;(cont[card.column_id] ??= []).push(card.id)
    })

    const counts: Record<string, { total: number; done: number }> = {}
    ;((todos.data as { card_id: string; is_done: boolean }[]) ?? []).forEach((t) => {
      const c = (counts[t.card_id] ??= { total: 0, done: 0 })
      c.total++
      if (t.is_done) c.done++
    })

    setColumns(colList)
    setCardMap(cm)
    setContainers(cont)
    setTodoCounts(counts)
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  // Deep-Link von der To-do-Seite: ?card=<id> öffnet das Detail-Panel.
  useEffect(() => {
    const id = searchParams.get('card')
    if (id && cardMap[id]) {
      setOpenCardId(id)
      searchParams.delete('card')
      setSearchParams(searchParams, { replace: true })
    }
  }, [cardMap, searchParams, setSearchParams])

  // To-do-Zähler einer Karte aktualisieren (nach Änderung im Detail-Panel).
  const refreshTodoCounts = async (cardId: string) => {
    const { data } = await supabase.from('card_todos').select('is_done').eq('card_id', cardId)
    const rows = (data as { is_done: boolean }[]) ?? []
    setTodoCounts((prev) => ({
      ...prev,
      [cardId]: { total: rows.length, done: rows.filter((r) => r.is_done).length },
    }))
  }

  // -------- DnD-Helfer --------
  const findContainer = (id: string): string | undefined => {
    if (containers[id]) return id // id ist eine Spalte
    return Object.keys(containers).find((col) => containers[col].includes(id))
  }
  const containerFromOver = (over: DragOverEvent['over']): string | undefined => {
    if (!over) return undefined
    const data = over.data.current
    if (data?.type === 'column') return data.columnId as string
    return findContainer(String(over.id))
  }

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e
    if (!over) return
    if (active.data.current?.type !== 'card') return // Spalten erst im DragEnd

    const activeContainer = findContainer(String(active.id))
    const overContainer = containerFromOver(over)
    if (!activeContainer || !overContainer || activeContainer === overContainer) return

    // Karte in andere Spalte verschieben (optimistisch im State).
    setContainers((prev) => {
      const activeItems = [...prev[activeContainer]]
      const overItems = [...prev[overContainer]]
      const activeIndex = activeItems.indexOf(String(active.id))
      if (activeIndex < 0) return prev
      activeItems.splice(activeIndex, 1)

      let overIndex = overItems.indexOf(String(over.id))
      if (overIndex < 0) overIndex = overItems.length // leere Spalte / Drop-Zone
      overItems.splice(overIndex, 0, String(active.id))

      return { ...prev, [activeContainer]: activeItems, [overContainer]: overItems }
    })
    // column_id direkt aktualisieren, damit das Overlay korrekt bleibt.
    setCardMap((prev) => ({
      ...prev,
      [String(active.id)]: { ...prev[String(active.id)], column_id: overContainer },
    }))
  }

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e
    setActiveId(null)
    if (!over) return

    // -------- Spalten neu ordnen --------
    if (active.data.current?.type === 'column') {
      if (active.id === over.id) return
      const oldIndex = columns.findIndex((c) => c.id === active.id)
      const newIndex = columns.findIndex((c) => c.id === over.id)
      if (oldIndex < 0 || newIndex < 0) return
      const next = arrayMove(columns, oldIndex, newIndex)
      setColumns(next)
      await Promise.all(
        next.map((c, i) => supabase.from('board_columns').update({ position: i }).eq('id', c.id)),
      )
      return
    }

    // -------- Karten neu ordnen / verschieben --------
    const activeContainer = findContainer(String(active.id))
    const overContainer = containerFromOver(over)
    if (!activeContainer || !overContainer) return

    let finalContainers = containers
    if (activeContainer === overContainer) {
      const items = containers[activeContainer]
      const oldIndex = items.indexOf(String(active.id))
      const newIndex = items.indexOf(String(over.id))
      if (oldIndex !== newIndex && newIndex >= 0) {
        const reordered = arrayMove(items, oldIndex, newIndex)
        finalContainers = { ...containers, [activeContainer]: reordered }
        setContainers(finalContainers)
      }
    }

    // Betroffene Spalten persistieren (Position + column_id).
    const affected = new Set([activeContainer, overContainer])
    const updates: PromiseLike<{ error: unknown }>[] = []
    affected.forEach((colId) => {
      finalContainers[colId].forEach((cardId, idx) => {
        updates.push(
          supabase.from('board_cards').update({ position: idx, column_id: colId }).eq('id', cardId),
        )
      })
    })
    const results = await Promise.all(updates)
    if (results.some((r) => r?.error)) toast('Reihenfolge konnte nicht gespeichert werden.', 'error')
  }

  // -------- Spalten-Aktionen --------
  const addColumn = async (e: React.FormEvent) => {
    e.preventDefault()
    const label = newColLabel.trim()
    if (!label) return
    const maxPos = columns.reduce((m, c) => Math.max(m, c.position), -1)
    const { data, error } = await supabase
      .from('board_columns')
      .insert({ label, position: maxPos + 1 })
      .select()
      .single()
    if (error) return toast(error.message, 'error')
    const col = data as BoardColumn
    setColumns((prev) => [...prev, col])
    setContainers((prev) => ({ ...prev, [col.id]: [] }))
    setNewColLabel('')
    setAddingColumn(false)
  }

  const renameColumn = async (columnId: string, label: string) => {
    setColumns((prev) => prev.map((c) => (c.id === columnId ? { ...c, label } : c)))
    const { error } = await supabase.from('board_columns').update({ label }).eq('id', columnId)
    if (error) toast(error.message, 'error')
  }

  const deleteColumn = async () => {
    if (!deletingColumn) return
    const id = deletingColumn.id
    const { error } = await supabase.from('board_columns').delete().eq('id', id)
    if (error) return toast(error.message, 'error')
    setColumns((prev) => prev.filter((c) => c.id !== id))
    setContainers((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setDeletingColumn(null)
    toast('Spalte gelöscht.')
  }

  // -------- Karten-Aktionen --------
  const addCard = async (columnId: string, title: string) => {
    const pos = containers[columnId]?.length ?? 0
    const { data, error } = await supabase
      .from('board_cards')
      .insert({ column_id: columnId, title, position: pos })
      .select()
      .single()
    if (error) return toast(error.message, 'error')
    const card = data as BoardCard
    setCardMap((prev) => ({ ...prev, [card.id]: card }))
    setContainers((prev) => ({ ...prev, [columnId]: [...(prev[columnId] ?? []), card.id] }))
  }

  const onCardSaved = (card: BoardCard) =>
    setCardMap((prev) => ({ ...prev, [card.id]: card }))

  const onCardDeleted = (id: string) => {
    setOpenCardId(null)
    setContainers((prev) => {
      const next: Containers = {}
      for (const k of Object.keys(prev)) next[k] = prev[k].filter((c) => c !== id)
      return next
    })
    setCardMap((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const activeCard = activeId ? cardMap[activeId] : null
  const openCard = openCardId ? cardMap[openCardId] : null
  const openColumnLabel = useMemo(
    () => columns.find((c) => c.id === openCard?.column_id)?.label ?? '',
    [columns, openCard],
  )

  return (
    <div>
      <PageHeader
        title="Board"
        description="Saison- und Projektplanung. Karten per Drag & Drop verschieben."
        actions={
          !addingColumn && (
            <Button variant="secondary" onClick={() => setAddingColumn(true)}>
              <Plus className="h-4 w-4" /> Spalte
            </Button>
          )
        }
      />

      {loading ? (
        <Spinner label="Board wird geladen …" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            <SortableContext items={columns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
              {columns.map((col) => (
                <BoardColumnView
                  key={col.id}
                  column={col}
                  cards={(containers[col.id] ?? []).map((id) => cardMap[id]).filter(Boolean)}
                  profiles={profiles}
                  todoCounts={todoCounts}
                  onAddCard={addCard}
                  onRename={renameColumn}
                  onDelete={setDeletingColumn}
                  onOpenCard={(c) => setOpenCardId(c.id)}
                />
              ))}
            </SortableContext>

            {/* Neue Spalte */}
            {addingColumn ? (
              <form
                onSubmit={addColumn}
                className="flex w-72 shrink-0 flex-col gap-2 rounded-xl border border-dashed border-line-strong bg-sand-50/40 p-3"
              >
                <input
                  autoFocus
                  value={newColLabel}
                  onChange={(e) => setNewColLabel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setAddingColumn(false)}
                  placeholder="Spalten-Name …"
                  className="rounded-lg border border-line-strong bg-surface px-2.5 py-2 text-sm focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200"
                />
                <div className="flex gap-2">
                  <Button type="submit" size="sm">
                    Hinzufügen
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAddingColumn(false)}>
                    Abbrechen
                  </Button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setAddingColumn(true)}
                className="flex h-12 w-72 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong text-sm text-ink-muted transition-colors hover:bg-sand-50 hover:text-ink"
              >
                <Plus className="h-4 w-4" /> Spalte hinzufügen
              </button>
            )}
          </div>

          <DragOverlay>
            {activeCard ? (
              <BoardCardItem
                card={activeCard}
                assigneeName={profiles.find((p) => p.id === activeCard.assignee_id)?.name ?? ''}
                todoCount={todoCounts[activeCard.id]?.total ?? 0}
                todoDone={todoCounts[activeCard.id]?.done ?? 0}
                onClick={() => {}}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {openCard && (
        <CardDetail
          card={openCard}
          columnLabel={openColumnLabel}
          profiles={profiles}
          onClose={() => setOpenCardId(null)}
          onSaved={onCardSaved}
          onDeleted={onCardDeleted}
          onTodosChanged={() => refreshTodoCounts(openCard.id)}
        />
      )}

      <ConfirmDialog
        open={deletingColumn !== null}
        message={`Spalte „${deletingColumn?.label}“ inkl. aller Karten und To-dos löschen?`}
        onConfirm={deleteColumn}
        onClose={() => setDeletingColumn(null)}
      />
    </div>
  )
}
