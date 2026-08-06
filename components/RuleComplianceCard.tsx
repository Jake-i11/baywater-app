"use client"

import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Check, X, ShieldCheck } from "lucide-react"

interface RuleComplianceCardProps {
  violations: string[]
  disciplineScore: number | null
}

export function RuleComplianceCard({ violations, disciplineScore }: RuleComplianceCardProps) {
  // Sample rules - these should come from the actual rules system
  const allRules = [
    "Followed trading plan",
    "Proper position sizing",
    "Respected max loss limits",
    "No revenge trading",
    "Waited for confirmation",
    "No averaging down",
    "Traded within allowed hours",
    "Stuck to watchlist tickers"
  ]

  // Determine compliance status for each rule
  const ruleStatuses = allRules.map(rule => {
    const isViolated = violations.some(v =>
      rule.toLowerCase().includes(v.toLowerCase()) ||
      v.toLowerCase().includes(rule.toLowerCase())
    )
    return {
      rule,
      compliant: !isViolated
    }
  })

  const complianceRate = ruleStatuses.filter(r => r.compliant).length / ruleStatuses.length

  return (
    <Card sentiment={complianceRate >= 0.8 ? "profit" : complianceRate >= 0.5 ? "neutral" : "loss"}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-text-muted" />
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">
            Rule Compliance
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Compliance summary */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wider">Compliance Rate</div>
              <div className="text-2xl font-bold text-text-primary">
                {Math.round(complianceRate * 100)}%
              </div>
            </div>
            {disciplineScore !== null && (
              <div className="text-right">
                <div className="text-xs text-text-muted uppercase tracking-wider">Discipline Score</div>
                <div className={`text-2xl font-bold ${disciplineScore >= 80 ? 'text-profit-green' : disciplineScore >= 50 ? 'text-yellow-500' : 'text-loss-red'}`}>
                  {disciplineScore}/100
                </div>
              </div>
            )}
          </div>

          {/* Rule checklist */}
          <div className="space-y-3">
            {ruleStatuses.map((status, index) => (
              <div key={index} className="flex items-center justify-between p-2 rounded-lg hover:bg-neutral-fill transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${status.compliant ? 'bg-profit-green/20' : 'bg-loss-red/20'}`}>
                    {status.compliant ? (
                      <Check className={`w-4 h-4 ${status.compliant ? 'text-profit-green' : 'text-loss-red'}`} />
                    ) : (
                      <X className={`w-4 h-4 ${status.compliant ? 'text-profit-green' : 'text-loss-red'}`} />
                    )}
                  </div>
                  <span className={`text-sm ${status.compliant ? 'text-text-primary' : 'text-text-muted'}`}>
                    {status.rule}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Violations summary */}
          {violations.length > 0 && (
            <div className="mt-4 pt-4 border-t border-card-border">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-loss-red mb-2">Violations</h4>
              <ul className="space-y-1 text-sm">
                {violations.map((violation, index) => (
                  <li key={index} className="flex items-start gap-2 text-loss-red">
                    <span className="mt-1">•</span>
                    <span>{violation}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}