import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CheckSquare } from 'lucide-react'
import type { BoardCard } from '@/lib/types'
import { Avatar } from '@/components/ui/Avatar'
import { LABEL_COLORS, boardLabelName, cn } from '@/lib/utils'

interface Props {
  card: BoardCard
  assigneeName: string
  todoCount: number
  todoDone: number
  onClick: () => void
}

/** Einzelne Kanban-Karte – sortierbar (dnd-kit) und klickbar (öffnet Detail). */
export function BoardCardItem({ card, assigneeName, todoCount, todoDone, onClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', columnId: card.column_id },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const labelColor = card.label_color

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        'group cursor-grab rounded-lg border border-line bg-surface p-3 shadow-card transition-shadow active:cursor-grabbing',
        'hover:border-line-strong hover:shadow-pop',
        isDragging && 'opacity-50',
      )}
    >
      {labelColor && (
        <span
          className={cn(
            'mb-2 inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium',
            LABEL_COLORS[labelColor].chip,
          )}
        >
          {boardLabelName(labelColor)}
        </span>
      )}

      <p className="text-sm font-medium leading-snug text-ink">{card.title}</p>

      {card.description && (
        <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{card.description}</p>
      )}

      {(todoCount > 0 || assigneeName) && (
        <div className="mt-2.5 flex items-center justify-between">
          {todoCount > 0 ? (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs',
                todoDone === todoCount ? 'text-sage-600' : 'text-ink-muted',
              )}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {todoDone}/{todoCount}
            </span>
          ) : (
            <span />
          )}
          {assigneeName && <Avatar name={assigneeName} size="xs" />}
        </div>
      )}
    </div>
  )
}
