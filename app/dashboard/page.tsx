"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { TrendingUp, BarChart3, ShieldCheck, Plus, Upload, ArrowUp, ArrowDown } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { formatPL, formatNumber, formatPercent } from "@/lib/utils"
import { loadUserRules } from "@/lib/rules"
import type { UserRule } from "@/lib/rules"
import Link from "next/link"
import "./styles.css"

interface Trade {
  id: string
  ticker: string
  realized_pl: string | null
  entry_price: string | null
  exit_price: string | null
  entry_time: string | null
  exit_time: string | null
  side: string
  size: string
  discipline_score: number | null
  violations: string[] | string | null
  behaviorTags: string[]
  created_at: string
}

function getViolations(trade: Trade): string[] {
  const v = trade.violations
  if (Array.isArray(v)) return v
  if (typeof v === 'string' && v) {
    try {
      const parsed = JSON.parse(v)
      return Array.isArray(parsed) ? parsed : []
    } catch { return [] }
  }
  return []
}

function getPL(trade: Trade): number | null {
  if (trade.realized_pl === null || trade.realized_pl === undefined) return null
  const pl = parseFloat(String(trade.realized_pl))
  return isNaN(pl) ? null : pl
}

interface DashboardStats {
  totalTrades: number
  winRate: number
  totalPL: number
  winningTrades: number
  losingTrades: number
  complianceRate: number | null
  tradesThisWeek: number
  disciplineStreak: number
  hasRules: boolean
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [recentTrades, setRecentTrades] = useState<Trade[]>([])

  useEffect(() => {
    fetchDashboardData()
  }, [])

