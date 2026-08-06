"use client"

import { TradeData } from "@/types/trade"
import { formatPL } from "@/lib/utils"

interface TradeSelectorProps {
  trades: TradeData[]
  selectedTradeIndex: number | null
  setSelectedTradeIndex: (index: number | null) => void
}

export default function TradeSelector({
  trades,
  selectedTradeIndex,
  setSelectedTradeIndex
}: TradeSelectorProps) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {trades.map((trade, idx) => {
        const isSelected = selectedTradeIndex === idx
        const isProfitable = trade.realized_pl && parseFloat(trade.realized_pl) > 0

        return (
          <button
            key={trade.localId}
            onClick={() => setSelectedTradeIndex(idx)}
            className={`flex flex-col items-center gap-2 px-4 py-3 rounded-lg border transition-all ${isSelected ? 'border-accent bg-accent-tint' : 'border-card-border hover:border-accent'}`}
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
  )
}