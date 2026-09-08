"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, BarChart3, FileText, BookOpen, TrendingUp, Play, User, GraduationCap, Menu, Plus } from "lucide-react"
import { Button } from "./ui/button"
import { useState } from "react"

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Analyze", href: "/analyze", icon: BarChart3 },
  { name: "Trades", href: "/trades", icon: FileText },
  { name: "Journal", href: "/journal", icon: BookOpen },
  { name: "Analytics", href: "/analytics", icon: TrendingUp },
  { name: "Replay", href: "/replay", icon: Play },
  { name: "Firm", href: "/firm", icon: GraduationCap },
  { name: "Create Organization", href: "/firm/new", icon: Plus },
  { name: "Profile", href: "/profile", icon: User },
  { name: "Home", href: "/", icon: Home },
]

export function Sidebar() {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Check if user has coach role (placeholder - implement actual role check)
  const hasCoachRole = false // Replace with actual role check

  const toggleSidebar = () => setIsCollapsed(!isCollapsed)

  return (
    <div className={`flex flex-col h-full bg-card-bg border-r border-card-border transition-all duration-200 ${isCollapsed ? 'w-16' : 'w-60'}`}>
      {/* Logo and toggle */}
      <div className="flex items-center justify-between p-4 border-b border-card-border">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-accent rounded-sm flex items-center justify-center">
              <span className="text-white font-bold text-sm">B</span>
            </div>
            <span className="font-semibold text-text-primary">Baywater</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8"
          onClick={toggleSidebar}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Menu className="w-4 h-4 text-text-muted" />
        </Button>
      </div>

      {/* New Trade Button - Primary CTA */}
      <div className="p-4">
        <Link href="/analyze" className="block">
          <Button className="w-full bg-accent hover:bg-accent/90 text-white font-medium py-2 px-4 rounded-lg transition-colors">
            <Plus className="w-4 h-4 mr-2" />
            {!isCollapsed && "New Trade"}
          </Button>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/firm"
                ? pathname === "/firm" || pathname.startsWith("/firm/")
                : pathname === item.href
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${isActive ? 'bg-accent-tint text-accent' : 'text-text-secondary hover:text-text-primary hover:bg-neutral-fill'}`}
                >
                  <item.icon className={`w-5 h-5 ${isActive ? 'text-accent' : 'text-text-muted'}`} />
                  {!isCollapsed && item.name}
                  {isActive && !isCollapsed && (
                    <div className="ml-auto w-1 h-6 bg-accent rounded-full" />
                  )}
                </Link>
              </li>
            )
          })}

          {/* Legacy placeholder link to student AI-coach page — kept separate from Firm */}
          {hasCoachRole && (
            <li>
              <Link
                href="/coach"
                className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${pathname === '/coach' ? 'bg-accent-tint text-accent' : 'text-text-secondary hover:text-text-primary hover:bg-neutral-fill'}`}
              >
                <GraduationCap className={`w-5 h-5 ${pathname === '/coach' ? 'text-accent' : 'text-text-muted'}`} />
                {!isCollapsed && "AI Coach"}
                {pathname === '/coach' && !isCollapsed && (
                  <div className="ml-auto w-1 h-6 bg-accent rounded-full" />
                )}
              </Link>
            </li>
          )}
        </ul>
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-card-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-neutral-fill rounded-full flex items-center justify-center text-sm font-medium text-text-primary">
            IU
          </div>
          {!isCollapsed && (
            <div className="flex-1">
              <div className="text-sm font-medium text-text-primary">User Name</div>
              <div className="text-xs text-text-muted">Trader</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}