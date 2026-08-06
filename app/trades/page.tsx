"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { FileText, Search, Filter, Table2, BarChart3, Plus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPL, formatNumber } from "@/lib/utils"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

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
  holdTime: string
}

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [viewMode, setViewMode] = useState<"table" | "cards">("table")
  const [dateRange, setDateRange] = useState<"all" | "week" | "month" | "quarter">("month")

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
        // Calculate hold time for each trade
        const tradesWithHoldTime = tradesData.map(trade => {
          const holdTime = calculateHoldTime(trade.entry_time, trade.exit_time)
          return { ...trade, holdTime }
        })

        setTrades(tradesWithHoldTime)
      }
    } catch (error) {
      console.error("Error fetching trades:", error)
    } finally {
      setLoading(false)
    }
  }

  function calculateHoldTime(entryTime: string | null | undefined, exitTime: string | null | undefined): string {
    if (!entryTime || !exitTime) return "Open trade"

    const entryMs = new Date(entryTime).getTime()
    const exitMs = new Date(exitTime).getTime()

    if (isNaN(entryMs) || isNaN(exitMs)) return "Open trade"

    const diffMs = exitMs - entryMs
    if (diffMs < 0) return "Open trade"

    const totalMinutes = Math.round(diffMs / 60000)

    if (totalMinutes < 1) return "<1m"
    if (totalMinutes < 60) return `${totalMinutes}m`

    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    if (minutes === 0) return `${hours}h`
    return `${hours}h ${minutes}m`
  }

  // Filter trades based on search term and date range
  const filteredTrades = trades.filter(trade => {
    // Filter by search term
const matchesSearch =
  (trade.ticker ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
  (trade.side ?? "").toLowerCase().includes(searchTerm.toLowerCase())

    // Filter by date range
    const tradeDate = new Date(trade.created_at)
    const now = new Date()

    let matchesDateRange = true
    if (dateRange === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      matchesDateRange = tradeDate >= weekAgo
    } else if (dateRange === "month") {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      matchesDateRange = tradeDate >= monthAgo
    } else if (dateRange === "quarter") {
      const quarterAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      matchesDateRange = tradeDate >= quarterAgo
    }

    return matchesSearch && matchesDateRange
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-text-muted">Loading trades...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Trades</h1>
        <Link href="/analyze" className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors">
          <Plus className="w-4 h-4" />
          <span>New Trade</span>
        </Link>
      </div>

      {/* Filter Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="flex items-center gap-2 flex-1">
              <Search className="w-5 h-5 text-text-muted" />
              <Input
                placeholder="Search trades (ticker, side)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-text-muted" />
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as "all" | "week" | "month" | "quarter")}
                className="px-3 py-2 border border-card-border rounded-lg bg-card-bg text-text-primary"
              >
                <option value="all">All Time</option>
                <option value="week">Last Week</option>
                <option value="month">Last Month</option>
                <option value="quarter">Last Quarter</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === "table" ? "default" : "outline"}
                onClick={() => setViewMode("table")}
                className="gap-2"
              >
                <Table2 className="w-4 h-4" />
                <span>Table</span>
              </Button>
              <Button
                variant={viewMode === "cards" ? "default" : "outline"}
                onClick={() => setViewMode("cards")}
                className="gap-2"
              >
                <BarChart3 className="w-4 h-4" />
                <span>Cards</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Total Trades</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-text-primary">
              {filteredTrades.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Winning Trades</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-profit-green">
              {filteredTrades.filter(t => t.realized_pl && parseFloat(t.realized_pl) > 0).length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Losing Trades</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-loss-red">
              {filteredTrades.filter(t => t.realized_pl && parseFloat(t.realized_pl) < 0).length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Win Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-text-primary">
              {filteredTrades.length > 0
                ? `${Math.round((filteredTrades.filter(t => t.realized_pl && parseFloat(t.realized_pl) > 0).length / filteredTrades.length) * 100)}%`
                : "0%"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trades Display */}
      {viewMode === "table" ? (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-fill">
                <tr>
                  <th className="p-3 text-left text-text-muted uppercase tracking-wider text-xs font-medium">Date</th>
                  <th className="p-3 text-left text-text-muted uppercase tracking-wider text-xs font-medium">Ticker</th>
                  <th className="p-3 text-left text-text-muted uppercase tracking-wider text-xs font-medium">Side</th>
                  <th className="p-3 text-left text-text-muted uppercase tracking-wider text-xs font-medium">Entry</th>
                  <th className="p-3 text-left text-text-muted uppercase tracking-wider text-xs font-medium">Exit</th>
                  <th className="p-3 text-left text-text-muted uppercase tracking-wider text-xs font-medium">P&L</th>
                  <th className="p-3 text-left text-text-muted uppercase tracking-wider text-xs font-medium">Hold Time</th>
                  <th className="p-3 text-left text-text-muted uppercase tracking-wider text-xs font-medium">Size</th>
                  <th className="p-3 text-left text-text-muted uppercase tracking-wider text-xs font-medium">Behavior</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrades.map((trade) => {
                  const isProfitable = trade.realized_pl && parseFloat(trade.realized_pl) > 0
                  const entryPrice = trade.entry_price ? parseFloat(trade.entry_price) : 0
                  const exitPrice = trade.exit_price ? parseFloat(trade.exit_price) : 0

                  return (
                    <tr
                      key={trade.id}
                      className="border-b border-card-border hover:bg-neutral-fill transition-colors"
                    >
                      <td className="p-3 text-text-primary">
                        {new Date(trade.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-3 text-text-primary font-medium">
                        {trade.ticker}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${trade.side === 'SHORT' ? 'bg-loss-tint text-loss-red' : 'bg-profit-tint text-profit-green'}`}>
                          {trade.side}
                        </span>
                      </td>
                      <td className="p-3 text-text-primary">
                        ${entryPrice.toFixed(2)}
                      </td>
                      <td className="p-3 text-text-primary">
                        ${exitPrice.toFixed(2)}
                      </td>
                      <td className={`p-3 font-bold tabular-nums ${isProfitable ? 'text-profit-green' : 'text-loss-red'}`}>
                        {formatPL(trade.realized_pl)}
                      </td>
                      <td className="p-3 text-text-muted">
                        {trade.holdTime}
                      </td>
                      <td className="p-3 text-text-primary">
                        {trade.size}
                      </td>
                      <td className="p-3">
                        {(trade.behaviorTags ?? []).length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {(trade.behaviorTags ?? []).slice(0, 2).map((tag) => (
                              <span key={tag} className="px-2 py-1 rounded-full text-[10px] font-medium bg-tag-neutral-bg text-tag-neutral-text">
                                {tag}
                              </span>
                            ))}
                            {(trade.behaviorTags ?? []).length > 2 && (
                              <span className="text-[10px] text-text-muted">+{(trade.behaviorTags ?? []).length - 2}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-text-muted">No behavioral tags</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTrades.map((trade) => {
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

                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                    <div>
                      <div className="text-text-muted">Entry</div>
                      <div className="text-text-primary font-medium">${entryPrice.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-text-muted">Exit</div>
                      <div className="text-text-primary font-medium">${exitPrice.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-text-muted">Hold Time</div>
                      <div className="text-text-primary font-medium">{trade.holdTime}</div>
                    </div>
                    <div>
                      <div className="text-text-muted">Size</div>
                      <div className="text-text-primary font-medium">{trade.size}</div>
                    </div>
                  </div>

                  {(trade.behaviorTags ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(trade.behaviorTags ?? []).slice(0, 3).map((tag) => (
                        <span key={tag} className="px-2 py-1 rounded-full text-[10px] font-medium bg-tag-neutral-bg text-tag-neutral-text">
                          {tag}
                        </span>
                      ))}
                      {(trade.behaviorTags ?? []).length > 3 && (
                        <span className="text-[10px] text-text-muted">+{(trade.behaviorTags ?? []).length - 3}</span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}