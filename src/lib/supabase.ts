import { createClient } from '@supabase/supabase-js'

// Supabase-Client. Liest die öffentlichen ENV-Variablen (nur anon-Key!).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Frühe, klare Fehlermeldung statt kryptischer Folgefehler, falls ENV fehlt.
if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    '[Hills Hub] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY fehlen. ' +
      'Bitte .env aus .env.example anlegen (siehe README).',
  )
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// Praktisch für manuelle RLS-Tests in der Browser-Konsole (siehe README).
if (typeof window !== 'undefined') {
  // @ts-expect-error – bewusst global für Debug/RLS-Tests
  window.supabase = supabase
}

/** True, wenn beide ENV-Variablen gesetzt sind (für Setup-Hinweis im UI). */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
