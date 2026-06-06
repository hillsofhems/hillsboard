import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { usePages } from '@/context/PagesContext'
import { Spinner } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'

/** Legt eine neue Info-Seite an und navigiert direkt in sie hinein. */
export function NewPageRedirect() {
  const navigate = useNavigate()
  const { pages, reload } = usePages()
  const { toast } = useToast()
  const created = useRef(false)

  useEffect(() => {
    if (created.current) return
    created.current = true
    const maxPos = pages.reduce((m, p) => Math.max(m, p.position), -1)
    supabase
      .from('pages')
      .insert({ title: 'Neue Seite', position: maxPos + 1 })
      .select()
      .single()
      .then(async ({ data, error }) => {
        if (error || !data) {
          toast(error?.message ?? 'Seite konnte nicht erstellt werden.', 'error')
          navigate('/board', { replace: true })
          return
        }
        await reload()
        navigate(`/pages/${data.id}`, { replace: true })
      })
  }, [pages, reload, navigate, toast])

  return <Spinner label="Seite wird erstellt …" />
}
