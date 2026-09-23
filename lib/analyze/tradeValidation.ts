export function checkRules(trade: any, userRules?: Array<{enabled: boolean; type: string; config: Record<string, any>}>): string[] {
  const violations: string[] = []
  if (!trade) return violations

  // Only evaluate rules the user has explicitly configured.
  // No hardcoded rules — they generate misleading violations for every trade.
  if (!userRules || userRules.length === 0) return violations

  for (const rule of userRules) {
    if (!rule.enabled) continue
    // Rule evaluation: extend this as more rule types are added
  }

  return violations
}
