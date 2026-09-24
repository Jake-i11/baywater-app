"use client"

import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { ShieldCheck, TrendingUp, Calendar, Trash2, Plus, Pencil, X, Check } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPL } from "@/lib/utils"
import { loadUserRules, createRule, updateRule, deleteRule } from "@/lib/rules"
import type { UserRule } from "@/lib/rules"

interface Trade {
  id: string
  ticker: string
  realized_pl: string | null
  entry_price: string | null
  exit_price: string | null
  entry_time: string | null
  exit_time: string | null
  side: string
  size: string
  discipline_score: number | null
  violations: string[] | string | null
  created_at: string
}

interface ProfileData {
  id: string
  username: string
  email: string
  created_at: string
  total_trades: number
  winning_trades: number
  losing_trades: number
  total_pl: number | null
  win_rate: number | null
  profit_factor: number | null
}

function getTradeViolations(trade: Trade): string[] {
  const v = trade.violations
  if (Array.isArray(v)) return v
  if (typeof v === 'string' && v) {
    try {
      const parsed = JSON.parse(v)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function getTradePL(trade: Trade): number | null {
  if (trade.realized_pl === null || trade.realized_pl === undefined) return null
  const pl = parseFloat(String(trade.realized_pl))
  return isNaN(pl) ? null : pl
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [timeFrame, setTimeFrame] = useState<"week" | "month" | "quarter" | "year" | "all">("month")
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetSuccess, setResetSuccess] = useState<string | null>(null)

  // Rules management
  const [rules, setRules] = useState<UserRule[]>([])
  const [rulesLoading, setRulesLoading] = useState(false)
  const [showAddRule, setShowAddRule] = useState(false)
  const [newRuleName, setNewRuleName] = useState("")
  const [newRuleDescription, setNewRuleDescription] = useState("")
  const [addRuleError, setAddRuleError] = useState<string | null>(null)
  const [savingRule, setSavingRule] = useState(false)

  // Edit rule state
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [editRuleName, setEditRuleName] = useState("")
  const [editRuleDescription, setEditRuleDescription] = useState("")

  const fetchRules = useCallback(async () => {
    setRulesLoading(true)
    const loaded = await loadUserRules()
    setRules(loaded)
    setRulesLoading(false)
  }, [])

  useEffect(() => {
    fetchProfileData()
    fetchRules()
  }, [fetchRules])

  async function handleToggleRule(rule: UserRule) {
    const updated = await updateRule(rule.id, { enabled: !rule.enabled })
    if (updated) {
      setRules(prev => prev.map(r => r.id === rule.id ? updated : r))
    }
  }

  async function handleDeleteRule(id: string) {
    const ok = await deleteRule(id)
    if (ok) setRules(prev => prev.filter(r => r.id !== id))
  }

  async function handleAddRule() {
    if (!newRuleName.trim()) return
    setAddRuleError(null)
    setSavingRule(true)
    const created = await createRule({
      name: newRuleName.trim(),
      description: newRuleDescription.trim(),
      enabled: true,
      type: 'custom',
      config: {}
    })
    setSavingRule(false)
    if (created) {
      setRules(prev => [...prev, created])
      setNewRuleName("")
      setNewRuleDescription("")
      setShowAddRule(false)
    } else {
      setAddRuleError("Failed to save rule. Please try again.")
    }
  }

  function startEditRule(rule: UserRule) {
    setEditingRuleId(rule.id)
    setEditRuleName(rule.name)
    setEditRuleDescription(rule.description)
  }

  async function handleSaveEditRule(id: string) {
    if (!editRuleName.trim()) return
    const updated = await updateRule(id, {
      name: editRuleName.trim(),
      description: editRuleDescription.trim()
    })
    if (updated) {
      setRules(prev => prev.map(r => r.id === id ? updated : r))
      setEditingRuleId(null)
    }
  }

  async function fetchProfileData() {
    try {
      setLoading(true)

      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user) {
        console.error("Auth error:", userError)
        return
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userData.user.id)
        .single()

      if (profileError) {
        console.error("Profile fetch error:", { message: profileError.message, code: profileError.code })
        return
      }

      const { data: tradesData, error: tradesError } = await supabase
        .from('trades')
        .select('*')
        .order('created_at', { ascending: false })

      if (tradesError) {
        console.error("Trades fetch error:", { message: tradesError.message, code: tradesError.code })
        return
      }

      if (profileData && tradesData) {
        const hasTrades = tradesData.length > 0
        const winningTrades = tradesData.filter(t => { const pl = getTradePL(t); return pl !== null && pl > 0 })
        const losingTrades = tradesData.filter(t => { const pl = getTradePL(t); return pl !== null && pl < 0 })
        const totalPL = tradesData.reduce((sum, trade) => sum + (getTradePL(trade) || 0), 0)
        const winRate = hasTrades ? (winningTrades.length / tradesData.length) * 100 : null
        const grossWins = winningTrades.reduce((sum, trade) => sum + Math.abs(getTradePL(trade) || 0), 0)
        const grossLosses = losingTrades.reduce((sum, trade) => sum + Math.abs(getTradePL(trade) || 0), 0)
        const profitFactor = !hasTrades ? null : grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : null

        setProfile({
          ...profileData,
          total_trades: tradesData.length,
          winning_trades: winningTrades.length,
          losing_trades: losingTrades.length,
          total_pl: hasTrades ? totalPL : null,
          win_rate: winRate,
          profit_factor: profitFactor,
        })

        setTrades(tradesData)
      }
    } catch (error) {
      console.error("Error fetching profile data:", error)
    } finally {
      setLoading(false)
    }
  }

  async function handleResetTrades() {
    try {
      setResetLoading(true)
      setResetError(null)
      setResetSuccess(null)

      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw new Error("Failed to authenticate user")
      if (!user) throw new Error("No authenticated user found")

      const { error: deleteError } = await supabase
        .from('trades')
        .delete()
        .eq('user_id', user.id)

      if (deleteError) throw new Error(`Failed to delete trades: ${deleteError.message}`)

      await fetchProfileData()
      setResetSuccess("All trades have been successfully deleted.")
    } catch (error) {
      console.error("Error resetting trades:", error)
      setResetError(error instanceof Error ? error.message : "An unknown error occurred")
    } finally {
      setResetLoading(false)
    }
  }

  const filteredTrades = trades.filter(trade => {
    const tradeDate = new Date(trade.created_at)
    const now = new Date()
    if (timeFrame === "week") return tradeDate >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    if (timeFrame === "month") return tradeDate >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    if (timeFrame === "quarter") return tradeDate >= new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    if (timeFrame === "year") return tradeDate >= new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
    return true
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-text-muted">Loading profile...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Trader Profile</h1>
      </div>

      {resetSuccess && (
        <div className="p-4 bg-profit-tint border border-profit-green rounded-lg flex items-center gap-3">
          <div className="w-6 h-6 bg-profit-green rounded-full flex items-center justify-center">
            <span className="text-white text-sm">✓</span>
          </div>
          <span className="text-profit-green">{resetSuccess}</span>
        </div>
      )}

      {resetError && (
        <div className="p-4 bg-loss-tint border border-loss-red rounded-lg flex items-center gap-3">
          <div className="w-6 h-6 bg-loss-red rounded-full flex items-center justify-center">
            <span className="text-white text-sm">!</span>
          </div>
          <span className="text-loss-red">{resetError}</span>
        </div>
      )}

      {/* Profile Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="w-20 h-20 bg-neutral-fill rounded-full flex items-center justify-center text-2xl font-bold text-text-primary">
              {profile?.username?.charAt(0).toUpperCase() || 'T'}
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-xl font-bold text-text-primary">{profile?.username || "Trader"}</h2>
                <span className="px-3 py-1 rounded-full text-sm font-medium bg-tag-neutral-bg text-tag-neutral-text">
                  Active Trader
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm text-text-muted">
                <span>Member since {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "N/A"}</span>
                <span>{profile?.email || "N/A"}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (window.confirm("Are you sure you want to delete all trades? This cannot be undone.")) {
                    handleResetTrades()
                  }
                }}
                className="px-4 py-2 border border-card-border rounded-lg hover:bg-neutral-fill transition-colors flex items-center gap-2 text-sm text-text-primary"
                disabled={loading || resetLoading}
              >
                <Trash2 className="w-4 h-4" />
                Reset Trades
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Key Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wider">Total Trades</div>
              <div className="text-2xl font-bold text-text-primary">{profile?.total_trades || 0}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wider">Win Rate</div>
              <div className="text-2xl font-bold text-text-primary">
                {profile?.win_rate != null ? `${profile.win_rate.toFixed(1)}%` : "N/A"}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wider">Profit Factor</div>
              <div className="text-2xl font-bold text-text-primary">
                {profile?.profit_factor != null ? profile.profit_factor === Infinity ? "∞" : profile.profit_factor.toFixed(2) : "N/A"}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wider">Net P&L</div>
              <div className="text-2xl font-bold tabular-nums text-profit-green">
                {profile?.total_pl != null ? formatPL(profile.total_pl.toString()) : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wider">Winning</div>
              <div className="text-2xl font-bold text-profit-green">{profile?.winning_trades || 0}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wider">Losing</div>
              <div className="text-2xl font-bold text-loss-red">{profile?.losing_trades || 0}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance by Week */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-text-muted" />
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Performance by Week</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTrades.length > 0 ? (
            <div className="h-48 flex items-end gap-1">
              {(() => {
                const now = new Date()
                const currentMonday = new Date(now)
                currentMonday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
                currentMonday.setHours(0, 0, 0, 0)

                const buckets: { key: string; label: string; pl: number }[] = []
                for (let i = 11; i >= 0; i--) {
                  const start = new Date(currentMonday)
                  start.setDate(currentMonday.getDate() - i * 7)
                  buckets.push({ key: start.toISOString(), label: `W${12 - i}`, pl: 0 })
                }

                filteredTrades.forEach(trade => {
                  const pl = getTradePL(trade)
                  if (pl === null) return
                  const d = new Date(trade.created_at)
                  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
                  d.setHours(0, 0, 0, 0)
                  const bucket = buckets.find(b => b.key === d.toISOString())
                  if (bucket) bucket.pl += pl
                })

                const maxPL = Math.max(0, ...buckets.map(b => Math.abs(b.pl)))

                return buckets.map((bucket) => {
                  const height = maxPL > 0 ? (Math.abs(bucket.pl) / maxPL) * 100 : 0
                  const isPositive = bucket.pl >= 0
                  return (
                    <div
                      key={bucket.key}
                      className="flex flex-col items-center gap-1 flex-1"
                      title={`${new Date(bucket.key).toLocaleDateString()}: ${formatPL(bucket.pl.toString())}`}
                    >
                      <div
                        className={`w-full rounded-t-sm ${isPositive ? 'bg-profit-green' : 'bg-loss-red'}`}
                        style={{ height: `${bucket.pl !== 0 ? Math.max(height, 2) : 0}px` }}
                      />
                      <span className="text-xs text-text-muted">{bucket.label}</span>
                    </div>
                  )
                })
              })()}
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center">
              <p className="text-text-muted text-sm">No trade data yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trading Rules */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Trading Rules</h2>
          <button
            onClick={() => { setShowAddRule(true); setAddRuleError(null) }}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Rule
          </button>
        </div>

        {rulesLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : rules.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <ShieldCheck className="w-10 h-10 text-text-muted mx-auto mb-3" />
              <h3 className="font-medium text-text-primary mb-1">No rules configured</h3>
              <p className="text-sm text-text-muted mb-4">
                Add rules to track rule compliance and discipline across your trades.
              </p>
              <button
                onClick={() => setShowAddRule(true)}
                className="px-4 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent/90 transition-colors"
              >
                Add your first rule
              </button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <Card key={rule.id}>
                <CardContent className="p-4">
                  {editingRuleId === rule.id ? (
                    <div className="space-y-2">
                      <input
                        value={editRuleName}
                        onChange={e => setEditRuleName(e.target.value)}
                        className="w-full px-3 py-2 border border-card-border rounded-lg bg-card-bg text-text-primary text-sm"
                        placeholder="Rule name"
                      />
                      <input
                        value={editRuleDescription}
                        onChange={e => setEditRuleDescription(e.target.value)}
                        className="w-full px-3 py-2 border border-card-border rounded-lg bg-card-bg text-text-primary text-sm"
                        placeholder="Description (optional)"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveEditRule(rule.id)}
                          disabled={!editRuleName.trim()}
                          className="flex items-center gap-1 px-3 py-1.5 bg-accent text-white rounded-lg text-sm hover:bg-accent/90 disabled:opacity-50"
                        >
                          <Check className="w-3 h-3" /> Save
                        </button>
                        <button
                          onClick={() => setEditingRuleId(null)}
                          className="flex items-center gap-1 px-3 py-1.5 border border-card-border rounded-lg text-sm hover:bg-neutral-fill text-text-primary"
                        >
                          <X className="w-3 h-3" /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleToggleRule(rule)}
                          className={`relative w-10 h-5 rounded-full transition-colors ${rule.enabled ? 'bg-accent-green' : 'bg-neutral-fill'}`}
                          aria-label={rule.enabled ? "Disable rule" : "Enable rule"}
                        >
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transform transition-transform ${rule.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                        <div>
                          <div className="font-medium text-text-primary">{rule.name}</div>
                          {rule.description && <div className="text-sm text-text-muted">{rule.description}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => startEditRule(rule)}
                          className="p-2 hover:text-accent transition-colors text-text-muted"
                          aria-label="Edit rule"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="p-2 hover:text-loss-red transition-colors text-text-muted"
                          aria-label="Delete rule"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {showAddRule && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="font-medium text-text-primary">New Rule</h3>
              {addRuleError && (
                <p className="text-sm text-loss-red">{addRuleError}</p>
              )}
              <div>
                <label className="text-xs text-text-muted uppercase tracking-wider">Rule Name *</label>
                <input
                  value={newRuleName}
                  onChange={e => setNewRuleName(e.target.value)}
                  placeholder="e.g. No trading before 9:30 AM"
                  className="mt-1 w-full px-3 py-2 border border-card-border rounded-lg bg-card-bg text-text-primary text-sm"
                  onKeyDown={e => { if (e.key === 'Enter') handleAddRule() }}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-text-muted uppercase tracking-wider">Description (optional)</label>
                <input
                  value={newRuleDescription}
                  onChange={e => setNewRuleDescription(e.target.value)}
                  placeholder="Explain what this rule enforces"
                  className="mt-1 w-full px-3 py-2 border border-card-border rounded-lg bg-card-bg text-text-primary text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddRule}
                  disabled={!newRuleName.trim() || savingRule}
                  className="px-4 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent/90 disabled:opacity-50 transition-colors"
                >
                  {savingRule ? "Saving..." : "Add Rule"}
                </button>
                <button
                  onClick={() => { setShowAddRule(false); setNewRuleName(""); setNewRuleDescription(""); setAddRuleError(null) }}
                  className="px-4 py-2 border border-card-border rounded-lg text-sm hover:bg-neutral-fill transition-colors text-text-primary"
                >
                  Cancel
                </button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent Trades */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Recent Trades</h2>
          <div className="flex items-center gap-2">
            <span className="text-text-muted text-sm">Time Frame:</span>
            <select
              value={timeFrame}
              onChange={(e) => setTimeFrame(e.target.value as "week" | "month" | "quarter" | "year" | "all")}
              className="px-3 py-2 border border-card-border rounded-lg bg-card-bg text-text-primary text-sm"
            >
              <option value="week">Last Week</option>
              <option value="month">Last Month</option>
              <option value="quarter">Last Quarter</option>
              <option value="year">Last Year</option>
              <option value="all">All Time</option>
            </select>
          </div>
        </div>

        {filteredTrades.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTrades.slice(0, 6).map((trade) => {
              const pl = getTradePL(trade)
              const isProfitable = pl !== null && pl > 0
              const entryPrice = trade.entry_price ? parseFloat(trade.entry_price) : 0
              const exitPrice = trade.exit_price ? parseFloat(trade.exit_price) : 0

              return (
                <Card key={trade.id} sentiment={isProfitable ? "profit" : "loss"}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="text-lg font-bold text-text-primary">{trade.ticker}</div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${trade.side === 'SHORT' ? 'bg-loss-tint text-loss-red' : 'bg-profit-tint text-profit-green'}`}>
                          {trade.side}
                        </span>
                      </div>
                      <div className={`text-lg font-bold tabular-nums ${isProfitable ? 'text-profit-green' : 'text-loss-red'}`}>
                        {formatPL(trade.realized_pl)}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-text-muted">Entry</div>
                        <div className="text-text-primary font-medium">${entryPrice.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-text-muted">Exit</div>
                        <div className="text-text-primary font-medium">${exitPrice.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-text-muted">Date</div>
                        <div className="text-text-primary font-medium">{new Date(trade.created_at).toLocaleDateString()}</div>
                      </div>
                      <div>
                        <div className="text-text-muted">Size</div>
                        <div className="text-text-primary font-medium">{trade.size}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <p className="text-text-muted">No trades in this time frame. Upload your trade data to see analytics.</p>
          </div>
        )}
      </div>
    </div>
  )
}
