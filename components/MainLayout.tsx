"use client"

import { Sidebar } from "./Sidebar"
import { usePathname } from "next/navigation"

export function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Check if current route should hide sidebar (like login, auth pages)
  const hideSidebar = pathname === '/login' || pathname === '/forgot-password' || pathname === '/reset-password' || pathname === '/onboarding'

  return (
    <div className="flex h-screen overflow-hidden">
      {!hideSidebar && (
        <div className="flex-shrink-0">
          <Sidebar />
        </div>
      )}

      <main className={`flex-1 overflow-auto ${hideSidebar ? '' : 'p-6'}`}>
        {children}
      </main>
    </div>
  )
}