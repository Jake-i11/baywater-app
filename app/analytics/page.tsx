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
  violations: string[] | string | null
  behaviorTags?: string[]
  created_at: string
}

// ── Real-data helpers (no fabricated values) ───────────────────────────────

/** Parse a trade's violations column. The DB stores it as a JSON string. */
function getViolations(trade: Trade): string[] {
  const v = trade.violations
  if (Array.isArray(v)) return v
  if (typeof v === 'string' && v) {
    try {
      const parsed = JSON.parse(v)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

/** Numeric P&L, or null when the trade has no usable value. */
function getPL(trade: Trade): number | null {
  if (trade.realized_pl === null || trade.realized_pl === undefined) return null
  const pl = parseFloat(trade.realized_pl)
  return isNaN(pl) ? null : pl
}

/** Entry hour (0-23) from a trade's entry_time, or -1 when unparseable. */
function getEntryHour(trade: Trade): number {
  const ts = trade.entry_time
  if (!ts) return -1
  const d = new Date(ts)
  if (!isNaN(d.getTime())) return d.getHours()
  const match = ts.match(/(\d{1,2}):(\d{2})/)
  return match ? parseInt(match[1], 10) : -1
}

/** ISO key of the Monday of the week containing `date`. */
function getWeekKey(date: Date): string {
  const d = new Date(date)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // Monday = 0
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
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
  const hasData = filteredTrades.length > 0

  const winningTrades = filteredTrades.filter(t => { const pl = getPL(t); return pl !== null && pl > 0 })
  const losingTrades = filteredTrades.filter(t => { const pl = getPL(t); return pl !== null && pl < 0 })

  const totalPL = filteredTrades.reduce((sum, trade) => sum + (getPL(trade) || 0), 0)

  // null (not 0) when there are no trades — the UI shows N/A for null and
  // a real 0% only when trades exist and every one of them lost.
  const winRate = hasData ? (winningTrades.length / filteredTrades.length) * 100 : null

  const grossWins = winningTrades.reduce((sum, trade) => sum + Math.abs(getPL(trade) || 0), 0)
  const grossLosses = losingTrades.reduce((sum, trade) => sum + Math.abs(getPL(trade) || 0), 0)

  const profitFactor = !hasData ? null : grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : null

  const avgWin = winningTrades.length > 0
    ? winningTrades.reduce((sum, trade) => sum + (getPL(trade) || 0), 0) / winningTrades.length
    : null

  const avgLoss = losingTrades.length > 0
    ? losingTrades.reduce((sum, trade) => sum + Math.abs(getPL(trade) || 0), 0) / losingTrades.length
    : null

  const expectancy = hasData
    ? ((avgWin || 0) * (winningTrades.length / filteredTrades.length)) -
      ((avgLoss || 0) * (losingTrades.length / filteredTrades.length))
    : null

  // ── Compliance rate: % of trades with no violations (null when no trades) ──
  const complianceRate = hasData
    ? (filteredTrades.filter(t => getViolations(t).length === 0).length / filteredTrades.length) * 100
    : null

  // ── Behavioral pattern counts — derived from real trade data ──
  const numericSizes = filteredTrades
    .map(t => parseFloat(t.size))
    .filter(s => !isNaN(s) && s > 0)
  const avgSize = numericSizes.length > 0
    ? numericSizes.reduce((sum, s) => sum + s, 0) / numericSizes.length
    : 0

  const positivePatterns = [
    { label: 'Disciplined Entry', count: filteredTrades.filter(t => getViolations(t).length === 0).length },
    {
      label: 'Proper Sizing',
      count: avgSize > 0
        ? filteredTrades.filter(t => {
            const s = parseFloat(t.size)
            return !isNaN(s) && s > 0 && s <= avgSize * 2
          }).length
        : 0,
    },
    { label: 'Followed Plan', count: filteredTrades.filter(t => t.discipline_score != null && t.discipline_score >= 70).length },
  ].filter(p => p.count > 0)

  const negativePatterns = [
    {
      label: 'Chased Entry',
      count: filteredTrades.filter(t =>
        getViolations(t).some(v => /timing|entry|late|chase/i.test(v))
      ).length,
    },
    {
      label: 'Oversized Position',
      count: avgSize > 0
        ? filteredTrades.filter(t => {
            const s = parseFloat(t.size)
            return !isNaN(s) && s > 0 && s > avgSize * 2
          }).length
        : 0,
    },
    {
      label: 'Early Exit',
      count: filteredTrades.filter(t =>
        getViolations(t).some(v => /exit|early/i.test(v))
      ).length,
    },
  ].filter(p => p.count > 0)

  // ── Most common violations — grouped into the app's established categories ──
  const commonViolations = [
    { label: 'Position Sizing', count: filteredTrades.filter(t => getViolations(t).some(v => /size|sizing|position/i.test(v))).length },
    { label: 'Entry Timing', count: filteredTrades.filter(t => getViolations(t).some(v => /timing|entry|early|late|chase/i.test(v))).length },
    { label: 'Rule Violation', count: filteredTrades.filter(t => getViolations(t).some(v => v && v.trim().length > 0)).length },
  ].filter(v => v.count > 0)

  // ── Performance by week: last 12 calendar weeks, real P&L ──
  const weekBuckets: { key: string; label: string; pl: number }[] = []
  {
    const now = new Date()
    const currentMonday = new Date(now)
    currentMonday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    currentMonday.setHours(0, 0, 0, 0)
    for (let i = 11; i >= 0; i--) {
      const start = new Date(currentMonday)
      start.setDate(currentMonday.getDate() - i * 7)
      weekBuckets.push({ key: start.toISOString(), label: `W${12 - i}`, pl: 0 })
    }
  }
  filteredTrades.forEach(trade => {
    const pl = getPL(trade)
    if (pl === null) return
    const bucket = weekBuckets.find(b => b.key === getWeekKey(new Date(trade.created_at)))
    if (bucket) bucket.pl += pl
  })
  const maxWeekPL = Math.max(0, ...weekBuckets.map(b => Math.abs(b.pl)))

  // ── Performance by hour: 9:00-20:00, real P&L by entry hour ──
  const hourBuckets: { hour: number; pl: number }[] =
    Array.from({ length: 12 }, (_, i) => ({ hour: i + 9, pl: 0 }))
  filteredTrades.forEach(trade => {
    const pl = getPL(trade)
    if (pl === null) return
    const hour = getEntryHour(trade)
    const bucket = hourBuckets.find(b => b.hour === hour)
    if (bucket) bucket.pl += pl
  })
  const maxHourPL = Math.max(0, ...hourBuckets.map(b => Math.abs(b.pl)))

  // Calculate performance by strategy/setup
  const strategyPerformance: Record<string, { count: number; totalPL: number }> = {}
  filteredTrades.forEach(trade => {
    (trade.behaviorTags ?? []).forEach(tag => {
      if (!strategyPerformance[tag]) {
        strategyPerformance[tag] = { count: 0, totalPL: 0 }
      }
      strategyPerformance[tag].count++
      strategyPerformance[tag].totalPL += getPL(trade) || 0
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
              {hasData ? formatPL(totalPL.toString()) : "—"}
            </div>
            <div className="text-xs text-text-muted mt-1">
              {filteredTrades.length} trades
            </div>
          </CardContent>
        </Card>

        <Card sentiment={winRate !== null && winRate >= 60 ? "profit" : winRate !== null && winRate >= 40 ? "neutral" : "loss"}>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Win Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {winRate !== null ? `${winRate.toFixed(1)}%` : "—"}
            </div>
            <div className="text-xs text-text-muted mt-1">
              {winningTrades.length} wins / {losingTrades.length} losses
            </div>
          </CardContent>
        </Card>

        <Card sentiment={profitFactor !== null && profitFactor >= 1.5 ? "profit" : profitFactor !== null && profitFactor >= 1 ? "neutral" : "loss"}>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Profit Factor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {profitFactor !== null ? profitFactor.toFixed(2) : "—"}
            </div>
            <div className="text-xs text-text-muted mt-1">
              {hasData ? `$${grossWins.toFixed(0)} / $${grossLosses.toFixed(0)}` : "—"}
            </div>
          </CardContent>
        </Card>

        <Card sentiment={avgWin !== null && avgWin > (avgLoss || 0) ? "profit" : "loss"}>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Avg Win/Loss</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-profit-green">
              {avgWin !== null ? `+$${avgWin.toFixed(2)}` : "—"}
            </div>
            <div className="text-lg font-bold text-loss-red">
              {avgLoss !== null ? `-$${avgLoss.toFixed(2)}` : "—"}
            </div>
          </CardContent>
        </Card>

        <Card sentiment="neutral">
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Expectancy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {expectancy !== null ? expectancy.toFixed(2) : "—"}
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
            {hasData ? (
              <div className="h-64 flex items-end gap-1">
                {weekBuckets.map((bucket) => {
                  const height = maxWeekPL > 0 ? (Math.abs(bucket.pl) / maxWeekPL) * 100 : 0
                  const isPositive = bucket.pl >= 0
                  return (
                    <div
                      key={bucket.key}
                      className="flex flex-col items-center gap-1 flex-1"
                      title={`${new Date(bucket.key).toLocaleDateString()}: ${formatPL(bucket.pl.toString())}`}
                    >
                      <div
                        className={`w-full rounded-t-sm ${isPositive ? 'bg-profit-green' : 'bg-loss-red'}`}
                        style={{ height: `${bucket.pl !== 0 ? Math.max(height, 2) : 0}px` }}
                      />
                      <span className="text-xs text-text-muted">{bucket.label}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center">
                <p className="text-text-muted">No data yet</p>
              </div>
            )}
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
            {hasData ? (
              <div className="h-64 flex items-end gap-1">
                {hourBuckets.map((bucket) => {
                  const height = maxHourPL > 0 ? (Math.abs(bucket.pl) / maxHourPL) * 100 : 0
                  const isPositive = bucket.pl >= 0
                  return (
                    <div
                      key={bucket.hour}
                      className="flex flex-col items-center gap-1 flex-1"
                      title={`${bucket.hour}:00 — ${formatPL(bucket.pl.toString())}`}
                    >
                      <div
                        className={`w-full rounded-t-sm ${isPositive ? 'bg-profit-green' : 'bg-loss-red'}`}
                        style={{ height: `${bucket.pl !== 0 ? Math.max(height, 2) : 0}px` }}
                      />
                      <span className="text-xs text-text-muted">{bucket.hour}:00</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center">
                <p className="text-text-muted">No data yet</p>
              </div>
            )}
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
              {positivePatterns.length > 0 ? (
                <div className="space-y-3">
                  {positivePatterns.map((pattern) => (
                    <div key={pattern.label} className="flex items-center justify-between p-2 rounded-lg hover:bg-neutral-fill">
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center bg-profit-green/20">
                          <TrendingUp className="w-4 h-4 text-profit-green" />
                        </div>
                        <span className="text-sm text-text-primary">{pattern.label}</span>
                      </div>
                      <span className="text-sm font-medium text-profit-green">{pattern.count} {pattern.count === 1 ? 'occurrence' : 'occurrences'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-text-muted">
                    {filteredTrades.length === 0 ? "No data yet — patterns will appear once you have trades" : "No positive patterns detected yet"}
                  </p>
                </div>
              )}
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
              {negativePatterns.length > 0 ? (
                <div className="space-y-3">
                  {negativePatterns.map((pattern) => (
                    <div key={pattern.label} className="flex items-center justify-between p-2 rounded-lg hover:bg-neutral-fill">
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center bg-loss-red/20">
                          <TrendingDown className="w-4 h-4 text-loss-red" />
                        </div>
                        <span className="text-sm text-text-primary">{pattern.label}</span>
                      </div>
                      <span className="text-sm font-medium text-loss-red">{pattern.count} {pattern.count === 1 ? 'occurrence' : 'occurrences'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-text-muted">
                    {filteredTrades.length === 0 ? "No data yet — patterns will appear once you have trades" : "No negative patterns detected yet"}
                  </p>
                </div>
              )}
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
                      strokeDashoffset={complianceRate !== null ? 251.2 * (1 - complianceRate / 100) : 251.2}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-xl font-bold text-text-primary">
                      {complianceRate !== null ? `${Math.round(complianceRate)}%` : "N/A"}
                    </div>
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
              {commonViolations.length > 0 ? (
                <div className="space-y-3">
                  {commonViolations.map((violation) => (
                    <div key={violation.label} className="flex items-center justify-between p-2 rounded-lg hover:bg-neutral-fill">
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center bg-loss-red/20">
                          <span className="text-xs text-loss-red">!</span>
                        </div>
                        <span className="text-sm text-text-primary">{violation.label}</span>
                      </div>
                      <span className="text-sm font-medium text-text-primary">{violation.count} {violation.count === 1 ? 'time' : 'times'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-text-muted">
                    {filteredTrades.length === 0 ? "No data yet" : "No violations recorded"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}