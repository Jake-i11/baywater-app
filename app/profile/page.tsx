"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { User, ShieldCheck, TrendingUp, BarChart3, Target, Calendar, Award, Star, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPL, formatNumber } from "@/lib/utils"
import Link from "next/link"

function calculateConsistencyScore(trades: Trade[]): number {
  if (trades.length === 0) return 0

  // Calculate consistency based on discipline scores, violations, and repeated mistakes
  const disciplineScores = trades.map(t => t.discipline_score || 0)
  const avgDiscipline = disciplineScores.reduce((sum, score) => sum + score, 0) / disciplineScores.length

  // Count violations
  const totalViolations = trades.reduce((sum, trade) => sum + (trade.violations?.length || 0), 0)
  const avgViolations = totalViolations / trades.length

  // Calculate consistency score (0-100)
  // Higher discipline and fewer violations = higher consistency
  const consistencyScore = Math.min(100, Math.max(0,
    avgDiscipline * 0.7 + // 70% weight to discipline
    (1 - Math.min(1, avgViolations / 5)) * 30 // 30% weight to violation reduction (max 5 violations)
  ))

  return Math.round(consistencyScore)
}

function calculateExecutionScore(trades: Trade[]): number {
  if (trades.length === 0) return 0

  // Calculate execution based on realized P&L, setup quality, and decision quality
  const totalPL = trades.reduce((sum, trade) =>
    sum + (trade.realized_pl ? parseFloat(trade.realized_pl) : 0), 0
  )
  const avgPL = totalPL / trades.length

  // Normalize P&L to a 0-100 scale (assuming typical range of -$1000 to +$1000 per trade)
  const normalizedPL = Math.min(100, Math.max(0, 50 + (avgPL / 20)))

  // Calculate execution score (0-100)
  const executionScore = Math.min(100, Math.max(0,
    normalizedPL * 0.6 + // 60% weight to P&L performance
    (trades.filter(t => t.behaviorTags?.includes('quality_setup')).length / trades.length) * 20 + // 20% weight to setup quality
    (trades.filter(t => t.discipline_score && t.discipline_score > 70).length / trades.length) * 20 // 20% weight to decision quality
  ))

  return Math.round(executionScore)
}

interface SetupPerformance {
  name: string
  percentage: number
  totalPL: number
}

function calculateSetupPerformance(trades: Trade[]): SetupPerformance[] {
  if (trades.length === 0) return []

  // Group trades by setup type (using behaviorTags as proxy for setup type)
  const setupTypes: Record<string, { count: number, totalPL: number }> = {}

  trades.forEach(trade => {
    // Look for setup type in behavior tags
    const setupType = trade.behaviorTags?.find(tag =>
      ['breakout', 'gap', 'reversal', 'pullback', 'continuation'].some(type =>
        tag.toLowerCase().includes(type)
      )
    ) || 'other'

    if (!setupTypes[setupType]) {
      setupTypes[setupType] = { count: 0, totalPL: 0 }
    }

    setupTypes[setupType].count++
    setupTypes[setupType].totalPL += trade.realized_pl ? parseFloat(trade.realized_pl) : 0
  })

  // Convert to array and calculate percentages
  return Object.entries(setupTypes).map(([name, data]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    percentage: (data.count / trades.length) * 100,
    totalPL: data.totalPL
  }))
}

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
  violations: string[]
  behaviorTags: string[]
  created_at: string
}

