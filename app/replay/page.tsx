"use client"

import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { Play, Pause, SkipBack, SkipForward, Volume2, Maximize, Minimize, X, BarChart3, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TradeChart } from "@/components/TradeChart"
import { formatPL } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"

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
  violations?: string[]
  behaviorTags?: string[]
  created_at: string
}

function normalizeTrade(trade: Trade): Trade {
  return {
    ...trade,
    behaviorTags: Array.isArray(trade.behaviorTags) ? trade.behaviorTags : [],
    violations: Array.isArray(trade.violations) ? trade.violations : [],
  }
}

// Chart timeframe options. `value` is the Alpaca bars API timeframe; `label` is
// what the user sees. These are the ONLY timeframes we ever send to /api/chart.
const TIMEFRAMES = [
  { label: "1m", value: "1Min" },
  { label: "5m", value: "5Min" },
  { label: "15m", value: "15Min" },
  { label: "30m", value: "30Min" },
  { label: "1h", value: "1Hour" },
] as const

export default function ReplayPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null)
  const [candles, setCandles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [totalDuration, setTotalDuration] = useState(60)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showMetrics, setShowMetrics] = useState(false)
  const [timeframe, setTimeframe] = useState("5Min")
  const [chartLoading, setChartLoading] = useState(false)
  const [chartError, setChartError] = useState<string | null>(null)

  // Guards against stale responses when the user switches timeframes (or trades)
  // rapidly: only the most recent request may update the chart.
  const chartRequestId = useRef(0)
  const chartAbortController = useRef<AbortController | null>(null)
  // In-memory cache keyed by ticker + start + end + timeframe so switching back
  // to a previously viewed timeframe is instant and needs no extra API call.
  const chartCache = useRef<Map<string, any[]>>(new Map())

  useEffect(() => {
    fetchTrades()
  }, [])

  useEffect(() => {
    // Auto-collapse sidebar for immersive replay experience
    const sidebar = document.querySelector('[data-sidebar]')
    if (sidebar) {
      // This would be handled by the Sidebar component's state in a real implementation
    }
  }, [])

  async function fetchTrades() {
    try {
      setLoading(true)

      // Fetch trades data
      const { data: tradesData, error: tradesError } = await supabase
        .from('trades')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)

      if (tradesError) {
        console.error("Error fetching trades:", tradesError)
        return
      }

      if (tradesData && tradesData.length > 0) {
        // Older trades may not yet have these fields populated.
        const normalizedTrades = tradesData.map(normalizeTrade)
        setTrades(normalizedTrades)

        // Select the first trade by default
        const firstTrade = normalizedTrades[0]
        setSelectedTrade(firstTrade)

        // Fetch chart data for the first trade
        if (firstTrade.entry_time) {
          await fetchChartData(firstTrade.ticker, firstTrade.entry_time, firstTrade.exit_time || null, timeframe)
        }
      }
    } catch (error) {
      console.error("Error fetching trades:", error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchChartData(ticker: string, entryTime: string, exitTime: string | null, tf: string = "5Min") {
    // The chart window is derived from the trade's actual entry/exit timestamps
    // so switching timeframe never changes the replayed period.
    const startISO = new Date(entryTime).toISOString()
    const endISO = exitTime
      ? new Date(exitTime).toISOString()
      : new Date(new Date(entryTime).getTime() + 2 * 60 * 60 * 1000).toISOString()

    const cacheKey = `${ticker}|${startISO}|${endISO}|${tf}`
    const cached = chartCache.current.get(cacheKey)
    if (cached) {
      // Cache hit is authoritative: invalidate any in-flight request so a
      // slower older response can never overwrite these cached candles.
      const requestId = ++chartRequestId.current
      chartAbortController.current?.abort()
      setCandles(cached)
      setChartError(null)
      setChartLoading(false)
      return
    }

    const requestId = ++chartRequestId.current
    chartAbortController.current?.abort()
    const controller = new AbortController()
    chartAbortController.current = controller

    setChartLoading(true)
    setChartError(null)

    try {
      const response = await fetch("/api/chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          ticker,
          startTime: startISO,
          endTime: endISO,
          timeframe: tf,
        }),
      })

      // A newer timeframe/trade request superseded this one — discard it.
      if (requestId !== chartRequestId.current) return

      if (response.ok) {
        const chartData = await response.json()
        if (requestId !== chartRequestId.current) return

        const newCandles = chartData.candles || []
        if (newCandles.length > 0) {
          chartCache.current.set(cacheKey, newCandles)
          setCandles(newCandles)
          setChartError(null)
        } else {
          // No candles is NOT "trade does not exist" — keep the trade loaded and
          // let the user try another timeframe.
          console.warn(`Chart API returned 0 candles for ${ticker} at ${tf}`)
          setCandles([])
          setChartError(`No market data available for ${ticker} on the ${tf} timeframe`)
        }
      } else {
        let errorMsg = response.statusText
        try {
          const errBody = await response.json()
          if (errBody.error) errorMsg = errBody.error
        } catch {}
        console.error("Failed to fetch chart data:", errorMsg)
        setCandles([])
        setChartError(`Chart fetch failed: ${errorMsg}`)
      }
    } catch (error) {
      // Aborted because a newer request started, or a real failure.
      if (requestId !== chartRequestId.current) return
      console.error("Error fetching chart data:", error)
      setCandles([])
      setChartError(`Error fetching chart data: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (requestId === chartRequestId.current) {
        setChartLoading(false)
      }
    }
  }

  function handleTradeSelect(trade: Trade) {
    setSelectedTrade(trade)
    setIsPlaying(false)
    setCurrentTime(0)

    if (trade.entry_time) {
      fetchChartData(trade.ticker, trade.entry_time, trade.exit_time || null, timeframe)
    }
  }

  function handleTimeframeSelect(tf: string) {
    if (tf === timeframe) return
    // Update the selected button immediately, then fetch that timeframe's
    // candles for the SAME trade / SAME window / SAME replay position.
    setTimeframe(tf)
    if (selectedTrade?.entry_time) {
      fetchChartData(selectedTrade.ticker, selectedTrade.entry_time, selectedTrade.exit_time || null, tf)
    }
  }

  function togglePlayPause() {
    setIsPlaying(!isPlaying)
  }

  function handleSpeedChange(speed: number) {
    setPlaybackSpeed(speed)
  }

  function toggleFullscreen() {
    setIsFullscreen(!isFullscreen)
  }

  function formatTime(seconds: number) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-text-muted">Loading replay...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-4 h-full ${isFullscreen ? 'p-0' : ''}`}>
      {/* Trade Selector (collapsible) */}
      {!isFullscreen && (
        <Card className="border-2 border-dashed border-card-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-text-primary">Select Trade to Replay</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowMetrics(!showMetrics)}>
                {showMetrics ? 'Hide Metrics' : 'Show Metrics'}
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {trades.map((trade) => {
                const isSelected = selectedTrade?.id === trade.id
                const isProfitable = trade.realized_pl && parseFloat(trade.realized_pl) > 0

                return (
                  <button
                    key={trade.id}
                    onClick={() => handleTradeSelect(trade)}
                    className={`flex flex-col items-center gap-2 px-3 py-2 rounded-lg border transition-all ${isSelected ? 'border-accent bg-accent-tint' : 'border-card-border hover:border-accent'}`}
                  >
                    <div className={`text-sm font-medium ${isSelected ? 'text-accent' : 'text-text-primary'}`}>
                      {trade.ticker}
                    </div>
                    <div className={`text-xs ${isProfitable ? 'text-profit-green' : 'text-loss-red'}`}>
                      {formatPL(trade.realized_pl)}
                    </div>
                    <div className="w-2 h-2 rounded-full bg-text-muted" />
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Replay Area */}
      <div className={`flex-1 ${isFullscreen ? 'fixed inset-0 bg-canvas z-50' : ''}`}>
        <div className="flex flex-col h-full">
          {/* Chart Area */}
          <div className="flex-1 relative">
            {selectedTrade && (
              <div className="absolute top-4 left-4 z-10 bg-card-bg/80 backdrop-blur-sm px-3 py-2 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="text-lg font-bold text-text-primary">{selectedTrade.ticker}</div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${selectedTrade.side === 'SHORT' ? 'bg-loss-tint text-loss-red' : 'bg-profit-tint text-profit-green'}`}>
                    {selectedTrade.side}
                  </span>
                </div>
                <div className={`text-sm font-bold ${selectedTrade.realized_pl && parseFloat(selectedTrade.realized_pl) > 0 ? 'text-profit-green' : 'text-loss-red'}`}>
                  {formatPL(selectedTrade.realized_pl)}
                </div>
              </div>
            )}

            {/* Timeframe selector */}
            <div className="absolute top-4 right-4 z-10 flex items-center gap-1 bg-card-bg/80 backdrop-blur-sm px-1.5 py-1 rounded-lg border border-card-border shadow-sm">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.value}
                  onClick={() => handleTimeframeSelect(tf.value)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                    timeframe === tf.value
                      ? "bg-accent text-white shadow-sm"
                      : "text-text-muted hover:text-text-primary hover:bg-accent-tint"
                  }`}
                >
                  {tf.label}
                </button>
              ))}
              {chartLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted ml-1" />}
            </div>

            {chartError && (
              <div className="absolute top-16 right-4 z-10 bg-loss-tint text-loss-red text-xs font-medium px-3 py-1.5 rounded-lg border border-loss-red/20">
                {chartError}
              </div>
            )}

            <div className="h-full w-full">
              {candles.length > 0 ? (
                <TradeChart
                  candles={candles}
                  ticker={selectedTrade?.ticker || ''}
                  width={undefined}
                  height={undefined}
                  entryPrice={selectedTrade?.entry_price ? parseFloat(selectedTrade.entry_price) : undefined}
                  exitPrice={selectedTrade?.exit_price ? parseFloat(selectedTrade.exit_price) : undefined}
                  entryTime={selectedTrade?.entry_time || undefined}
                  exitTime={selectedTrade?.exit_time || undefined}
                  direction={selectedTrade?.side === 'SHORT' ? 'short' : 'long'}
                  size={selectedTrade?.size}
                  timeframe={timeframe}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center text-text-muted">
                    <div className="w-12 h-12 bg-neutral-fill rounded-full flex items-center justify-center mx-auto mb-2">
                      <BarChart3 className="w-6 h-6" />
                    </div>
                    <p>{chartError ?? 'No chart data available for this trade'}</p>
                    {chartError && (
                      <p className="text-xs mt-1">The trade is still loaded — try a different timeframe</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Playback Controls */}
          <div className="bg-card-bg border-t border-card-border p-4">
            <div className="flex items-center justify-between">
              {/* Playback controls */}
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => setCurrentTime(0)}>
                  <SkipBack className="w-5 h-5" />
                </Button>

                <Button variant="ghost" size="icon" onClick={togglePlayPause}>
                  {isPlaying ? (
                    <Pause className="w-6 h-6" />
                  ) : (
                    <Play className="w-6 h-6" />
                  )}
                </Button>

                <Button variant="ghost" size="icon" onClick={() => setCurrentTime(totalDuration)}>
                  <SkipForward className="w-5 h-5" />
                </Button>

                {/* Time display */}
                <div className="text-sm text-text-muted">
                  {formatTime(currentTime)} / {formatTime(totalDuration)}
                </div>

                {/* Timeline */}
                <div className="flex-1 mx-4">
                  <Slider
                    value={[currentTime]}
                    onValueChange={(value: number[]) => setCurrentTime(value[0])}
                    max={totalDuration}
                    step={1}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Right controls */}
              <div className="flex items-center gap-3">
                {/* Speed control */}
                <div className="flex items-center gap-2">
                  <Button
                    variant={playbackSpeed === 0.5 ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleSpeedChange(0.5)}
                  >
                    0.5x
                  </Button>
                  <Button
                    variant={playbackSpeed === 1 ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleSpeedChange(1)}
                  >
                    1x
                  </Button>
                  <Button
                    variant={playbackSpeed === 2 ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleSpeedChange(2)}
                  >
                    2x
                  </Button>
                </div>

                {/* Fullscreen toggle */}
                <Button variant="ghost" size="icon" onClick={toggleFullscreen}>
                  {isFullscreen ? (
                    <Minimize className="w-5 h-5" />
                  ) : (
                    <Maximize className="w-5 h-5" />
                  )}
                </Button>

                {/* Close fullscreen */}
                {isFullscreen && (
                  <Button variant="ghost" size="icon" onClick={() => setIsFullscreen(false)}>
                    <X className="w-5 h-5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Panel (when not in fullscreen) */}
      {!isFullscreen && showMetrics && selectedTrade && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Trade Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Trade Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-text-muted uppercase tracking-wider">P&L</div>
                    <div className={`text-lg font-bold tabular-nums ${selectedTrade.realized_pl && parseFloat(selectedTrade.realized_pl) > 0 ? 'text-profit-green' : 'text-loss-red'}`}>
                      {formatPL(selectedTrade.realized_pl)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-text-muted uppercase tracking-wider">Entry</div>
                    <div className="text-lg font-bold text-text-primary">
                      ${selectedTrade.entry_price ? parseFloat(selectedTrade.entry_price).toFixed(2) : '\u2014'}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-text-muted uppercase tracking-wider">Exit</div>
                    <div className="text-lg font-bold text-text-primary">
                      ${selectedTrade.exit_price ? parseFloat(selectedTrade.exit_price).toFixed(2) : '\u2014'}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-text-muted uppercase tracking-wider">Size</div>
                    <div className="text-lg font-bold text-text-primary">
                      {selectedTrade.size || '\u2014'}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Behavioral Flags */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Behavioral Flags</CardTitle>
            </CardHeader>
            <CardContent>
              {(selectedTrade.behaviorTags ?? []).length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {(selectedTrade.behaviorTags ?? []).map((tag) => (
                    <span key={tag} className="px-3 py-1 rounded-full text-sm font-medium bg-tag-neutral-bg text-tag-neutral-text">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-text-muted">No behavioral flags detected</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rule Compliance */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Rule Compliance</CardTitle>
            </CardHeader>
            <CardContent>
              {(selectedTrade.violations ?? []).length > 0 ? (
                <div className="space-y-2">
                  {(selectedTrade.violations ?? []).map((violation, index) => (
                    <div key={index} className="flex items-start gap-2 text-sm text-loss-red">
                      <span className="mt-1">•</span>
                      <span>{violation}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-text-muted">No rule violations</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
