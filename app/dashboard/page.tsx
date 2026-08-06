"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { Home, TrendingUp, TrendingDown, BarChart3, ShieldCheck, Target, Calendar, DollarSign, Plus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPL, formatNumber } from "@/lib/utils"
import Link from "next/link"

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
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        <Link href="/analyze" className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors">
          <Plus className="w-4 h-4" />
          <span>New Trade</span>
        </Link>
      </div>

      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {/* Net P&L */}
        <Card sentiment={stats?.totalPL && stats.totalPL > 0 ? "profit" : stats?.totalPL && stats.totalPL < 0 ? "loss" : "neutral"}>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Net P&L</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatPL(stats?.totalPL?.toString() || "0")}
            </div>
            <div className="text-xs text-text-muted mt-1">
              {stats?.totalTrades} trades
            </div>
          </CardContent>
        </Card>

        {/* Win Rate */}
        <Card sentiment={stats?.winRate && stats.winRate >= 60 ? "profit" : stats?.winRate && stats.winRate >= 40 ? "neutral" : "loss"}>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Win Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.winRate?.toFixed(1)}%
            </div>
            <div className="text-xs text-text-muted mt-1">
              {stats?.winningTrades || 0} wins / {stats?.losingTrades || 0} losses
            </div>
          </CardContent>
        </Card>

        {/* Profit Factor */}
        <Card sentiment={stats?.profitFactor && stats.profitFactor >= 1.5 ? "profit" : stats?.profitFactor && stats.profitFactor >= 1 ? "neutral" : "loss"}>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Profit Factor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.profitFactor?.toFixed(2)}
            </div>
            <div className="text-xs text-text-muted mt-1">
              Gross Wins / Gross Losses
            </div>
          </CardContent>
        </Card>

        {/* Avg Win vs Avg Loss */}
        <Card sentiment={stats?.avgWin && stats.avgLoss && stats.avgWin > stats.avgLoss ? "profit" : "loss"}>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Avg Win/Loss</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-profit-green">
              +${stats?.avgWin?.toFixed(2)}
            </div>
            <div className="text-lg font-bold text-loss-red">
              -${stats?.avgLoss?.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        {/* Total Trades */}
        <Card sentiment="neutral">
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Total Trades</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.totalTrades}
            </div>
            <div className="text-xs text-text-muted mt-1">
              {stats?.longTrades || 0} long / {stats?.shortTrades || 0} short
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Profile Score and Behavioral Intelligence Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Score Card */}
        <Card sentiment="accent">
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Profile Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center mb-4">
              <div className="relative w-32 h-32">
                <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#E9EBF1" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="40" fill="none"
                    stroke="#3B6EF6"
                    strokeWidth="8"
                    strokeDasharray="251.2"
                    strokeDashoffset="75.36"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-2xl font-bold text-text-primary">78</div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-profit-green" />
                <span>Discipline: 82</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-accent" />
                <span>Consistency: 75</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-text-muted" />
                <span>Execution: 70</span>
              </div>
            </div>

            <div className="mt-4 h-2 bg-neutral-fill rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-loss-red via-yellow-500 to-profit-green w-3/4" />
            </div>
          </CardContent>
        </Card>

        {/* Behavioral Intelligence Card */}
        <Card sentiment="accent">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-accent" />
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Behavioral Intelligence</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-accent-tint p-3 rounded-lg mb-4">
              <p className="text-text-primary font-medium">{behavioralInsight}</p>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Common Patterns</h4>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 rounded-full text-sm font-medium bg-tag-neutral-bg text-tag-neutral-text">Morning Breakouts</span>
                <span className="px-3 py-1 rounded-full text-sm font-medium bg-profit-tint text-profit-green">Disciplined Exits</span>
                <span className="px-3 py-1 rounded-full text-sm font-medium bg-loss-tint text-loss-red">Occasional Oversizing</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Trades Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Recent Trades</h2>
          <Link href="/trades" className="text-sm text-accent hover:underline flex items-center gap-1">
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
              <Card key={trade.id} sentiment={isProfitable ? "profit" : "loss"}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="text-lg font-bold text-text-primary">{trade.ticker}</div>
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
                      <div className="text-text-primary font-medium">${entryPrice.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-text-muted">Exit</div>
                      <div className="text-text-primary font-medium">${exitPrice.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-text-muted">Size</div>
                      <div className="text-text-primary font-medium">{trade.size}</div>
                    </div>
                    <div>
                      <div className="text-text-muted">Date</div>
                      <div className="text-text-primary font-medium">{new Date(trade.created_at).toLocaleDateString()}</div>
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

      {/* Analytics Summary Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Analytics Summary</h2>
          <Link href="/analytics" className="text-sm text-accent hover:underline flex items-center gap-1">
            <span>View Full Analytics</span>
            <span>→</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Performance by Week */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Performance by Week</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-40 flex items-end gap-2">
                {[1, 2, 3, 4, 5, 6, 7].map((week) => {
                  const height = Math.random() * 80 + 20
                  const isPositive = Math.random() > 0.5
                  return (
                    <div key={week} className="flex flex-col items-center gap-1">
                      <div
                        className={`w-6 rounded-t-sm ${isPositive ? 'bg-profit-green' : 'bg-loss-red'}`}
                        style={{ height: `${height}px` }}
                      />
                      <span className="text-xs text-text-muted">W{week}</span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Strategy Performance */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Strategy Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-text-primary font-medium">Breakout Trades</span>
                    <span className="text-xs text-text-muted">(42%)</span>
                  </div>
                  <div className="text-sm font-bold text-profit-green">+$1,240</div>
                </div>
                <div className="w-full bg-neutral-fill rounded-full h-2">
                  <div className="bg-profit-green h-2 rounded-full" style={{ width: "42%" }} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-text-primary font-medium">Gap Fills</span>
                    <span className="text-xs text-text-muted">(31%)</span>
                  </div>
                  <div className="text-sm font-bold text-profit-green">+$890</div>
                </div>
                <div className="w-full bg-neutral-fill rounded-full h-2">
                  <div className="bg-profit-green h-2 rounded-full" style={{ width: "31%" }} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-text-primary font-medium">Reversals</span>
                    <span className="text-xs text-text-muted">(27%)</span>
                  </div>
                  <div className="text-sm font-bold text-loss-red">-$210</div>
                </div>
                <div className="w-full bg-neutral-fill rounded-full h-2">
                  <div className="bg-loss-red h-2 rounded-full" style={{ width: "27%" }} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}