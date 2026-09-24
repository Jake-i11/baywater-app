import { supabase } from './supabase'

export interface UserRule {
  id: string
  name: string
  description: string
  enabled: boolean
  type: 'max_daily_trades' | 'max_position_size' | 'allowed_tickers' | 'no_trade_after_time' | 'max_daily_loss' | 'custom'
  config: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export async function loadUserRules(): Promise<UserRule[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('user_rules')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error loading user rules:', { message: error.message, code: error.code })
    return []
  }

  return (data ?? []) as UserRule[]
}

export async function createRule(
  partial: Omit<UserRule, 'id' | 'created_at' | 'updated_at'>
): Promise<UserRule | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('user_rules')
    .insert({ ...partial, user_id: user.id })
    .select()
    .single()

  if (error) {
    console.error('Error creating rule:', { message: error.message, code: error.code })
    return null
  }

  return data as UserRule
}

export async function updateRule(
  id: string,
  updates: Partial<Omit<UserRule, 'id' | 'created_at'>>
): Promise<UserRule | null> {
  const { data, error } = await supabase
    .from('user_rules')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating rule:', { message: error.message, code: error.code })
    return null
  }

  return data as UserRule
}

export async function deleteRule(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('user_rules')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting rule:', { message: error.message, code: error.code })
    return false
  }

  return true
}
