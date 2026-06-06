import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import type { Page } from '@/lib/types'

interface PagesContextValue {
  pages: Page[]
  loading: boolean
  reload: () => Promise<void>
}

const PagesContext = createContext<PagesContextValue | null>(null)

/** Hält die Info-Seiten-Liste (für Sidebar + Seiten-Screen synchron). */
export function PagesProvider({ children }: { children: ReactNode }) {
  const [pages, setPages] = useState<Page[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const { data } = await supabase.from('pages').select('*').order('position')
    setPages((data as Page[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return <PagesContext.Provider value={{ pages, loading, reload }}>{children}</PagesContext.Provider>
}

export function usePages(): PagesContextValue {
  const ctx = useContext(PagesContext)
  if (!ctx) throw new Error('usePages muss innerhalb von <PagesProvider> verwendet werden')
  return ctx
}
