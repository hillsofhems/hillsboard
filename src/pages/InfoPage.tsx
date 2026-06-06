import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Type, Table as TableIcon, Trash2, ChevronUp, ChevronDown, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Page, PageBlock, TextBlockContent, TableBlockContent } from '@/lib/types'
import { usePages } from '@/context/PagesContext'
import { Button } from '@/components/ui/Button'
import { RichTextEditor } from '@/components/ui/RichText'
import { TableBlock } from '@/components/pages/TableBlock'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Spinner, EmptyState, ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'

/** Info-Seite: bearbeitbarer Titel + Text-/Tabellen-Blöcke. */
export function InfoPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { reload } = usePages()

  const [page, setPage] = useState<Page | null>(null)
  const [blocks, setBlocks] = useState<PageBlock[]>([])
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletePage, setDeletePage] = useState(false)
  // Lokaler Text-Entwurf je Block-ID (wird beim Verlassen gespeichert).
  const [textDrafts, setTextDrafts] = useState<Record<string, string>>({})

  const load = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    const [p, b] = await Promise.all([
      supabase.from('pages').select('*').eq('id', id).maybeSingle(),
      supabase.from('page_blocks').select('*').eq('page_id', id).order('position'),
    ])
    if (p.error) setError(p.error.message)
    const pg = p.data as Page | null
    setPage(pg)
    setTitle(pg?.title ?? '')
    const bl = (b.data as PageBlock[]) ?? []
    setBlocks(bl)
    const drafts: Record<string, string> = {}
    bl.forEach((blk) => {
      if (blk.type === 'text') drafts[blk.id] = (blk.content as TextBlockContent).html ?? ''
    })
    setTextDrafts(drafts)
    setLoading(false)
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const saveTitle = async () => {
    if (!page || title.trim() === page.title) return
    const newTitle = title.trim() || 'Unbenannte Seite'
    setTitle(newTitle)
    const { error } = await supabase.from('pages').update({ title: newTitle }).eq('id', page.id)
    if (error) toast(error.message, 'error')
    else {
      setPage({ ...page, title: newTitle })
      reload()
    }
  }

  const addBlock = async (type: 'text' | 'table') => {
    if (!id) return
    const content =
      type === 'text'
        ? { html: '' }
        : { columns: ['Spalte 1', 'Spalte 2'], rows: [['', '']] }
    const pos = blocks.reduce((m, b) => Math.max(m, b.position), -1) + 1
    const { data, error } = await supabase
      .from('page_blocks')
      .insert({ page_id: id, type, content, position: pos })
      .select()
      .single()
    if (error) return toast(error.message, 'error')
    const block = data as PageBlock
    setBlocks((prev) => [...prev, block])
    if (type === 'text') setTextDrafts((prev) => ({ ...prev, [block.id]: '' }))
  }

  const saveBlock = async (blockId: string, content: TextBlockContent | TableBlockContent) => {
    setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, content } : b)))
    const { error } = await supabase.from('page_blocks').update({ content }).eq('id', blockId)
    if (error) toast(error.message, 'error')
  }

  const deleteBlock = async (blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId))
    const { error } = await supabase.from('page_blocks').delete().eq('id', blockId)
    if (error) toast(error.message, 'error')
  }

  const moveBlock = async (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= blocks.length) return
    const reordered = [...blocks]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    setBlocks(reordered)
    // Positionen der beiden betroffenen Blöcke tauschen.
    await Promise.all(
      reordered.map((b, i) => supabase.from('page_blocks').update({ position: i }).eq('id', b.id)),
    )
  }

  const removePage = async () => {
    if (!page) return
    const { error } = await supabase.from('pages').delete().eq('id', page.id)
    if (error) return toast(error.message, 'error')
    toast('Seite gelöscht.')
    await reload()
    navigate('/board', { replace: true })
  }

  if (loading) return <Spinner label="Seite wird geladen …" />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!page)
    return (
      <EmptyState
        icon={FileText}
        title="Seite nicht gefunden"
        description="Diese Seite existiert nicht (mehr)."
        action={<Button onClick={() => navigate('/board')}>Zurück</Button>}
      />
    )

  return (
    <div className="mx-auto max-w-3xl">
      {/* Titel (inline editierbar) */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          placeholder="Seitentitel …"
          className="w-full bg-transparent font-serif text-3xl font-semibold text-ink placeholder:text-ink-faint focus:outline-none"
          aria-label="Seitentitel"
        />
        <Button
          variant="ghost"
          size="icon"
          className="mt-2 shrink-0 text-terracotta-600 hover:bg-terracotta-50"
          onClick={() => setDeletePage(true)}
          aria-label="Seite löschen"
          title="Seite löschen"
        >
          <Trash2 className="h-5 w-5" />
        </Button>
      </div>

      {blocks.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Leere Seite"
          description="Füge einen Text- oder Tabellen-Block hinzu."
        />
      ) : (
        <div className="space-y-4">
          {blocks.map((block, index) => (
            <div key={block.id} className="group relative">
              {/* Block-Aktionen */}
              <div className="absolute -left-9 top-1 hidden flex-col gap-0.5 group-hover:flex lg:flex">
                <button
                  onClick={() => moveBlock(index, -1)}
                  disabled={index === 0}
                  className="cursor-pointer rounded p-1 text-ink-faint hover:bg-sand-100 hover:text-ink disabled:opacity-30"
                  aria-label="Nach oben"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  onClick={() => moveBlock(index, 1)}
                  disabled={index === blocks.length - 1}
                  className="cursor-pointer rounded p-1 text-ink-faint hover:bg-sand-100 hover:text-ink disabled:opacity-30"
                  aria-label="Nach unten"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>

              <button
                onClick={() => deleteBlock(block.id)}
                className="absolute -right-2 -top-2 z-10 hidden cursor-pointer rounded-full border border-line bg-surface p-1 text-ink-faint shadow-card hover:text-terracotta-600 group-hover:block"
                aria-label="Block löschen"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>

              {block.type === 'text' ? (
                <RichTextEditor
                  value={textDrafts[block.id] ?? ''}
                  onChange={(html) => setTextDrafts((prev) => ({ ...prev, [block.id]: html }))}
                  onBlur={() => saveBlock(block.id, { html: textDrafts[block.id] ?? '' })}
                  placeholder="Text eingeben …"
                />
              ) : (
                <TableBlock
                  content={block.content as TableBlockContent}
                  onSave={(content) => saveBlock(block.id, content)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Block hinzufügen */}
      <div className="mt-6 flex gap-2 border-t border-line pt-5">
        <Button variant="secondary" size="sm" onClick={() => addBlock('text')}>
          <Type className="h-4 w-4" /> Text
        </Button>
        <Button variant="secondary" size="sm" onClick={() => addBlock('table')}>
          <TableIcon className="h-4 w-4" /> Tabelle
        </Button>
      </div>

      <ConfirmDialog
        open={deletePage}
        title="Seite löschen?"
        message={`Seite „${page.title}“ inkl. aller Blöcke löschen?`}
        onConfirm={removePage}
        onClose={() => setDeletePage(false)}
      />
    </div>
  )
}
