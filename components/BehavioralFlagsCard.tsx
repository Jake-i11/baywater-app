"use client"

import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Flag } from "lucide-react"

interface BehavioralFlagsCardProps {
  behaviorTags: string[]
}

export function BehavioralFlagsCard({ behaviorTags }: BehavioralFlagsCardProps) {
  // Categorize tags by sentiment
  const positiveTags = behaviorTags.filter(tag =>
    ['Disciplined Entry', 'Proper Sizing', 'Followed Plan', 'Good Execution', 'Patient Exit'].includes(tag)
  )

  const negativeTags = behaviorTags.filter(tag =>
    ['Chased Entry', 'Late Entry', 'Exited Too Early', 'Held Loser Too Long', 'Oversized Position', 'Repeated Ticker', 'Rule Violation', 'Dangerous Win', 'Revenge Trading', 'Overtrading'].includes(tag)
  )

  const neutralTags = behaviorTags.filter(tag =>
    !positiveTags.includes(tag) && !negativeTags.includes(tag)
  )

  return (
    <Card sentiment={negativeTags.length > 0 ? "loss" : positiveTags.length > 0 ? "profit" : "neutral"}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Flag className="w-5 h-5 text-text-muted" />
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">
            Behavioral Flags
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {behaviorTags.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-text-muted">No behavioral flags detected</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Positive behaviors */}
            {positiveTags.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-profit-green">Positive Behaviors</h4>
                <div className="flex flex-wrap gap-2">
                  {positiveTags.map((tag) => (
                    <span key={tag} className="px-3 py-1 rounded-full text-sm font-medium bg-profit-tint text-profit-green">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Negative behaviors */}
            {negativeTags.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-loss-red">Areas for Improvement</h4>
                <div className="flex flex-wrap gap-2">
                  {negativeTags.map((tag) => (
                    <span key={tag} className="px-3 py-1 rounded-full text-sm font-medium bg-loss-tint text-loss-red">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Neutral behaviors */}
            {neutralTags.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Neutral Observations</h4>
                <div className="flex flex-wrap gap-2">
                  {neutralTags.map((tag) => (
                    <span key={tag} className="px-3 py-1 rounded-full text-sm font-medium bg-tag-neutral-bg text-tag-neutral-text">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}