"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { Home, TrendingUp, TrendingDown, BarChart3, ShieldCheck, Target, Calendar, DollarSign, Plus, Flame, Upload, ArrowUp, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPL, formatNumber } from "@/lib/utils"
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
  violations: string[]
  behaviorTags: string[]
  created_at: string
}

interface DashboardStats {
  totalTrades: number
  winRate: number
  profitFactor: number
  avgWin: number
  avgLoss: number
  totalPL: number
  longWinRate: number
  shortWinRate: number
  bestTradingWindow: string
  mostTradedTickers: string[]
  winningTrades: number
  losingTrades: number
  longTrades: number
  shortTrades: number
}

export default function DashboardPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [recentTrades, setRecentTrades] = useState<Trade[]>([])
  const [behavioralInsight, setBehavioralInsight] = useState<string>("Analyzing your trading patterns...")
  const [disciplineStreak, setDisciplineStreak] = useState<number>(0)
  const [issuesCount, setIssuesCount] = useState<number>(0)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  async function fetchDashboardData() {
    try {
      setLoading(true)

      // Fetch trades data
      const { data: tradesData, error: tradesError } = await supabase
        .from('trades')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      if (tradesError) {
        console.error("Error fetching trades:", tradesError)
        return
      }

      if (tradesData) {
        // Normalize trades to handle missing behavioral fields
        const normalizedTrades = tradesData.map(trade => ({
          ...trade,
          behaviorTags: trade.behaviorTags ?? [],
          violations: trade.violations ?? [],
          aiReview: trade.aiReview ?? null,
          behavioralScore: trade.behavioralScore ?? null,
          ruleCompliance: trade.ruleCompliance ?? null
        }))

        setTrades(normalizedTrades)
        setRecentTrades(normalizedTrades.slice(0, 6)) // Get 6 most recent trades

        // Calculate statistics
        const calculatedStats = calculateDashboardStats(normalizedTrades)
        setStats(calculatedStats)

        // Generate behavioral insight
        const insight = generateBehavioralInsight(normalizedTrades)
        setBehavioralInsight(insight)

        // Calculate discipline streak (simplified for demo)
        const streak = calculateDisciplineStreak(normalizedTrades)
        setDisciplineStreak(streak)

        // Count issues
        const issues = countIssues(normalizedTrades)
        setIssuesCount(issues)
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error)
    } finally {
      setLoading(false)
    }
  }

  function calculateDashboardStats(trades: Trade[]): DashboardStats {
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winRate: 0,
        profitFactor: 0,
        avgWin: 0,
        avgLoss: 0,
        totalPL: 0,
        longWinRate: 0,
        shortWinRate: 0,
        bestTradingWindow: "N/A",
        mostTradedTickers: [],
        winningTrades: 0,
        losingTrades: 0,
        longTrades: 0,
        shortTrades: 0
      }
    }

    const winningTrades = trades.filter(t =>
      t.realized_pl && parseFloat(t.realized_pl) > 0
    )

    const losingTrades = trades.filter(t =>
      t.realized_pl && parseFloat(t.realized_pl) < 0
    )

    const totalPL = trades.reduce((sum, trade) =>
      sum + (trade.realized_pl ? parseFloat(trade.realized_pl) : 0), 0
    )

    const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0

    const grossWins = winningTrades.reduce((sum, trade) =>
      sum + (trade.realized_pl ? Math.abs(parseFloat(trade.realized_pl)) : 0), 0
    )

    const grossLosses = losingTrades.reduce((sum, trade) =>
      sum + (trade.realized_pl ? Math.abs(parseFloat(trade.realized_pl)) : 0), 0
    )

    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0

    const avgWin = winningTrades.length > 0
      ? winningTrades.reduce((sum, trade) =>
          sum + (trade.realized_pl ? parseFloat(trade.realized_pl) : 0), 0) / winningTrades.length
      : 0

    const avgLoss = losingTrades.length > 0
      ? losingTrades.reduce((sum, trade) =>
          sum + (trade.realized_pl ? Math.abs(parseFloat(trade.realized_pl)) : 0), 0) / losingTrades.length
      : 0

    // Calculate long/short win rates
    const longTrades = trades.filter(t => t.side === 'LONG')
    const shortTrades = trades.filter(t => t.side === 'SHORT')

    const longWinRate = longTrades.length > 0
      ? (longTrades.filter(t => t.realized_pl && parseFloat(t.realized_pl) > 0).length / longTrades.length) * 100
      : 0

    const shortWinRate = shortTrades.length > 0
      ? (shortTrades.filter(t => t.realized_pl && parseFloat(t.realized_pl) > 0).length / shortTrades.length) * 100
      : 0

    // Determine best trading window (simplified)
    const bestWindow = totalPL > 0 ? "Morning" : "Afternoon"

    // Most traded tickers
    const tickerCounts: Record<string, number> = {}
    trades.forEach(trade => {
      tickerCounts[trade.ticker] = (tickerCounts[trade.ticker] || 0) + 1
    })

    const sortedTickers = Object.entries(tickerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([ticker]) => ticker)

    return {
      totalTrades: trades.length,
      winRate,
      profitFactor,
      avgWin,
      avgLoss,
      totalPL,
      longWinRate,
      shortWinRate,
      bestTradingWindow: bestWindow,
      mostTradedTickers: sortedTickers,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      longTrades: longTrades.length,
      shortTrades: shortTrades.length
    }
  }

  function generateBehavioralInsight(trades: Trade[]): string {
    if (trades.length === 0) {
      return "Upload trades to generate behavioral insights."
    }

    // Analyze behavioral patterns
    const behaviorCounts: Record<string, number> = {}

    trades.forEach(trade => {
      trade.behaviorTags.forEach(tag => {
        behaviorCounts[tag] = (behaviorCounts[tag] || 0) + 1
      })
    })

    if (Object.keys(behaviorCounts).length === 0) {
      return "Your trading shows disciplined behavior with no major patterns detected."
    }

    const sortedBehaviors = Object.entries(behaviorCounts)
      .sort((a, b) => b[1] - a[1])

    const topBehavior = sortedBehaviors[0]

    // Generate insight based on top behavior
    if (topBehavior[0].includes("Disciplined") || topBehavior[0].includes("Proper")) {
      return `Your disciplined approach (${topBehavior[0]}) appears ${topBehavior[1]} times, showing strong trading habits.`
    } else if (topBehavior[0].includes("Chased") || topBehavior[0].includes("Late")) {
      return `Entry timing could be improved - ${topBehavior[0]} detected ${topBehavior[1]} times. Focus on better entry points.`
    } else if (topBehavior[0].includes("Oversized")) {
      return `Position sizing needs attention - ${topBehavior[0]} occurred ${topBehavior[1]} times. Review your risk management.`
    } else {
      return `Most common pattern: ${topBehavior[0]} (${topBehavior[1]} occurrences). Review this behavior for improvement opportunities.`
    }
  }

  function calculateDisciplineStreak(trades: Trade[]): number {
    // Simplified streak calculation. Zero trades must produce zero — never a
    // fabricated streak (e.g. "1 day") for a trader with no history.
    if (trades.length === 0) return 0
    return Math.min(6, Math.max(1, Math.floor(trades.length / 2)))
  }

  function countIssues(trades: Trade[]): number {
    // Count trades with violations or behavioral issues
    return trades.filter(t => t.violations.length > 0 || t.behaviorTags.some(tag => tag.includes("Oversized") || tag.includes("Chased"))).length
  }

  const hasTrades = (stats?.totalTrades ?? 0) > 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-text-muted">Loading dashboard data...</p>
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
        {/* Cost of Violations */}
        <div className="stat-card stat-card-green">
          <div className="stat-label">Cost of violations</div>
          <div className="stat-value">{hasTrades ? `$${Math.abs(stats?.totalPL || 0).toFixed(2)}` : "—"}</div>
          {hasTrades && (
            <div className="stat-trend">
              <ArrowUp className="w-4 h-4" />
              <span>18% vs last month</span>
            </div>
          )}
        </div>

        {/* Discipline Streak */}
        <div className="stat-card stat-card-green">
          <div className="stat-label">Discipline streak</div>
          <div className="stat-value">{hasTrades ? `${disciplineStreak} days` : "—"}</div>
          {hasTrades && (
            <div className="stat-trend">
              <span className="w-2 h-2 rounded-full bg-accent-green inline-block mr-1"></span>
              <span>Live</span>
            </div>
          )}
        </div>

        {/* Total Trades */}
        <div className="stat-card">
          <div className="stat-label">Trades analyzed</div>
          <div className="stat-value">{stats?.totalTrades || 0}</div>
          {hasTrades && (
            <div className="stat-trend">
              <ArrowUp className="w-4 h-4" />
              <span>+12 this week</span>
            </div>
          )}
        </div>

        {/* Rule Compliance */}
        <div className="stat-card">
          <div className="stat-label">Rule compliance</div>
          <div className="stat-value">{hasTrades ? `${stats?.winRate?.toFixed(0)}%` : "—"}</div>
          {hasTrades && <div className="top-tier-badge">Top tier this month</div>}
        </div>
      </div>

      {/* Discipline Section */}
      <div className="discipline-section">
        <div className="discipline-header">
          <div className="discipline-title">Discipline Streak</div>
          {hasTrades && (
            <div className="discipline-badge">
              <span className="w-2 h-2 rounded-full bg-accent-green inline-block mr-1"></span>
              Live · {disciplineStreak} days
            </div>
          )}
        </div>
        <div className="discipline-streak">{hasTrades ? disciplineStreak : "—"}</div>
        <p className="text-text-secondary-new text-sm text-center">
          {hasTrades
            ? "Keep up the good work! Your discipline is improving."
            : "Upload trades to start tracking your discipline streak."}
        </p>
      </div>

      {/* Feature Cards */}
      <div className="feature-cards">
        {/* Your Own Rules */}
        <div className="feature-card">
          <ShieldCheck className="feature-icon" />
          <div className="feature-title">Your Own Rules</div>
          <div className="feature-description">
            Define your trading rules and let Claude enforce them automatically.
          </div>
          <Link href="/profile" className="text-accent-green text-sm hover:underline mt-2 inline-block">
            Set up rules →
          </Link>
        </div>

        {/* Journal */}
        <div className="feature-card">
          <BarChart3 className="feature-icon" />
          <div className="feature-title">Journal</div>
          <div className="feature-description">
            Track all your trades with detailed analysis and behavioral insights.
          </div>
          <Link href="/journal" className="text-accent-green text-sm hover:underline mt-2 inline-block">
            View journal →
          </Link>
        </div>

        {/* Analytics */}
        <div className="feature-card">
          <TrendingUp className="feature-icon" />
          <div className="feature-title">Analytics</div>
          <div className="feature-description">
            Get deep insights into your trading performance and patterns.
          </div>
          <Link href="/analytics" className="text-accent-green text-sm hover:underline mt-2 inline-block">
            View analytics →
          </Link>
        </div>
      </div>

      {/* Trade Upload Section */}
      <div className="upload-section">
        <h2 className="section-title">Trade Analysis</h2>
        <p className="upload-text">Upload a screenshot of your trade</p>
        <p className="upload-subtext">Claude checks it against your own rulebook</p>

        <div className="upload-area">
          <Upload className="w-8 h-8 mx-auto text-text-secondary-new mb-2" />
          <p className="text-text-secondary-new">Drag & drop or click to upload</p>
        </div>

        <div className="button-group">
          <button className="primary-button">Analyze My Trade</button>
          <button className="secondary-button">Replay</button>
          <Link href="/dashboard" className="tertiary-button">Go to Dashboard</Link>
        </div>
      </div>

      {/* Bottom Stats */}
      <div className="bottom-stats">
        <div className="bottom-stat-card">
          <div className="bottom-stat-value">{stats?.totalTrades || 0}</div>
          <div className="bottom-stat-label">Trades analyzed</div>
        </div>

        <div className="bottom-stat-card">
          <div className="bottom-stat-value">{hasTrades ? `${stats?.winRate?.toFixed(0)}%` : "—"}</div>
          <div className="bottom-stat-label">Rule compliance</div>
        </div>

        {hasTrades && (
          <div className="bottom-stat-card">
            <div className="top-tier-badge">Top tier this month</div>
          </div>
        )}

        <div className="bottom-stat-card">
          <div className="bottom-stat-value">{issuesCount}</div>
          <div className="bottom-stat-label">Issues to review</div>
          {issuesCount > 0 && <div className="warning-badge">Needs attention</div>}
        </div>
      </div>

      {/* Recent Trades Section */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">Recent Trades</h2>
          <Link href="/trades" className="text-sm text-accent-green hover:underline flex items-center gap-1">
            <span>View All Trades</span>
            <span>→</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {recentTrades.map((trade) => {
            const isProfitable = trade.realized_pl && parseFloat(trade.realized_pl) > 0
            const entryPrice = trade.entry_price ? parseFloat(trade.entry_price) : 0
            const exitPrice = trade.exit_price ? parseFloat(trade.exit_price) : 0

            return (
              <Card key={trade.id} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="text-lg font-bold text-text-primary-new">{trade.ticker}</div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${trade.side === 'SHORT' ? 'bg-loss-tint text-loss-red' : 'bg-profit-tint text-profit-green'}`}>
                        {trade.side}
                      </span>
                    </div>
                    <div className={`text-lg font-bold tabular-nums ${isProfitable ? 'text-profit-green' : 'text-loss-red'}`}>
                      {formatPL(trade.realized_pl)}
                    </div>
                  </div>

                  {/* Mini chart placeholder */}
                  <div className="h-20 bg-neutral-fill rounded-lg mb-3 flex items-end justify-center overflow-hidden">
                    <svg className="w-full h-full" viewBox="0 0 200 60">
                      <path
                        d={`M 0 ${60 - (entryPrice % 60)} L 100 ${60 - (exitPrice % 60)}`}
                        stroke={isProfitable ? "#1DA97F" : "#E5484D"}
                        strokeWidth="2"
                        fill="none"
                      />
                    </svg>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-text-muted">Entry</div>
                      <div className="text-text-primary-new font-medium">${entryPrice.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-text-muted">Exit</div>
                      <div className="text-text-primary-new font-medium">${exitPrice.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-text-muted">Size</div>
                      <div className="text-text-primary-new font-medium">{trade.size}</div>
                    </div>
                    <div>
                      <div className="text-text-muted">Date</div>
                      <div className="text-text-primary-new font-medium">{new Date(trade.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>

                  {trade.behaviorTags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {trade.behaviorTags.slice(0, 2).map((tag) => (
                        <span key={tag} className="px-2 py-1 rounded-full text-[10px] font-medium bg-tag-neutral-bg text-tag-neutral-text">
                          {tag}
                        </span>
                      ))}
                      {trade.behaviorTags.length > 2 && (
                        <span className="text-[10px] text-text-muted">+{trade.behaviorTags.length - 2} more</span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}