import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/types'

/** Lädt alle Team-Profile (für Verantwortlichen-/Teilnehmer-Auswahl). */
export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase
      .from('profiles')
      .select('*')
      .order('name')
      .then(({ data }) => {
        if (!active) return
        setProfiles((data as Profile[]) ?? [])
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  /** Bequemer Namens-Lookup nach Profil-ID. */
  const nameOf = (id: string | null | undefined) =>
    profiles.find((p) => p.id === id)?.name || ''

  return { profiles, loading, nameOf }
}
