import { useState, useRef, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import type { BoardCard, BoardColumn, BoardKey, Profile } from '@/lib/types'
import { BoardCardItem } from './BoardCardItem'
import { cn } from '@/lib/utils'

interface TodoCounts {
  [cardId: string]: { total: number; done: number }
}

interface Props {
  column: BoardColumn
  board: BoardKey
  cards: BoardCard[]
  profiles: Profile[]
  todoCounts: TodoCounts
  onAddCard: (columnId: string, title: string) => void
  onRename: (columnId: string, label: string) => void
  onDelete: (column: BoardColumn) => void
  onOpenCard: (card: BoardCard) => void
}

/** Eine sortierbare Kanban-Spalte mit Karten-Drop-Zone und Inline-Aktionen. */
export function BoardColumnView({
  column,
  board,
  cards,
  profiles,
  todoCounts,
  onAddCard,
  onRename,
  onDelete,
  onOpenCard,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: { type: 'column' },
  })
  // Separate Droppable, damit auch in leere Spalten gezogen werden kann.
  const { setNodeRef: setDropRef } = useDroppable({
    id: `col-drop-${column.id}`,
    data: { type: 'column', columnId: column.id },
  })

  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [labelDraft, setLabelDraft] = useState(column.label)
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const style = { transform: CSS.Transform.toString(transform), transition }

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    onAddCard(column.id, title)
    setNewTitle('')
  }

  const submitRename = () => {
    const label = labelDraft.trim()
    if (label && label !== column.label) onRename(column.id, label)
    else setLabelDraft(column.label)
    setRenaming(false)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-xl border border-line bg-sand-50/60',
        isDragging && 'opacity-60',
      )}
    >
      {/* Spalten-Kopf */}
      <div className="flex items-center gap-1 px-3 py-2.5">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab rounded p-0.5 text-ink-faint hover:text-ink-muted active:cursor-grabbing"
          aria-label="Spalte verschieben"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {renaming ? (
          <input
            autoFocus
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitRename()
              if (e.key === 'Escape') {
                setLabelDraft(column.label)
                setRenaming(false)
              }
            }}
            className="min-w-0 flex-1 rounded border border-sage-300 bg-surface px-2 py-0.5 text-sm font-semibold text-ink focus:outline-none"
          />
        ) : (
          <h2 className="flex-1 truncate text-sm font-semibold text-ink">{column.label}</h2>
        )}

        <span className="rounded-full bg-sand-200 px-2 py-0.5 text-xs text-ink-muted">
          {cards.length}
        </span>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="cursor-pointer rounded p-1 text-ink-faint hover:bg-sand-200 hover:text-ink"
            aria-label="Spalten-Menü"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-lg border border-line bg-surface shadow-pop">
              <button
                onClick={() => {
                  setRenaming(true)
                  setMenuOpen(false)
                }}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-ink-soft hover:bg-sand-100"
              >
                <Pencil className="h-3.5 w-3.5" /> Umbenennen
              </button>
              <button
                onClick={() => {
                  onDelete(column)
                  setMenuOpen(false)
                }}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-terracotta-600 hover:bg-terracotta-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Löschen
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Karten */}
      <div ref={setDropRef} className="flex-1 space-y-2 overflow-y-auto px-2 pb-2 min-h-[60px]">
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => {
            const counts = todoCounts[card.id] ?? { total: 0, done: 0 }
            const assigneeName = profiles.find((p) => p.id === card.assignee_id)?.name ?? ''
            return (
              <BoardCardItem
                key={card.id}
                card={card}
                board={board}
                assigneeName={assigneeName}
                todoCount={counts.total}
                todoDone={counts.done}
                onClick={() => onOpenCard(card)}
              />
            )
          })}
        </SortableContext>

        {cards.length === 0 && (
          <div className="rounded-lg border border-dashed border-line-strong py-6 text-center text-xs text-ink-faint">
            Karten hierher ziehen
          </div>
        )}
      </div>

      {/* Karte hinzufügen */}
      <div className="p-2">
        {adding ? (
          <form onSubmit={submitAdd}>
            <textarea
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submitAdd(e)
                }
                if (e.key === 'Escape') {
                  setAdding(false)
                  setNewTitle('')
                }
              }}
              placeholder="Karten-Titel …"
              rows={2}
              className="w-full resize-none rounded-lg border border-line-strong bg-surface px-2.5 py-2 text-sm focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200"
            />
            <div className="mt-1.5 flex items-center gap-2">
              <button
                type="submit"
                className="cursor-pointer rounded-md bg-sage-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sage-600"
              >
                Hinzufügen
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false)
                  setNewTitle('')
                }}
                className="cursor-pointer rounded-md px-2 py-1.5 text-sm text-ink-muted hover:bg-sand-100"
              >
                Abbrechen
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-ink-muted transition-colors hover:bg-sand-100 hover:text-ink"
          >
            <Plus className="h-4 w-4" /> Karte hinzufügen
          </button>
        )}
      </div>
    </div>
  )
}
