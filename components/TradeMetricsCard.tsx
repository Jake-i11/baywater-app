"use client"

import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { formatPL } from "@/lib/utils"

interface TradeMetricsCardProps {
  trade: any
  tradeMetrics?: any
}

export function TradeMetricsCard({ trade, tradeMetrics }: TradeMetricsCardProps) {
  const isProfitable = trade.realized_pl && parseFloat(trade.realized_pl) > 0
  const plValue = trade.realized_pl ? parseFloat(trade.realized_pl) : 0

  // Calculate R:R if we have entry/exit and MFE/MAE
  let riskReward = null
  if (tradeMetrics?.mae && plValue) {
    const risk = Math.abs(tradeMetrics.mae)
    const reward = Math.abs(plValue)
    riskReward = risk > 0 ? (reward / risk).toFixed(2) : null
  }

  return (
    <Card sentiment={isProfitable ? "profit" : "loss"}>
      <CardHeader>
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">
          Trade Metrics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wider">P&L</div>
              <div className={`text-lg font-bold tabular-nums ${isProfitable ? 'text-profit-green' : 'text-loss-red'}`}>
                {formatPL(trade.realized_pl)}
              </div>
            </div>

            <div>
              <div className="text-xs text-text-muted uppercase tracking-wider">R:R</div>
              <div className="text-lg font-bold text-text-primary">
                {riskReward || '\u2014'}
              </div>
            </div>

            <div>
              <div className="text-xs text-text-muted uppercase tracking-wider">Hold Time</div>
              <div className="text-lg font-bold text-text-primary">
                {trade.holdTime || '\u2014'}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wider">Position Size</div>
              <div className="text-lg font-bold text-text-primary">
                {trade.size || '\u2014'}
              </div>
            </div>

            <div>
              <div className="text-xs text-text-muted uppercase tracking-wider">Entry</div>
              <div className="text-lg font-bold text-text-primary">
                ${trade.entry_price ? parseFloat(trade.entry_price).toFixed(2) : '\u2014'}
              </div>
            </div>

            <div>
              <div className="text-xs text-text-muted uppercase tracking-wider">Exit</div>
              <div className="text-lg font-bold text-text-primary">
                ${trade.exit_price ? parseFloat(trade.exit_price).toFixed(2) : '\u2014'}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-card-border">
          <div className="text-xs text-text-muted uppercase tracking-wider mb-2">Additional Metrics</div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-text-muted">Date/Time</div>
              <div className="text-text-primary">{trade.displayTime || '\u2014'}</div>
            </div>
            <div>
              <div className="text-text-muted">Ticker</div>
              <div className="text-text-primary font-medium">{trade.ticker}</div>
            </div>
            <div>
              <div className="text-text-muted">Side</div>
              <div className="text-text-primary">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${trade.side === 'SHORT' ? 'bg-loss-tint text-loss-red' : 'bg-profit-tint text-profit-green'}`}>
                  {trade.side}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}