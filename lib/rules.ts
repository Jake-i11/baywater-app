// User-configurable trading rules, stored in localStorage.
// Will be migrated to Supabase user_rules table when migration is applied.

export interface UserRule {
  id: string
  name: string
  description: string
  enabled: boolean
  type: 'max_daily_trades' | 'max_position_size' | 'allowed_tickers' | 'no_trade_after_time' | 'max_daily_loss' | 'custom'
  config: Record<string, any>
}

const RULES_KEY = 'baywater_user_rules'

export function loadUserRules(): UserRule[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(RULES_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveUserRules(rules: UserRule[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(RULES_KEY, JSON.stringify(rules))
  } catch {
    console.error('Failed to save user rules')
  }
}

export function createRule(partial: Omit<UserRule, 'id'>): UserRule {
  return { ...partial, id: `rule_${Date.now()}_${Math.random().toString(36).slice(2)}` }
}