  async function fetchDashboardData() {
    try {
      setLoading(true)

      const [tradesResult, rules] = await Promise.all([
        supabase
          .from('trades')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100),
        loadUserRules(),
      ])

      const { data: tradesData, error: tradesError } = tradesResult

      if (tradesError) {
        console.error("Error fetching trades:", { message: tradesError.message, code: tradesError.code })
        return
      }

      if (tradesData) {
        const normalizedTrades = tradesData.map(trade => ({
          ...trade,
          behaviorTags: trade.behaviorTags ?? [],
          violations: trade.violations ?? [],
        }))

        setRecentTrades(normalizedTrades.slice(0, 6))
        setStats(calculateDashboardStats(normalizedTrades, rules))
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error)
    } finally {
      setLoading(false)
    }
  }

  function calculateDashboardStats(trades: Trade[], loadedRules: UserRule[]): DashboardStats {
    const hasRules = loadedRules.filter(r => r.enabled).length > 0

    if (trades.length === 0) {
      return {
        totalTrades: 0, winRate: 0, totalPL: 0,
        winningTrades: 0, losingTrades: 0,
        complianceRate: null,
        tradesThisWeek: 0, disciplineStreak: 0, hasRules
      }
    }

    const wins = trades.filter(t => { const pl = getPL(t); return pl !== null && pl > 0 })
    const losses = trades.filter(t => { const pl = getPL(t); return pl !== null && pl < 0 })
    const totalPL = trades.reduce((s, t) => s + (getPL(t) || 0), 0)
    const winRate = (wins.length / trades.length) * 100

    // Compliance: % of trades with no violations (only meaningful if rules exist)
    const compliant = trades.filter(t => getViolations(t).length === 0)
    const complianceRate = hasRules ? (compliant.length / trades.length) * 100 : null

    // Trades this week (calendar week starting Monday)
    const now = new Date()
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    monday.setHours(0, 0, 0, 0)
    const tradesThisWeek = trades.filter(t => new Date(t.created_at) >= monday).length

    // Discipline streak: consecutive most-recent trades with no violations.
    // Requires rules to be set — without rules there's nothing to violate.
    let disciplineStreak = 0
    if (hasRules) {
      for (const trade of trades) { // already sorted newest first
        if (getViolations(trade).length === 0) {
          disciplineStreak++
        } else {
          break
        }
      }
    }

    return {
      totalTrades: trades.length,
      winRate,
      totalPL,
      winningTrades: wins.length,
      losingTrades: losses.length,
      complianceRate,
      tradesThisWeek,
      disciplineStreak,
      hasRules
    }
  }

  const hasTrades = (stats?.totalTrades ?? 0) > 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-text-muted">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold section-title">Dashboard</h1>
        <Link href="/analyze" className="flex items-center gap-2 px-4 py-2 primary-button">
          <Plus className="w-4 h-4" />
          <span>New Trade</span>
        </Link>
      </div>

      {/* Top Stats Row */}
      <div className="stats-row">
        {/* Net P/L */}
        <div className="stat-card">
          <div className="stat-label">Net P&amp;L</div>
          <div className={`stat-value ${hasTrades && stats ? (stats.totalPL >= 0 ? 'text-profit-green' : 'text-loss-red') : ''}`}>
            {hasTrades && stats ? formatPL(stats.totalPL) : "—"}
          </div>
          {hasTrades && stats && (
            <div className="stat-trend">
              {stats.totalPL >= 0
                ? <><ArrowUp className="w-4 h-4" /><span>Total realized P&amp;L</span></>
                : <><ArrowDown className="w-4 h-4" /><span>Total realized P&amp;L</span></>
              }
            </div>
          )}
        </div>

        {/* Discipline Streak */}
        <div className="stat-card stat-card-green">
          <div className="stat-label">Discipline streak</div>
          <div className="stat-value">
            {!hasTrades ? "—"
              : !stats?.hasRules ? "No rules set"
              : `${stats.disciplineStreak} trades`}
          </div>
          {hasTrades && stats?.hasRules && (
            <div className="stat-trend">
              <span className="w-2 h-2 rounded-full bg-accent-green inline-block mr-1" />
              <span>Consecutive clean trades</span>
            </div>
          )}
          {hasTrades && !stats?.hasRules && (
            <div className="stat-trend">
              <Link href="/profile" className="text-xs text-accent-green hover:underline">
                Set up rules →
              </Link>
            </div>
          )}
        </div>

        {/* Total Trades */}
        <div className="stat-card">
          <div className="stat-label">Trades analyzed</div>
          <div className="stat-value">{stats?.totalTrades ? formatNumber(stats.totalTrades) : 0}</div>
          {hasTrades && stats && stats.tradesThisWeek > 0 && (
            <div className="stat-trend">
              <ArrowUp className="w-4 h-4" />
              <span>+{stats.tradesThisWeek} this week</span>
            </div>
          )}
        </div>

        {/* Rule Compliance */}
        <div className="stat-card">
          <div className="stat-label">Rule compliance</div>
          <div className="stat-value">
            {!hasTrades ? "—"
              : stats?.complianceRate !== null && stats?.complianceRate !== undefined
                ? formatPercent(stats.complianceRate, 0)
                : "No rules set"}
          </div>
          {hasTrades && stats?.hasRules && stats.complianceRate !== null && (
            <div className="stat-trend">
              <span>{stats.winningTrades} win / {stats.losingTrades} loss</span>
            </div>
          )}
          {hasTrades && !stats?.hasRules && (
            <div className="stat-trend">
              <Link href="/profile" className="text-xs text-accent-green hover:underline">
                Set up rules to track →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Feature Cards */}
      <div className="feature-cards">
        <div className="feature-card">
          <ShieldCheck className="feature-icon" />
          <div className="feature-title">Your Own Rules</div>
          <div className="feature-description">
            Define your trading rules. Rule compliance and discipline streak are calculated from your actual rules.
          </div>
          <Link href="/profile" className="text-accent-green text-sm hover:underline mt-2 inline-block">
            Set up rules →
          </Link>
        </div>

        <div className="feature-card">
          <BarChart3 className="feature-icon" />
          <div className="feature-title">Journal</div>
          <div className="feature-description">
            Track all your trades with detailed notes and behavioral insights.
          </div>
          <Link href="/journal" className="text-accent-green text-sm hover:underline mt-2 inline-block">
            View journal →
          </Link>
        </div>

        <div className="feature-card">
          <TrendingUp className="feature-icon" />
          <div className="feature-title">Analytics</div>
          <div className="feature-description">
            Analyze your performance, win rate, P&amp;L by week and hour, and behavioral patterns.
          </div>
          <Link href="/analytics" className="text-accent-green text-sm hover:underline mt-2 inline-block">
            View analytics →
          </Link>
        </div>
      </div>

      {/* Trade Upload CTA */}
      <div className="upload-section">
        <h2 className="section-title">Analyze a Trade</h2>
        <p className="upload-text">Upload a screenshot of your trade</p>
        <p className="upload-subtext">Claude extracts the trade data and checks it against your rulebook</p>
        <div className="upload-area">
          <Upload className="w-8 h-8 mx-auto text-text-secondary-new mb-2" />
          <p className="text-text-secondary-new">Drag &amp; drop or click to upload</p>
        </div>
        <div className="button-group">
          <Link href="/analyze" className="primary-button">Analyze My Trade</Link>
        </div>
      </div>

      {/* Recent Trades */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">Recent Trades</h2>
          <Link href="/trades" className="text-sm text-accent-green hover:underline flex items-center gap-1">
            View All Trades →
          </Link>
        </div>

        {recentTrades.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-card-border rounded-lg">
            <p className="text-text-muted">No trades yet.</p>
            <Link href="/analyze" className="text-accent-green text-sm hover:underline mt-2 inline-block">
              Upload your first trade →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentTrades.map((trade) => {
              const pl = getPL(trade)
              const isProfitable = pl !== null && pl > 0
              const entryPrice = trade.entry_price ? parseFloat(trade.entry_price) : null
              const exitPrice = trade.exit_price ? parseFloat(trade.exit_price) : null
              const violations = getViolations(trade)

              return (
                <Card key={trade.id} sentiment={pl !== null ? (isProfitable ? "profit" : "loss") : "neutral"}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="text-lg font-bold text-text-primary-new">{trade.ticker}</div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${trade.side === 'SHORT' ? 'bg-loss-tint text-loss-red' : 'bg-profit-tint text-profit-green'}`}>
                          {trade.side}
                        </span>
                      </div>
                      <div className={`text-lg font-bold tabular-nums ${isProfitable ? 'text-profit-green' : pl !== null ? 'text-loss-red' : 'text-text-muted'}`}>
                        {pl !== null ? formatPL(pl) : "—"}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                      <div>
                        <div className="text-text-muted">Entry</div>
                        <div className="text-text-primary-new font-medium">
                          {entryPrice !== null ? `$${entryPrice.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-text-muted">Exit</div>
                        <div className="text-text-primary-new font-medium">
                          {exitPrice !== null ? `$${exitPrice.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-text-muted">Size</div>
                        <div className="text-text-primary-new font-medium">{trade.size ? formatNumber(parseFloat(trade.size) || 0) : "—"}</div>
                      </div>
                      <div>
                        <div className="text-text-muted">Date</div>
                        <div className="text-text-primary-new font-medium">{new Date(trade.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>

                    {violations.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {violations.slice(0, 2).map((v, i) => (
                          <span key={i} className="px-2 py-1 rounded-full text-[10px] font-medium bg-loss-tint text-loss-red">
                            {v}
                          </span>
                        ))}
                        {violations.length > 2 && (
                          <span className="text-[10px] text-text-muted">+{violations.length - 2} more</span>
                        )}
                      </div>
                    )}

                    {(trade.behaviorTags ?? []).length > 0 && violations.length === 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(trade.behaviorTags ?? []).slice(0, 2).map((tag) => (
                          <span key={tag} className="px-2 py-1 rounded-full text-[10px] font-medium bg-tag-neutral-bg text-tag-neutral-text">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
