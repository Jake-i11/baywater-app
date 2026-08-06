"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { TrendingUp, TrendingDown, BarChart3, PieChart, Calendar, Clock, Target } from "lucide-react"
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

export default function AnalyticsPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [timeFrame, setTimeFrame] = useState<"week" | "month" | "quarter" | "year" | "all">("month")

  useEffect(() => {
    fetchTrades()
  }, [])

  async function fetchTrades() {
    try {
      setLoading(true)

      // Fetch trades data
      const { data: tradesData, error: tradesError } = await supabase
        .from('trades')
        .select('*')
        .order('created_at', { ascending: false })

      if (tradesError) {
        console.error("Error fetching trades:", tradesError)
        return
      }

      if (tradesData) {
        setTrades(tradesData)
      }
    } catch (error) {
      console.error("Error fetching trades:", error)
    } finally {
      setLoading(false)
    }
  }

  // Filter trades by time frame
  const filteredTrades = trades.filter(trade => {
    const tradeDate = new Date(trade.created_at)
    const now = new Date()

    if (timeFrame === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      return tradeDate >= weekAgo
    } else if (timeFrame === "month") {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      return tradeDate >= monthAgo
    } else if (timeFrame === "quarter") {
      const quarterAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      return tradeDate >= quarterAgo
    } else if (timeFrame === "year") {
      const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
      return tradeDate >= yearAgo
    }
    return true // "all" time frame
  })

  // Calculate statistics
  const winningTrades = filteredTrades.filter(t => t.realized_pl && parseFloat(t.realized_pl) > 0)
  const losingTrades = filteredTrades.filter(t => t.realized_pl && parseFloat(t.realized_pl) < 0)

  const totalPL = filteredTrades.reduce((sum, trade) =>
    sum + (trade.realized_pl ? parseFloat(trade.realized_pl) : 0), 0
  )

  const winRate = filteredTrades.length > 0 ? (winningTrades.length / filteredTrades.length) * 100 : 0

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

  // Calculate performance by strategy/setup
  const strategyPerformance: Record<string, { count: number; totalPL: number }> = {}
  filteredTrades.forEach(trade => {
    (trade.behaviorTags ?? []).forEach(tag => {
      if (!strategyPerformance[tag]) {
        strategyPerformance[tag] = { count: 0, totalPL: 0 }
      }
      strategyPerformance[tag].count++
      strategyPerformance[tag].totalPL += trade.realized_pl ? parseFloat(trade.realized_pl) : 0
    })
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-text-muted">Loading analytics...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Analytics</h1>
        <div className="flex items-center gap-2">
          <span className="text-text-muted">Time Frame:</span>
          <select
            value={timeFrame}
            onChange={(e) => setTimeFrame(e.target.value as "week" | "month" | "quarter" | "year" | "all")}
            className="px-3 py-2 border border-card-border rounded-lg bg-card-bg text-text-primary"
          >
            <option value="week">Last Week</option>
            <option value="month">Last Month</option>
            <option value="quarter">Last Quarter</option>
            <option value="year">Last Year</option>
            <option value="all">All Time</option>
          </select>
        </div>
      </div>

      {/* Overview Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <Card sentiment={totalPL > 0 ? "profit" : totalPL < 0 ? "loss" : "neutral"}>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Net P&L</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatPL(totalPL.toString())}
            </div>
            <div className="text-xs text-text-muted mt-1">
              {filteredTrades.length} trades
            </div>
          </CardContent>
        </Card>

        <Card sentiment={winRate >= 60 ? "profit" : winRate >= 40 ? "neutral" : "loss"}>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Win Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {winRate.toFixed(1)}%
            </div>
            <div className="text-xs text-text-muted mt-1">
              {winningTrades.length} wins / {losingTrades.length} losses
            </div>
          </CardContent>
        </Card>

        <Card sentiment={profitFactor >= 1.5 ? "profit" : profitFactor >= 1 ? "neutral" : "loss"}>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Profit Factor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {profitFactor.toFixed(2)}
            </div>
            <div className="text-xs text-text-muted mt-1">
              ${grossWins.toFixed(0)} / ${grossLosses.toFixed(0)}
            </div>
          </CardContent>
        </Card>

        <Card sentiment={avgWin > avgLoss ? "profit" : "loss"}>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Avg Win/Loss</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-profit-green">
              +${avgWin.toFixed(2)}
            </div>
            <div className="text-lg font-bold text-loss-red">
              -${avgLoss.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card sentiment="neutral">
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Expectancy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {((avgWin * (winningTrades.length / filteredTrades.length)) - (avgLoss * (losingTrades.length / filteredTrades.length))).toFixed(2)}
            </div>
            <div className="text-xs text-text-muted mt-1">
              Per trade
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance by Week */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-text-muted" />
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Performance by Week</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-end gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((week) => {
                const height = Math.random() * 80 + 20
                const isPositive = Math.random() > 0.5
                return (
                  <div key={week} className="flex flex-col items-center gap-1 flex-1">
                    <div
                      className={`w-full rounded-t-sm ${isPositive ? 'bg-profit-green' : 'bg-loss-red'}`}
                      style={{ height: `${height}px` }}
                    />
                    <span className="text-xs text-text-muted">W{week}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Performance by Hour */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-text-muted" />
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Performance by Hour</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-end gap-1">
              {Array.from({ length: 12 }, (_, i) => i + 9).map((hour) => {
                const height = Math.random() * 80 + 20
                const isPositive = Math.random() > 0.5
                return (
                  <div key={hour} className="flex flex-col items-center gap-1 flex-1">
                    <div
                      className={`w-full rounded-t-sm ${isPositive ? 'bg-profit-green' : 'bg-loss-red'}`}
                      style={{ height: `${height}px` }}
                    />
                    <span className="text-xs text-text-muted">{hour}:00</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Strategy Performance */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">Strategy Performance</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(strategyPerformance).map(([strategy, data]) => (
            <Card key={strategy}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-text-primary">{strategy}</div>
                  <div className={`text-sm font-bold ${data.totalPL > 0 ? 'text-profit-green' : 'text-loss-red'}`}>
                    {formatPL(data.totalPL.toString())}
                  </div>
                </div>

                <div className="w-full bg-neutral-fill rounded-full h-2 mb-2">
                  <div
                    className={`h-2 rounded-full ${data.totalPL > 0 ? 'bg-profit-green' : 'bg-loss-red'}`}
                    style={{ width: `${Math.min(100, Math.abs(data.totalPL) / 100)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span>{data.count} trades</span>
                  <span>{(data.totalPL / data.count).toFixed(2)} avg</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Behavioral Trends */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">Behavioral Trends</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Positive Behaviors */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-profit-green" />
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Positive Patterns</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {['Disciplined Entry', 'Proper Sizing', 'Followed Plan'].map((pattern) => (
                  <div key={pattern} className="flex items-center justify-between p-2 rounded-lg hover:bg-neutral-fill">
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center bg-profit-green/20">
                        <TrendingUp className="w-4 h-4 text-profit-green" />
                      </div>
                      <span className="text-sm text-text-primary">{pattern}</span>
                    </div>
                    <span className="text-sm font-medium text-profit-green">{Math.floor(Math.random() * 20) + 5} occurrences</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Negative Behaviors */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-loss-red" />
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Areas for Improvement</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {['Chased Entry', 'Oversized Position', 'Early Exit'].map((pattern) => (
                  <div key={pattern} className="flex items-center justify-between p-2 rounded-lg hover:bg-neutral-fill">
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center bg-loss-red/20">
                        <TrendingDown className="w-4 h-4 text-loss-red" />
                      </div>
                      <span className="text-sm text-text-primary">{pattern}</span>
                    </div>
                    <span className="text-sm font-medium text-loss-red">{Math.floor(Math.random() * 10) + 2} occurrences</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Rule Compliance */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">Rule Compliance</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Compliance Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center mb-4">
                <div className="relative w-24 h-24">
                  <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#E9EBF1" strokeWidth="8" />
                    <circle
                      cx="50" cy="50" r="40" fill="none"
                      stroke="#3B6EF6"
                      strokeWidth="8"
                      strokeDasharray="251.2"
                      strokeDashoffset="50.24"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-xl font-bold text-text-primary">78%</div>
                  </div>
                </div>
              </div>

              <div className="text-center text-sm text-text-muted">
                Overall compliance rate across all trades
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Most Common Violations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {['Position Sizing', 'Entry Timing', 'Rule Violation'].map((violation, index) => (
                  <div key={violation} className="flex items-center justify-between p-2 rounded-lg hover:bg-neutral-fill">
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center bg-loss-red/20">
                        <span className="text-xs text-loss-red">!</span>
                      </div>
                      <span className="text-sm text-text-primary">{violation}</span>
                    </div>
                    <span className="text-sm font-medium text-text-primary">{Math.floor(Math.random() * 15) + 3} times</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}