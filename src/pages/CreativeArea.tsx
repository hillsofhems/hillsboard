import { useEffect, useMemo, useState } from 'react'
import { Sparkles, Lightbulb, Trash2, Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Idea, IdeaReaction } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import { useProfiles } from '@/hooks/useProfiles'
import { PageHeader } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner, EmptyState, ErrorState } from '@/components/ui/States'
import { cn, timeAgo } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

// Weiche, warme Bubble-Farben (Hintergrund + Border). Pro Bubble fix über die ID.
const BUBBLE_COLORS = [
  'bg-sage-50 border-sage-200',
  'bg-terracotta-50 border-terracotta-200',
  'bg-amber-50 border-amber-200',
  'bg-blue-50 border-blue-200',
  'bg-rose-50 border-rose-200',
  'bg-sand-100 border-sand-300',
]
function bubbleColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return BUBBLE_COLORS[h % BUBBLE_COLORS.length]
}

/**
 * Creative Area – interaktives Brainstorming. Jede:r wirft Ideen in „Bubbles".
 * Der Name wird automatisch (klein) dazugeschrieben; man muss ihn nie eintippen.
 */
export function CreativeArea() {
  const { toast } = useToast()
  const { profile } = useAuth()
  const meId = profile?.id
  const isAdmin = profile?.is_admin
  const { nameOf } = useProfiles()

  const [ideas, setIdeas] = useState<Idea[]>([])
  const [reactions, setReactions] = useState<IdeaReaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newBubble, setNewBubble] = useState('')
  const [posting, setPosting] = useState(false)

  const load = () => {
    setLoading(true)
    setError(null)
    Promise.all([
      supabase.from('ideas').select('*').order('created_at', { ascending: true }),
      supabase.from('idea_reactions').select('*'),
    ]).then(([i, r]) => {
      if (i.error) setError(i.error.message)
      setIdeas((i.data as Idea[]) ?? [])
      setReactions((r.data as IdeaReaction[]) ?? [])
      setLoading(false)
    })
  }
  useEffect(load, [])

  // Top-Level-Bubbles (neueste zuerst) + Ideen je Bubble (älteste zuerst).
  const bubbles = useMemo(
    () =>
      ideas
        .filter((i) => !i.parent_id)
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    [ideas],
  )
  const childrenOf = (bubbleId: string) =>
    ideas
      .filter((i) => i.parent_id === bubbleId)
      .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))

  const reactionsOf = (ideaId: string) => reactions.filter((r) => r.idea_id === ideaId)
  const iReacted = (ideaId: string) => reactions.some((r) => r.idea_id === ideaId && r.user_id === meId)

  // -------- Aktionen --------
  const addIdea = async (content: string, parentId: string | null) => {
    const text = content.trim()
    if (!text || !meId) return null
    const { data, error } = await supabase
      .from('ideas')
      .insert({ content: text, parent_id: parentId, author_id: meId })
      .select()
      .single()
    if (error) {
      toast(error.message, 'error')
      return null
    }
    setIdeas((prev) => [...prev, data as Idea])
    return data as Idea
  }

  const postBubble = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBubble.trim()) return
    setPosting(true)
    const created = await addIdea(newBubble, null)
    if (created) setNewBubble('')
    setPosting(false)
  }

  const deleteIdea = async (id: string) => {
    // Lokal inkl. Kinder entfernen
    setIdeas((prev) => prev.filter((i) => i.id !== id && i.parent_id !== id))
    const { error } = await supabase.from('ideas').delete().eq('id', id)
    if (error) {
      toast(error.message, 'error')
      load()
    }
  }

  const toggleReaction = async (ideaId: string) => {
    if (!meId) return
    if (iReacted(ideaId)) {
      setReactions((prev) => prev.filter((r) => !(r.idea_id === ideaId && r.user_id === meId)))
      await supabase.from('idea_reactions').delete().eq('idea_id', ideaId).eq('user_id', meId)
    } else {
      setReactions((prev) => [...prev, { idea_id: ideaId, user_id: meId }])
      await supabase.from('idea_reactions').insert({ idea_id: ideaId, user_id: meId })
    }
  }

  const canDelete = (idea: Idea) => idea.author_id === meId || isAdmin

  return (
    <div>
      <PageHeader
        title="Creative Area"
        description="Wirf Ideen rein – ganz frei. Dein Name wird automatisch klein dazugeschrieben."
      />

      {/* Composer: neue Bubble starten */}
      <form
        onSubmit={postBubble}
        className="mb-6 overflow-hidden rounded-2xl border border-sage-200 bg-gradient-to-br from-sage-50 to-sand-50 p-4 sm:p-5"
      >
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-soft">
          <Sparkles className="h-4 w-4 text-sage-600" />
          Neue Bubble starten
        </div>
        <textarea
          value={newBubble}
          onChange={(e) => setNewBubble(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) postBubble(e)
          }}
          placeholder="Worum geht's? Ein Thema oder eine spontane Idee …"
          rows={2}
          className="w-full resize-none rounded-xl border border-line-strong bg-surface/80 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-2xs text-ink-faint">Tipp: ⌘/Strg + Enter zum Posten</span>
          <Button type="submit" loading={posting} disabled={!newBubble.trim()}>
            <Sparkles className="h-4 w-4" /> Bubble posten
          </Button>
        </div>
      </form>

      {loading ? (
        <Spinner label="Ideen werden geladen …" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : bubbles.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="Noch keine Ideen"
          description="Starte die erste Bubble – egal wie wild. Hier ist alles erlaubt."
        />
      ) : (
        // Masonry-artiges Layout: Bubbles unterschiedlicher Höhe packen sauber.
        <div className="gap-4 [column-fill:_balance] sm:columns-2 lg:columns-3">
          {bubbles.map((bubble) => (
            <BubbleCard
              key={bubble.id}
              bubble={bubble}
              children={childrenOf(bubble.id)}
              reactionCount={reactionsOf(bubble.id).length}
              reacted={iReacted(bubble.id)}
              nameOf={nameOf}
              canDelete={canDelete}
              onReact={() => toggleReaction(bubble.id)}
              onAddIdea={(text) => addIdea(text, bubble.id)}
              onDelete={deleteIdea}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Eine Bubble = Thema + Ideen dazu
// ---------------------------------------------------------------------------
function BubbleCard({
  bubble,
  children,
  reactionCount,
  reacted,
  nameOf,
  canDelete,
  onReact,
  onAddIdea,
  onDelete,
}: {
  bubble: Idea
  children: Idea[]
  reactionCount: number
  reacted: boolean
  nameOf: (id: string | null | undefined) => string
  canDelete: (idea: Idea) => boolean | undefined
  onReact: () => void
  onAddIdea: (text: string) => Promise<Idea | null>
  onDelete: (id: string) => void
}) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft.trim()) return
    setSending(true)
    const created = await onAddIdea(draft)
    if (created) setDraft('')
    setSending(false)
  }

  return (
    <div
      className={cn(
        'group mb-4 break-inside-avoid rounded-2xl border p-4 shadow-card transition-shadow hover:shadow-pop',
        bubbleColor(bubble.id),
      )}
    >
      {/* Bubble-Thema */}
      <div className="flex items-start justify-between gap-2">
        <p className="whitespace-pre-wrap text-[15px] font-medium leading-snug text-ink">
          {bubble.content}
        </p>
        {canDelete(bubble) && (
          <button
            onClick={() => onDelete(bubble.id)}
            className="shrink-0 cursor-pointer rounded p-1 text-ink-faint opacity-0 transition-opacity hover:text-terracotta-600 group-hover:opacity-100"
            aria-label="Bubble löschen"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Autor + Zeit + Reaktion */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <Author authorId={bubble.author_id} createdAt={bubble.created_at} nameOf={nameOf} />
        <button
          onClick={onReact}
          className={cn(
            'inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors',
            reacted
              ? 'border-amber-300 bg-amber-100 text-amber-700'
              : 'border-line bg-surface/70 text-ink-muted hover:bg-surface',
          )}
          title="Gefällt mir"
        >
          <Lightbulb className={cn('h-3.5 w-3.5', reacted && 'fill-amber-400')} />
          {reactionCount > 0 && reactionCount}
        </button>
      </div>

      {/* Ideen dazu */}
      {children.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-line/70 pt-3">
          {children.map((child) => (
            <li key={child.id} className="group/idea rounded-lg bg-surface/70 px-2.5 py-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="whitespace-pre-wrap text-sm text-ink-soft">{child.content}</p>
                {canDelete(child) && (
                  <button
                    onClick={() => onDelete(child.id)}
                    className="shrink-0 cursor-pointer rounded p-0.5 text-ink-faint opacity-0 transition-opacity hover:text-terracotta-600 group-hover/idea:opacity-100"
                    aria-label="Idee löschen"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
              <Author
                authorId={child.author_id}
                createdAt={child.created_at}
                nameOf={nameOf}
                small
              />
            </li>
          ))}
        </ul>
      )}

      {/* Idee dazu schreiben */}
      <form onSubmit={submit} className="mt-3 flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Idee dazu …"
          className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface/80 px-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-200"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-sage-500 text-white transition-colors hover:bg-sage-600 disabled:opacity-50"
          aria-label="Idee hinzufügen"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}

/** Kleiner Autor-Hinweis (Avatar + Name + Zeit) – automatisch, nicht eingetippt. */
function Author({
  authorId,
  createdAt,
  nameOf,
  small,
}: {
  authorId: string | null
  createdAt: string
  nameOf: (id: string | null | undefined) => string
  small?: boolean
}) {
  const name = nameOf(authorId) || 'Team'
  return (
    <div className={cn('mt-1 flex items-center gap-1.5 text-ink-faint', small ? 'text-2xs' : 'text-xs')}>
      <Avatar name={name} size="xs" className={small ? 'h-4 w-4 text-[9px]' : 'h-5 w-5 text-[10px]'} />
      <span className="font-medium text-ink-muted">{name}</span>
      <span>· {timeAgo(createdAt)}</span>
    </div>
  )
}
