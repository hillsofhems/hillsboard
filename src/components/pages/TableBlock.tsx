import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { TableBlockContent } from '@/lib/types'
import { Button } from '@/components/ui/Button'

/**
 * Inline editierbarer Tabellen-Block: Spalten/Zeilen hinzufügen, bearbeiten,
 * löschen. Änderungen werden über onSave (beim Verlassen einer Zelle) gemeldet.
 */
export function TableBlock({
  content,
  onSave,
}: {
  content: TableBlockContent
  onSave: (content: TableBlockContent) => void
}) {
  const [columns, setColumns] = useState<string[]>(
    content.columns?.length ? content.columns : ['Spalte 1', 'Spalte 2'],
  )
  const [rows, setRows] = useState<string[][]>(content.rows?.length ? content.rows : [['', '']])

  const commit = (cols: string[], rws: string[][]) => {
    setColumns(cols)
    setRows(rws)
    onSave({ columns: cols, rows: rws })
  }

  const setHeader = (i: number, value: string) => {
    const cols = [...columns]
    cols[i] = value
    commit(cols, rows)
  }
  const setCell = (r: number, c: number, value: string) => {
    const rws = rows.map((row) => [...row])
    rws[r][c] = value
    commit(columns, rws)
  }
  const addColumn = () =>
    commit([...columns, `Spalte ${columns.length + 1}`], rows.map((r) => [...r, '']))
  const removeColumn = (i: number) => {
    if (columns.length <= 1) return
    commit(
      columns.filter((_, idx) => idx !== i),
      rows.map((r) => r.filter((_, idx) => idx !== i)),
    )
  }
  const addRow = () => commit(columns, [...rows, columns.map(() => '')])
  const removeRow = (i: number) => commit(columns, rows.filter((_, idx) => idx !== i))

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-sand-50">
            {columns.map((col, i) => (
              <th key={i} className="group relative border-b border-r border-line px-2 py-1.5 last:border-r-0">
                <input
                  value={col}
                  onChange={(e) => setHeader(i, e.target.value)}
                  className="w-full min-w-[80px] bg-transparent font-semibold text-ink focus:outline-none"
                  aria-label={`Spaltenkopf ${i + 1}`}
                />
                {columns.length > 1 && (
                  <button
                    onClick={() => removeColumn(i)}
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-ink-faint opacity-0 hover:text-terracotta-600 group-hover:opacity-100"
                    aria-label="Spalte löschen"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </th>
            ))}
            <th className="w-8 border-b border-line px-1">
              <button
                onClick={addColumn}
                className="cursor-pointer rounded p-1 text-ink-faint hover:bg-sand-200 hover:text-ink"
                aria-label="Spalte hinzufügen"
                title="Spalte hinzufügen"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="group/row hover:bg-sand-50/50">
              {row.map((cell, c) => (
                <td key={c} className="border-b border-r border-line px-2 py-1 last:border-r-0">
                  <input
                    value={cell}
                    onChange={(e) => setCell(r, c, e.target.value)}
                    className="w-full min-w-[80px] bg-transparent text-ink-soft focus:outline-none"
                    aria-label={`Zelle ${r + 1}/${c + 1}`}
                  />
                </td>
              ))}
              <td className="border-b border-line px-1 text-center">
                <button
                  onClick={() => removeRow(r)}
                  className="cursor-pointer rounded p-1 text-ink-faint opacity-0 hover:text-terracotta-600 group-hover/row:opacity-100"
                  aria-label="Zeile löschen"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-line p-1.5">
        <Button size="sm" variant="ghost" onClick={addRow}>
          <Plus className="h-3.5 w-3.5" /> Zeile
        </Button>
      </div>
    </div>
  )
}