interface ProfileData {
  id: string
  username: string
  email: string
  created_at: string
  profile_score: number
  total_trades: number
  winning_trades: number
  losing_trades: number
  total_pl: number
  win_rate: number
  profit_factor: number
  discipline_score: number
  consistency_score: number
  execution_score: number
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [timeFrame, setTimeFrame] = useState<"week" | "month" | "quarter" | "year" | "all">("month")
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetSuccess, setResetSuccess] = useState<string | null>(null)

  useEffect(() => {
    fetchProfileData()
  }, [])

  async function fetchProfileData() {
    try {
      setLoading(true)

      // Fetch user profile data
      const { data: userData, error: userError } = await supabase.auth.getUser()

      if (userError) {
        console.error("Error fetching user:", userError)
        return
      }

      // Fetch profile statistics
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userData.user?.id)
        .single()

      if (profileError) {
       console.error("Profile fetch error:", profileError);
console.error("Profile fetch error JSON:", JSON.stringify(profileError, null, 2));
        return
      }

      // Fetch trades data
      const { data: tradesData, error: tradesError } = await supabase
        .from('trades')
        .select('*')
        .order('created_at', { ascending: false })

      if (tradesError) {
        console.error("Error fetching trades:", tradesError)
        return
      }

      if (profileData && tradesData) {
        // Calculate additional statistics
        const winningTrades = tradesData.filter(t => t.realized_pl && parseFloat(t.realized_pl) > 0)
        const losingTrades = tradesData.filter(t => t.realized_pl && parseFloat(t.realized_pl) < 0)

        const totalPL = tradesData.reduce((sum, trade) =>
          sum + (trade.realized_pl ? parseFloat(trade.realized_pl) : 0), 0
        )

        const winRate = tradesData.length > 0 ? (winningTrades.length / tradesData.length) * 100 : 0

        const grossWins = winningTrades.reduce((sum, trade) =>
          sum + (trade.realized_pl ? Math.abs(parseFloat(trade.realized_pl)) : 0), 0
        )

        const grossLosses = losingTrades.reduce((sum, trade) =>
          sum + (trade.realized_pl ? Math.abs(parseFloat(trade.realized_pl)) : 0), 0
        )

        const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0

        // Calculate discipline score (average of all trade discipline scores)
        const avgDisciplineScore = tradesData.length > 0
          ? tradesData.reduce((sum, trade) => sum + (trade.discipline_score || 0), 0) / tradesData.length
          : 0

        // Calculate consistency score based on real trade data
        const consistencyScore = calculateConsistencyScore(tradesData)

        // Calculate execution score based on real trade data
        const executionScore = calculateExecutionScore(tradesData)

        setProfile({
          ...profileData,
          total_trades: tradesData.length,
          winning_trades: winningTrades.length,
          losing_trades: losingTrades.length,
          total_pl: totalPL,
          win_rate: winRate,
          profit_factor: profitFactor,
          discipline_score: avgDisciplineScore,
          consistency_score: tradesData.length > 0 ? consistencyScore : null,
          execution_score: tradesData.length > 0 ? executionScore : null
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

      // Get current authenticated user
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError) {
        throw new Error("Failed to authenticate user")
      }

      if (!user) {
        throw new Error("No authenticated user found")
      }

      // Delete trades for the current user only
      const { error: deleteError } = await supabase
        .from('trades')
        .delete()
        .eq('user_id', user.id)

      if (deleteError) {
        throw new Error(`Failed to delete trades: ${deleteError.message}`)
      }

      // Refresh the profile data to reflect the changes
      await fetchProfileData()

      setResetSuccess("All trades have been successfully deleted.")
    } catch (error) {
      console.error("Error resetting trades:", error)
      setResetError(error instanceof Error ? error.message : "An unknown error occurred")
    } finally {
      setResetLoading(false)
    }
  }

  // Filter trades by time frame
  const filteredTrades = trades.filter(trade => {
    const tradeDate = new Date(trade.created_at)
    const now = new Date()

    if (timeFrame === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      return tradeDate >= weekAgo
    } else if (timeFrame === "month") {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      return tradeDate >= monthAgo
    } else if (timeFrame === "quarter") {
      const quarterAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      return tradeDate >= quarterAgo
    } else if (timeFrame === "year") {
      const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
      return tradeDate >= yearAgo
    }
    return true // "all" time frame
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
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Trader Profile</h1>
      </div>

      {/* Notifications */}
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
                <span>{profile?.email || "email@example.com"}</span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Link href="/settings" className="px-4 py-2 border border-card-border rounded-lg hover:bg-neutral-fill transition-colors">
                Account Settings
              </Link>
              <Link href="/analytics" className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors">
                Full Analytics
              </Link>
              <button
                onClick={() => {
                  if (window.confirm("Are you sure you want to delete all trades? This cannot be undone.")) {
                    handleResetTrades();
                  }
                }}
                className="px-4 py-2 border border-card-border rounded-lg hover:bg-neutral-fill transition-colors flex items-center gap-2"
                disabled={loading || resetLoading}
              >
                <Trash2 className="w-4 h-4" />
                Reset Trades
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profile Score and Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Score Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Profile Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center mb-4">
              <div className="relative w-32 h-32">
                <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#E9EBF1" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="40" fill="none"
                    stroke="#3B6EF6"
                    strokeWidth="8"
                    strokeDasharray="251.2"
                    strokeDashoffset="50.24"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-3xl font-bold text-text-primary">{Math.round(profile?.profile_score || 0)}</div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm mb-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-profit-green" />
                <span>Discipline: {profile?.discipline_score ? Math.round(profile.discipline_score) : 0}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-accent" />
                <span>Consistency: {profile && profile.consistency_score !== null && profile.consistency_score !== undefined ? Math.round(profile.consistency_score) : "N/A"}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full text-text-muted">●</div>
                <span>Execution: {profile && profile.execution_score !== null && profile.execution_score !== undefined ? Math.round(profile.execution_score) : "N/A"}</span>
              </div>
            </div>

            <div className="mt-4 h-2 bg-neutral-fill rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-loss-red via-yellow-500 to-profit-green" style={{ width: `${profile?.profile_score || 0}%` }} />
            </div>
          </CardContent>
        </Card>

        {/* Key Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Key Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-text-muted uppercase tracking-wider">Total Trades</div>
                  <div className="text-2xl font-bold text-text-primary">
                    {profile?.total_trades || 0}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-text-muted uppercase tracking-wider">Win Rate</div>
                  <div className="text-2xl font-bold text-text-primary">
                    {profile?.win_rate?.toFixed(1) || 0}%
                  </div>
                </div>

                <div>
                  <div className="text-xs text-text-muted uppercase tracking-wider">Profit Factor</div>
                  <div className="text-2xl font-bold text-text-primary">
                    {profile?.profit_factor?.toFixed(2) || 0.00}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-xs text-text-muted uppercase tracking-wider">Net P&L</div>
                  <div className="text-2xl font-bold tabular-nums text-profit-green">
                    {formatPL(profile?.total_pl?.toString() || "0")}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-text-muted uppercase tracking-wider">Winning Trades</div>
                  <div className="text-2xl font-bold text-profit-green">
                    {profile?.winning_trades || 0}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-text-muted uppercase tracking-wider">Losing Trades</div>
                  <div className="text-2xl font-bold text-loss-red">
                    {profile?.losing_trades || 0}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance by Week */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-text-muted" />
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Performance by Week</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-end gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((week) => {
                const height = Math.random() * 80 + 20
                const isPositive = Math.random() > 0.5
                return (
                  <div key={week} className="flex flex-col items-center gap-1 flex-1">
                    <div
                      className={`w-full rounded-t-sm ${isPositive ? 'bg-profit-green' : 'bg-loss-red'}`}
                      style={{ height: `${height}px` }}
                    />
                    <span className="text-xs text-text-muted">W{week}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Strategy Performance */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-text-muted" />
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Strategy Performance</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {trades.length > 0 ? (
              <div className="space-y-3">
                {calculateSetupPerformance(trades).map((setup, index) => (
                  <div key={index}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-text-primary font-medium">{setup.name} Trades</span>
                        <span className="text-xs text-text-muted">({setup.percentage}%)</span>
                      </div>
                      <div className={`text-sm font-bold ${setup.totalPL >= 0 ? 'text-profit-green' : 'text-loss-red'}`}>
                        {setup.totalPL >= 0 ? '+' : ''}${setup.totalPL.toFixed(2)}
                      </div>
                    </div>
                    <div className="w-full bg-neutral-fill rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${setup.totalPL >= 0 ? 'bg-profit-green' : 'bg-loss-red'}`}
                        style={{ width: `${Math.min(100, Math.abs(setup.percentage))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-32">
                <p className="text-text-muted">No trades yet - setup performance will appear here</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Behavioral Badges */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">Behavioral Badges</h2>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { name: "Disciplined Trader", description: "Consistent rule follower", icon: <ShieldCheck className="w-6 h-6" /> },
            { name: "Patient Entry", description: "Waits for confirmation", icon: <Calendar className="w-6 h-6" /> },
            { name: "Risk Manager", description: "Proper position sizing", icon: <BarChart3 className="w-6 h-6" /> },
            { name: "Consistent Performer", description: "Steady results", icon: <TrendingUp className="w-6 h-6" /> },
            { name: "Learning Machine", description: "Continuous improvement", icon: <Award className="w-6 h-6" /> },
            { name: "Pattern Recognizer", description: "Identifies setups well", icon: <Target className="w-6 h-6" /> }
          ].map((badge, index) => (
            <Card key={index} className="text-center">
              <CardContent className="p-4">
                <div className="w-12 h-12 bg-accent-tint rounded-full flex items-center justify-center mx-auto mb-3">
                  {badge.icon}
                </div>
                <h4 className="font-medium text-text-primary mb-1">{badge.name}</h4>
                <p className="text-xs text-text-muted">{badge.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent Trades */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Recent Trades</h2>
          <div className="flex items-center gap-2">
            <span className="text-text-muted">Time Frame:</span>
            <select
              value={timeFrame}
              onChange={(e) => setTimeFrame(e.target.value as "week" | "month" | "quarter" | "year" | "all")}
              className="px-3 py-2 border border-card-border rounded-lg bg-card-bg text-text-primary"
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
              const isProfitable = trade.realized_pl && parseFloat(trade.realized_pl) > 0
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

                    {/* Mini chart placeholder */}
                    <div className="h-20 bg-neutral-fill rounded-lg mb-3 flex items-end justify-center overflow-hidden">
                      <svg className="w-full h-full" viewBox="0 0 200 60">
                        <path
                          d={`M 0 ${60 - (entryPrice % 60)} L 100 ${60 - (exitPrice % 60)}`}
                          stroke={isProfitable ? "#1DA97F" : "#E5484D"}
                          strokeWidth="2"
                          fill="none"
                        />
                      </svg>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
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

                    {(trade.behaviorTags ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {(trade.behaviorTags ?? []).slice(0, 2).map((tag) => (
                          <span key={tag} className="px-2 py-1 rounded-full text-[10px] font-medium bg-tag-neutral-bg text-tag-neutral-text">
                            {tag}
                          </span>
                        ))}
                        {(trade.behaviorTags ?? []).length > 2 && (
                          <span className="text-[10px] text-text-muted">+{(trade.behaviorTags ?? []).length - 2}</span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <p className="text-text-muted">No trades yet. Upload your trade data to see analytics.</p>
          </div>
        )}
      </div>
    </div>
  )
}