"use client"

import { TradeData } from "@/types/trade"
import { TradeChart } from "@/components/TradeChart"
import { TradeMetricsCard } from "@/components/TradeMetricsCard"
import { AIReviewCard } from "@/components/AIReviewCard"
import { BehavioralFlagsCard } from "@/components/BehavioralFlagsCard"
import { RuleComplianceCard } from "@/components/RuleComplianceCard"
import { Card } from "@/components/ui/card"
import { FileText } from "lucide-react"
import { formatNumber } from "@/lib/utils"

interface TradePreviewProps {
  selectedTrade: TradeData
  candles: any[]
  chartLoading: boolean
  chartError: string | null
  coachingResponse: any | null
  aiReviewLoading: boolean
}

export default function TradePreview({
  selectedTrade,
  candles,
  chartLoading,
  chartError,
  coachingResponse,
  aiReviewLoading
}: TradePreviewProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
      {/* Chart Area - 2/3 width */}
      <div className="lg:col-span-2 flex flex-col gap-4">
        {/* Chart Card */}
        <Card className="flex-1">
          <div className="p-4">
            <h3 className="text-base font-semibold text-text-primary mb-2">
              {selectedTrade.ticker} - Historical Price Action
            </h3>

            {chartLoading ? (
              <div className="flex items-center justify-center h-96">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  <div className="text-text-muted">Loading chart data...</div>
                </div>
              </div>
            ) : candles.length > 0 ? (
              <div className="h-96">
                <TradeChart
                  candles={candles}
                  ticker={selectedTrade.ticker}
                  width={undefined}
                  height={undefined}
                  entryPrice={selectedTrade.entry_price ? parseFloat(selectedTrade.entry_price) : undefined}
                  exitPrice={selectedTrade.exit_price ? parseFloat(selectedTrade.exit_price) : undefined}
                  entryTime={selectedTrade.entry_time || undefined}
                  exitTime={selectedTrade.exit_time || undefined}
                  tradeMetrics={selectedTrade.tradeMetrics ?? undefined}
                  direction={selectedTrade.direction}
                  size={selectedTrade.size ?? undefined}
                />
              </div>
            ) : chartError ? (
              <div className="flex flex-col items-center justify-center h-96 text-text-muted">
                <FileText className="w-12 h-12 mb-2" />
                <p className="text-sm">{chartError}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-96 text-text-muted">
                <FileText className="w-12 h-12 mb-2" />
                <p className="text-sm">No chart data available</p>
              </div>
            )}
          </div>
        </Card>

        {/* Market Context - inline metadata */}
        <div className="text-xs text-text-muted">
          <span>Market Context: </span>
          {selectedTrade.rawData?.sector && <span className="mr-2">• Sector: {selectedTrade.rawData.sector}</span>}
          {selectedTrade.rawData?.volume && <span className="mr-2">• Volume: {formatNumber(selectedTrade.rawData.volume)}</span>}
        </div>
      </div>

      {/* Right Rail - 1/3 width */}
      <div className="lg:col-span-1 flex flex-col gap-4">
        {/* Trade Metrics */}
        <TradeMetricsCard
          trade={selectedTrade}
          tradeMetrics={selectedTrade.tradeMetrics}
        />

        {/* AI Review */}
        <AIReviewCard
          aiReview={coachingResponse}
          isLoading={aiReviewLoading}
        />

        {/* Behavioral Flags */}
        <BehavioralFlagsCard
          behaviorTags={selectedTrade.behaviorTags}
        />

        {/* Rule Compliance */}
        <RuleComplianceCard
          violations={selectedTrade.violations}
          disciplineScore={selectedTrade.discipline_score}
        />
      </div>
    </div>
  )
}