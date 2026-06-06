import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { PagesProvider } from '@/context/PagesContext'

/** App-Grundgerüst: Sidebar links, Topbar oben, Inhalt über <Outlet />. */
export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <PagesProvider>
      <div className="min-h-screen bg-paper">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        {/* lg: Inhalt rückt um Sidebar-Breite ein */}
        <div className="lg:pl-64">
          <Topbar onMenu={() => setSidebarOpen(true)} />
          <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </PagesProvider>
  )
}

/** Wiederverwendbarer Seiten-Header (Titel + Beschreibung + Aktionen). */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
