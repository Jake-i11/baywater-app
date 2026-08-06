"use client"

import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Sparkles } from "lucide-react"

interface AIReviewCardProps {
  aiReview: any
  isLoading: boolean
}

export function AIReviewCard({ aiReview, isLoading }: AIReviewCardProps) {
  return (
    <Card sentiment="accent">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent" />
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">
            AI Trade Review
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="flex flex-col items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <div className="text-sm text-text-muted">Analyzing your trade with AI...</div>
            </div>
          </div>
        ) : aiReview ? (
          <div className="space-y-4">
            {/* Summary and Grade */}
            {aiReview.summary && (
              <div className="bg-accent-tint p-3 rounded-lg">
                <p className="text-text-primary font-medium">{aiReview.summary}</p>
                {aiReview.grade && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-text-muted">Trade Grade:</span>
                    <span className={`text-lg font-bold ${aiReview.grade.score >= 70 ? 'text-profit-green' : aiReview.grade.score >= 40 ? 'text-yellow-500' : 'text-loss-red'}`}>
                      {aiReview.grade.score}/100
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* What Went Well */}
            {aiReview.whatWentWell && aiReview.whatWentWell.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-profit-green">What You Did Well</h4>
                <ul className="space-y-2">
                  {aiReview.whatWentWell.map((item: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-text-primary">
                      <span className="mt-0.5 shrink-0 text-profit-green">&#10003;</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Mistakes */}
            {aiReview.mistakes && aiReview.mistakes.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-loss-red">Mistakes</h4>
                <ul className="space-y-2">
                  {aiReview.mistakes.map((mistake: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-text-primary">
                      <span className="mt-0.5 shrink-0 text-loss-red">&#9888;</span>
                      <span>{mistake}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Behavioral Insights */}
            {aiReview.behavioralInsight && aiReview.behavioralInsight.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-text-primary">Behavioral Insights</h4>
                <ul className="space-y-2">
                  {aiReview.behavioralInsight.map((insight: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-text-primary">
                      <span className="mt-0.5 shrink-0 text-text-muted">&#9679;</span>
                      <span>{insight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action Items */}
            {aiReview.actionItems && aiReview.actionItems.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-text-primary">Next Actions</h4>
                <ul className="space-y-2">
                  {aiReview.actionItems.map((item: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-text-primary">
                      <span className="mt-0.5 shrink-0 text-text-muted">&#9654;</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-text-muted">
              AI coaching will be generated after analysis is complete.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}