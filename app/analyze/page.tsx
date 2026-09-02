"use client"

import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import type { User } from "@supabase/supabase-js"
import { formatPL, formatNumber } from "@/lib/utils"
import {
  calculateViolationCost,
  calculateDisciplineScore,
  checkDangerousWin,
  calculateTradeMetricsForTrade
} from "@/lib/trade-utils"
import type { TradeData } from "@/types/trade"
import UploadArea from "@/components/analyze/UploadArea"
import TradeSelector from "@/components/analyze/TradeSelector"
import TradePreview from "@/components/analyze/TradePreview"
import { fetchOrGenerateAIReview } from "@/lib/analyze/aiPipeline"
import { saveTradesToSupabase } from "@/lib/analyze/supabaseTradeInsert"
import { parseCSVContent } from "@/lib/analyze/csvParser"
import { checkRules } from "@/lib/analyze/tradeValidation"
import {
  computeHoldTime,
  computePLValue,
  normalizeSide,
  parseTradeTime
} from "@/lib/analyze/tradeCalculations"

export default function AnalyzePage() {
  const [file, setFile] = useState<File | null>(null)
  const [trades, setTrades] = useState<TradeData[]>([])
  const [selectedTradeIndex, setSelectedTradeIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [candles, setCandles] = useState<any[]>([])
  const [chartLoading, setChartLoading] = useState(false)
  const [coachingResponse, setCoachingResponse] = useState<any | null>(null)
  const [aiReviewLoading, setAiReviewLoading] = useState(false)
  const [chartError, setChartError] = useState<string | null>(null)
  const [analysisPhase, setAnalysisPhase] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<{
    success: boolean
    message: string
    tradeCount?: number
  } | null>(null)
  const [showFailureMessage, setShowFailureMessage] = useState<string | null>(null)

  const pendingChartTrade = useRef<string | null>(null)
  const pendingReviewTrade = useRef<string | null>(null)

  const selectedTrade = selectedTradeIndex !== null ? trades[selectedTradeIndex] : null

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  // Handle trade selection changes
  useEffect(() => {
    if (selectedTradeIndex === null || selectedTradeIndex >= trades.length) {
      setCandles([])
      setCoachingResponse(null)
      setChartError(null)
      return
    }

    const trade = trades[selectedTradeIndex]
    if (!trade) return

    const tradeId = trade.localId
    pendingChartTrade.current = tradeId
    pendingReviewTrade.current = null

    // Check chart cache first
    if (trade.chartData) {
      setCandles(trade.chartData.candles)
      setChartLoading(false)
      setChartError(null)
    } else {
      // Fetch chart data separately — failures here must never affect the trade
      fetchChartData(trade.ticker, trade.entry_time, trade.exit_time, tradeId)
    }

    setCoachingResponse(null)

    // Fetch AI review if user is logged in and trade has an ID
    if (user && trade.id) {
      fetchOrGenerateAIReview(
        trade.id,
        trade.ticker,
        setCoachingResponse,
        setAiReviewLoading,
        setTrades,
        trades,
        pendingReviewTrade
      )
    }
  }, [selectedTradeIndex, trades, user])

  async function fetchChartData(
    ticker: string,
    entryTimeStr: string | null | undefined,
    exitTimeStr: string | null | undefined,
    requestId?: string
  ) {
    try {
      setChartLoading(true)
      setCandles([])
      setChartError(null)

      if (!entryTimeStr) {
        console.warn(`fetchChartData: skipping chart fetch for ${ticker} — no entry time provided`)
        return
      }

      const response = await fetch("/api/chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          startTime: new Date(entryTimeStr).toISOString(),
          endTime: exitTimeStr ? new Date(exitTimeStr).toISOString() : new Date(new Date(entryTimeStr).getTime() + 2 * 60 * 60 * 1000).toISOString(),
        }),
      })

      if (requestId && pendingChartTrade.current !== requestId) return

      if (response.ok) {
        const chartData = await response.json()
        const candlesCount = chartData.candles?.length || 0

        if (requestId && pendingChartTrade.current !== requestId) return

        if (candlesCount > 0) {
          setTrades(prev => prev.map(t =>
            t.localId === requestId
              ? {
                  ...t,
                  chartData: { candles: chartData.candles, fetchedAt: Date.now() },
                  tradeMetrics: calculateTradeMetricsForTrade(t, chartData.candles)
                }
              : t
          ))
          setCandles(chartData.candles)
        } else {
          console.warn(`Chart API returned 0 candles for ${ticker}`)
          setChartError(`No chart data returned for ${ticker}`)
        }
      } else {
        let errorMsg = response.statusText
        try {
          const errBody = await response.json()
          if (errBody.error) errorMsg = errBody.error
        } catch {}
        console.error("Failed to fetch chart data:", errorMsg)
        if (!requestId || pendingChartTrade.current === requestId) {
          setChartError(`Chart fetch failed: ${errorMsg}`)
        }
      }
    } catch (error) {
      console.error("Error fetching chart data:", error)
      if (!requestId || pendingChartTrade.current === requestId) {
        setChartError(`Error fetching chart data: ${error instanceof Error ? error.message : String(error)}`)
      }
    } finally {
      if (!requestId || pendingChartTrade.current === requestId) {
        setChartLoading(false)
      }
    }
  }

  async function handleUpload(uploadedFile = file) {
    console.log("[UPLOAD] handleUpload called", uploadedFile)
    if (!uploadedFile) {
      console.log("[UPLOAD] No file provided")
      return
    }
    console.log("[UPLOAD] Processing file:", uploadedFile.name)
    setLoading(true)
    setTrades([])
    setSelectedTradeIndex(null)
    setCandles([])
    setCoachingResponse(null)
    setChartLoading(false)
    setAnalysisResult(null)
    setShowFailureMessage(null)

    try {
      if (uploadedFile.name.endsWith('.csv')) {
        setAnalysisPhase("Parsing trades...")
        await new Promise(r => setTimeout(r, 50))

        const content = await uploadedFile.text()
        const parsedTrades = parseCSVContent(content)

        // [ANALYZE] Debugging logs
        console.log('[ANALYZE] Extracted trades count:', parsedTrades.length)
        if (parsedTrades.length > 0) {
          console.log('[ANALYZE] First extracted trade:', parsedTrades[0])
        }

        if (parsedTrades.length === 0) {
          setShowFailureMessage("No trades found. Please check that your CSV format contains valid trade information.")
          setLoading(false)
          return
        }

        // Build TradeData[] with local violations/display info
        const tradeList: TradeData[] = parsedTrades.map((trade: any, idx: number) => {
          const entryPrice = trade.entry_price || trade.price || null
          const exitPrice = trade.exit_price || null
          const entryTime = trade.entry_time || trade.timestamp || null
          const exitTime = trade.exit_time || null
          const realizedPl = trade.realized_pl ? parseFloat(trade.realized_pl) : null

          let tradeViolations = checkRules({
            ticker: trade.ticker,
            price: entryPrice ? parseFloat(entryPrice) : undefined,
            time: entryTime
          })
          tradeViolations = checkDangerousWin(tradeViolations, realizedPl)
          const violationCost = calculateViolationCost(tradeViolations, realizedPl)
          const disciplineScore = calculateDisciplineScore(tradeViolations)

          // Precomputed P&L
          let computedPL: string | null
          if (realizedPl !== null && !isNaN(realizedPl)) {
            computedPL = realizedPl.toFixed(2)
          } else {
            const fallbackPL = computePLValue({
              entry_price: entryPrice,
              exit_price: exitPrice,
              size: trade.size,
              direction: trade.direction
            })
            computedPL = fallbackPL !== null ? fallbackPL.toFixed(2) : null
          }

          // Precomputed hold time
          const holdTime = computeHoldTime(entryTime, exitTime)

          // Normalized side
          const side = normalizeSide(trade.direction)

          let displayTime: string
          if (entryTime) {
            const parsed = parseTradeTime(entryTime)
            if (parsed) {
              displayTime = parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
            } else {
              const d = new Date(entryTime)
              if (!isNaN(d.getTime())) {
                displayTime = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
              } else {
                displayTime = entryTime
              }
            }
          } else if (trade.timestamp) {
            const parsed = parseTradeTime(trade.timestamp)
            displayTime = parsed ? parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : trade.timestamp
          } else {
            displayTime = 'Missing'
          }

          return {
            localId: `trade_${Date.now()}_${idx}`,
            id: undefined,
            ticker: trade.ticker,
            direction: trade.direction ? trade.direction.toLowerCase() : 'long',
            side,
            entry_price: entryPrice,
            exit_price: exitPrice,
            size: trade.size,
            entry_time: entryTime,
            exit_time: exitTime,
            timestamp: trade.timestamp || entryTime || null,
            realized_pl: computedPL,
            holdTime,
            violations: tradeViolations,
            violationsCount: tradeViolations.length,
            discipline_score: disciplineScore,
            violation_cost: violationCost.toFixed(2),
            displayTime,
            chartData: null,
            tradeMetrics: null,
            aiReview: null,
            aiReviewGeneratedAt: null,
            behaviorTags: [],
            behaviorSeverity: 'low',
            behaviorSummary: '',
            rawData: trade
          }
        })

        setAnalysisPhase("Processing trades...")
        await new Promise(r => setTimeout(r, 50))

        // [DB INSERT] Debugging logs
        console.log('[DB INSERT] Current authenticated user:', user)
        console.log('[DB INSERT] User ID:', user?.id)

        // Save trades to Supabase if user is authenticated
        if (user) {
          setAnalysisPhase("Saving trades to database...")
          await saveTradesToSupabase(tradeList, user.id, setTrades, setShowFailureMessage)
        } else {
          console.log('[DB INSERT] No authenticated user - trades will not be saved')
          setShowFailureMessage("You need to be logged in to save trades. Please sign in to save your analyzed trades.")
        }

        setTrades(tradeList)
        if (tradeList.length > 0) {
          setSelectedTradeIndex(0)
          setAnalysisResult({
            success: true,
            message: `CSV analyzed successfully. Found ${tradeList.length} trade${tradeList.length === 1 ? '' : 's'}.`,
            tradeCount: tradeList.length
          })
          setShowFailureMessage(null)
        } else {
          setAnalysisResult(null)
          setShowFailureMessage("No trades found. Please check that your CSV format contains valid trade information.")
        }
        setAnalysisPhase(null)
      } else if (uploadedFile.type.startsWith('image/')) {
        // Handle screenshot analysis
        console.log("[UPLOAD] starting screenshot analysis")
        setAnalysisPhase("Analyzing screenshot...")
        await new Promise(r => setTimeout(r, 50))

        try {
          console.log("[UPLOAD] creating FormData")
          const formData = new FormData()
          formData.append('file', uploadedFile)

          console.log("[UPLOAD] sending POST /api/analyze")
          const response = await fetch('/api/analyze', {
            method: 'POST',
            body: formData
          })
          console.log("[UPLOAD] response received, status:", response.status)

          let tradeData: any = null
          try {
            tradeData = await response.json()
          } catch {
            tradeData = null
          }

          if (!response.ok) {
            const apiError = tradeData?.error || response.statusText || `HTTP ${response.status}`
            console.error("[UPLOAD] Screenshot analysis failed:", apiError)
            setShowFailureMessage(`Failed to analyze screenshot: ${apiError}`)
            return
          }

          if (!tradeData || !tradeData.ticker) {
            console.warn("[UPLOAD] No trade data extracted from screenshot")
            setShowFailureMessage("No trades found. Please check that your screenshot contains valid trade information.")
            return
          }

          // Compute violations/discipline the same way the CSV path does
          const realizedPl = tradeData.realized_pl ? parseFloat(tradeData.realized_pl) : null
          let tradeViolations = checkRules({
            ticker: tradeData.ticker,
            price: tradeData.entry ? parseFloat(tradeData.entry) : undefined,
            time: tradeData.time
          })
          tradeViolations = checkDangerousWin(tradeViolations, realizedPl)
          const violationCost = calculateViolationCost(tradeViolations, realizedPl)
          const disciplineScore = calculateDisciplineScore(tradeViolations)

          console.log("[UPLOAD] parsed trade:", {
            ticker: tradeData.ticker,
            entry: tradeData.entry,
            exit: tradeData.exit,
            size: tradeData.size,
            time: tradeData.time,
            exit_time: tradeData.exit_time
          })

          // Build TradeData from screenshot analysis
          const tradeList: TradeData[] = [{
            localId: `trade_${Date.now()}_0`,
            id: undefined,
            ticker: tradeData.ticker,
            direction: tradeData.direction ? tradeData.direction.toLowerCase() : 'long',
            side: normalizeSide(tradeData.direction),
            entry_price: tradeData.entry,
            exit_price: tradeData.exit,
            size: tradeData.size,
            entry_time: tradeData.time,
            exit_time: tradeData.exit_time,
            timestamp: tradeData.time || null,
            realized_pl: computePLValue({
              entry_price: tradeData.entry,
              exit_price: tradeData.exit,
              size: tradeData.size,
              direction: tradeData.direction
            })?.toFixed(2) || null,
            holdTime: computeHoldTime(tradeData.time, tradeData.exit_time),
            violations: tradeViolations,
            violationsCount: tradeViolations.length,
            discipline_score: disciplineScore,
            violation_cost: violationCost.toFixed(2),
            displayTime: tradeData.time ? new Date(tradeData.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : 'Missing',
            chartData: null,
            tradeMetrics: null,
            aiReview: null,
            aiReviewGeneratedAt: null,
            behaviorTags: [],
            behaviorSeverity: 'low',
            behaviorSummary: '',
            rawData: tradeData
          }]

          // [DB INSERT] Debugging logs
          console.log('[DB INSERT] Current authenticated user:', user)
          console.log('[DB INSERT] User ID:', user?.id)

          // Save trade to Supabase if user is authenticated. saveTradesToSupabase
          // internally calls setTrades() with the DB ids, so don't clobber them here.
          if (user) {
            setAnalysisPhase("Saving trades to database...")
            try {
              await saveTradesToSupabase(tradeList, user.id, setTrades, setShowFailureMessage)
            } catch (saveErr) {
              console.error("[DB INSERT] Failed to save trade:", saveErr)
              // Still show the parsed trade locally so it doesn't silently disappear
              setTrades(tradeList)
              setShowFailureMessage(`Failed to save trade: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`)
            }
          } else {
            console.log('[DB INSERT] No authenticated user - trades will not be saved')
            setTrades(tradeList)
            setShowFailureMessage("You need to be logged in to save trades. Please sign in to save your analyzed trades.")
          }

          setSelectedTradeIndex(0)
          setAnalysisResult({
            success: true,
            message: `Screenshot analyzed successfully. Found ${tradeList.length} trade${tradeList.length === 1 ? '' : 's'}.`,
            tradeCount: tradeList.length
          })
        } catch (error) {
          console.error("Error analyzing screenshot:", error)
          setShowFailureMessage(`Failed to analyze screenshot: ${error instanceof Error ? error.message : String(error)}`)
        }
        setAnalysisPhase(null)
      } else {
        setShowFailureMessage("Unsupported file type. Please upload a CSV file or screenshot image.")
      }
     } catch (error) {
       console.error("Error handling upload:", error)
       setShowFailureMessage(`Analysis failed: ${error instanceof Error ? error.message : String(error)}`)
     } finally {
       setLoading(false)
       setAnalysisPhase(null)
     }
  }

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Upload Section */}
      <UploadArea
        file={file}
        setFile={setFile}
        loading={loading}
        analysisPhase={analysisPhase}
        analysisResult={analysisResult}
        showFailureMessage={showFailureMessage}
        handleUpload={handleUpload}
      />

      {/* Trade Selector */}
      {trades.length > 0 && (
        <TradeSelector
          trades={trades}
          selectedTradeIndex={selectedTradeIndex}
          setSelectedTradeIndex={setSelectedTradeIndex}
        />
      )}

      {/* Main Content Area */}
      {selectedTrade && (
        <TradePreview
          selectedTrade={selectedTrade}
          candles={candles}
          chartLoading={chartLoading}
          chartError={chartError}
          coachingResponse={coachingResponse}
          aiReviewLoading={aiReviewLoading}
        />
      )}
    </div>
  )
}