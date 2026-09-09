"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Users,
  ArrowRight,
  Lightbulb,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatPL } from '@/lib/utils';

interface FirmAnalytics {
  organization_id: string;
  organization_name: string;
  student_count: number;
  firmAnalytics: {
    core: {
      totalTrades: number;
      winningTrades: number;
      losingTrades: number;
      winRate: number | null;
      totalPL: number;
      averagePL: number | null;
      averageReturnPct: number | null;
      profitFactor: number | null;
      avgWinningTrade: number | null;
      avgLosingTrade: number | null;
      bestTrade: number | null;
      worstTrade: number | null;
      avgHoldTimeMinutes: number | null;
    };
    direction: {
      long: Dimension;
      short: Dimension;
    };
    tickerPerformance: TickerPerf[];
    discipline: {
      averageDisciplineScore: number | null;
      cleanTrades: number;
      violationTrades: number;
      cleanTradeRate: number | null;
      totalViolations: number;
    };
    timeOfDay: Dimension[];
    setupType: Dimension[];
    stockPrice: Dimension[];
    shareSize: Dimension[];
    positionSize: Dimension[];
    relativeVolume: Dimension[];
    dayVolume: Dimension[];
    marketCap: Dimension[];
    holdTime: Dimension[];
    ruleAdherence: {
      followedRules: Dimension;
      violatedRules: Dimension;
    };
    executionScore: number;
    consistencyScore: number;
    averageExecutionScore: number | null;
    averageConsistencyScore: number | null;
    totalTrades: number;
  } | null;
}

interface Dimension {
  key: string;
  label: string;
  tradeCount: number;
  winRate: number | null;
  avgPL: number | null;
  avgReturnPct: number | null;
  totalPL: number;
}

interface TickerPerf {
  ticker: string;
  tradeCount: number;
  winRate: number | null;
  avgPL: number | null;
  totalPL: number;
}

interface RosterStudent {
  membership_id: string;
  pseudonym: string;
  joined_at: string;
  trade_count: number;
  total_pl: number;
  win_rate: number | null;
  average_discipline_score: number | null;
  last_trade_at: string | null;
}

export default function CoachAnalyticsPage() {
  const router = useRouter();
  const [firmData, setFirmData] = useState<FirmAnalytics | null>(null);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);

      // First get the coach's organizations
      const ctxRes = await fetch('/api/firm/context', { cache: 'no-store' });
      if (!ctxRes.ok) {
        setError('Not authorized');
        return;
      }
      const ctx = await ctxRes.json() as { ok: boolean; organizations: { organization_id: string; organization_name: string }[] };
      if (!ctx.ok || ctx.organizations.length === 0) {
        setError('No organizations found');
        return;
      }

      // Use the first organization
      const firstOrg = ctx.organizations[0];
      setOrgId(firstOrg.organization_id);

      // Load firm overview analytics
      const overviewRes = await fetch(`/api/analytics/coach/overview?orgId=${firstOrg.organization_id}`, { cache: 'no-store' });
      if (overviewRes.ok) {
        const data = await overviewRes.json() as FirmAnalytics;
        setFirmData(data);
      }

      // Load roster
      const rosterRes = await fetch(`/api/firm/${firstOrg.organization_id}/roster`, { cache: 'no-store' });
      if (rosterRes.ok) {
        const rosterData = await rosterRes.json() as { students: RosterStudent[] };
        setRoster(rosterData.students);
      }
    } catch (e) {
      setError('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-text-muted">Loading firm analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-loss-red mb-2">{error}</p>
          <Link href="/firm" className="text-accent hover:underline">
            Back to Firm
          </Link>
        </div>
      </div>
    );
  }

  const f = firmData?.firmAnalytics;
  const orgName = firmData?.organization_name ?? 'Firm';

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Firm Analytics</h1>
          <p className="text-sm text-text-muted mt-1">{orgName} · {firmData?.student_count ?? 0} students</p>
        </div>
        <Link
          href={`/firm/${orgId}/roster`}
          className="flex items-center gap-2 px-4 py-2 border border-card-border rounded-lg hover:bg-neutral-fill transition-colors text-sm"
        >
          <Users className="w-4 h-4" />
          View Roster
        </Link>
      </div>

      {f ? (
        <>
          {/* Core Performance Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-text-muted">Total Trades</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-text-primary">{f.core.totalTrades}</div>
                <div className="text-xs text-text-muted mt-1">
                  {f.core.winningTrades}W / {f.core.losingTrades}L
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-text-muted">Win Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {f.core.winRate != null ? `${f.core.winRate.toFixed(1)}%` : 'N/A'}
                </div>
                <div className="text-xs text-text-muted mt-1">
                  {f.core.winRate != null ? `${f.core.winningTrades} of ${f.core.winningTrades + f.core.losingTrades} with P&L` : 'No P&L data'}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-text-muted">Net P&L</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold tabular-nums ${f.core.totalPL >= 0 ? 'text-profit-green' : 'text-loss-red'}`}>
                  {formatPL(String(f.core.totalPL))}
                </div>
                <div className="text-xs text-text-muted mt-1">All trades</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-text-muted">Profit Factor</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {f.core.profitFactor != null ? f.core.profitFactor.toFixed(2) : 'N/A'}
                </div>
                <div className="text-xs text-text-muted mt-1">
                  {f.core.profitFactor != null ? 'Gross wins / losses' : 'No losses or no data'}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-text-muted">Avg Return</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {f.core.averageReturnPct != null ? `${f.core.averageReturnPct.toFixed(2)}%` : 'N/A'}
                </div>
                <div className="text-xs text-text-muted mt-1">Per trade</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-text-muted">Avg Hold</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {f.core.avgHoldTimeMinutes != null ? `${Math.round(f.core.avgHoldTimeMinutes)}m` : 'N/A'}
                </div>
                <div className="text-xs text-text-muted mt-1">Average hold time</div>
              </CardContent>
            </Card>
          </div>

          {/* Direction + Discipline Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Long vs Short */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Direction Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <DimensionRow dim={f.direction.long} />
                <DimensionRow dim={f.direction.short} />
              </CardContent>
            </Card>

            {/* Discipline Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted flex items-center gap-2">
                  <Lightbulb className="w-4 h-4" />
                  Discipline Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-primary">Avg Discipline Score</span>
                  <span className="text-sm font-bold">
                    {f.discipline.averageDisciplineScore != null ? `${Math.round(f.discipline.averageDisciplineScore)}` : 'N/A'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-primary">Clean Trades (0 violations)</span>
                  <span className="text-sm font-bold">{f.discipline.cleanTrades}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-primary">Trades with Violations</span>
                  <span className="text-sm font-bold">{f.discipline.violationTrades}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-primary">Clean Trade Rate</span>
                  <span className="text-sm font-bold">
                    {f.discipline.cleanTradeRate != null ? `${f.discipline.cleanTradeRate.toFixed(1)}%` : 'N/A'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-primary">Total Violations</span>
                  <span className="text-sm font-bold">{f.discipline.totalViolations}</span>
                </div>
                <div className="border-t border-card-border pt-3 mt-3">
                  <DimensionRow dim={f.ruleAdherence.followedRules} color="profit" />
                  <div className="mt-2" />
                  <DimensionRow dim={f.ruleAdherence.violatedRules} color="loss" />
                </div>
                <div className="border-t border-card-border pt-3 mt-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-primary">Execution Score</span>
                    <span className="font-bold">{f.executionScore}</span>
                  </div>
                  <div className="text-xs text-text-muted">
                    Setup-quality component (20 pts): N/A — behavior tags are not stored per trade.
                    Score reflects P&L + discipline components only.
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-primary">Consistency Score</span>
                    <span className="font-bold">{f.consistencyScore}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-primary">Avg Execution Score (with tags)</span>
                    <span className="font-bold">{f.averageExecutionScore != null ? `${f.averageExecutionScore}` : 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-primary">Avg Consistency Score</span>
                    <span className="font-bold">{f.averageConsistencyScore != null ? `${f.averageConsistencyScore}` : 'N/A'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Top Tickers */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Top Tickers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {f.tickerPerformance.length > 0 ? (
                  f.tickerPerformance.slice(0, 8).map(t => (
                    <div key={t.ticker} className="flex items-center justify-between text-sm py-1 border-b border-card-border last:border-0">
                      <span className="font-medium text-text-primary">{t.ticker}</span>
                      <div className="text-right">
                        <div className="text-xs text-text-muted">{t.tradeCount} trades</div>
                        <div className={`text-xs font-medium tabular-nums ${t.totalPL >= 0 ? 'text-profit-green' : 'text-loss-red'}`}>
                          {formatPL(String(t.totalPL))}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-text-muted">No ticker data</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Time of Day */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Performance by Time of Day
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {f.timeOfDay.map(dim => (
                  <DimensionCard key={dim.key} dim={dim} />
                ))}
              </div>
              {f.timeOfDay.length === 0 && (
                <p className="text-sm text-text-muted text-center py-4">No time-of-day data available</p>
              )}
            </CardContent>
          </Card>

          {/* Day Volume + Market Cap */}
          {(f.dayVolume.length > 0 || f.marketCap.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {f.dayVolume.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Day Volume Buckets</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {f.dayVolume.map(dim => (
                      <DimensionCard key={dim.key} dim={dim} />
                    ))}
                  </CardContent>
                </Card>
              )}
              {f.marketCap.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Market Cap Buckets</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {f.marketCap.map(dim => (
                      <DimensionCard key={dim.key} dim={dim} />
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Student Navigation */}
          <div className="border-t border-card-border pt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <Users className="w-5 h-5" />
                Students
              </h2>
              <Link
                href={`/firm/${orgId}/roster`}
                className="text-sm text-accent hover:underline flex items-center gap-1"
              >
                Full roster →
              </Link>
            </div>

            {roster.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {roster.map(student => (
                  <Link
                    key={student.membership_id}
                    href={`/analytics/coach/student/${student.membership_id}?orgId=${orgId}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-card-border hover:border-accent hover:bg-accent-tint/30 transition-colors"
                  >
                    <div>
                      <div className="text-sm font-medium text-text-primary">{student.pseudonym}</div>
                      <div className="text-xs text-text-muted mt-1">
                        {student.trade_count} trades · Joined {new Date(student.joined_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold tabular-nums ${student.total_pl >= 0 ? 'text-profit-green' : 'text-loss-red'}`}>
                        {formatPL(String(student.total_pl))}
                      </div>
                      <div className="text-xs text-text-muted">
                        {student.win_rate != null ? `${student.win_rate.toFixed(0)}% WR` : 'No data'}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-text-muted">No students in this firm yet</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-12">
          <p className="text-text-muted">No analytics data available</p>
        </div>
      )}
    </div>
  );
}

function DimensionRow({ dim, color }: { dim: Dimension; color?: 'profit' | 'loss' | 'neutral' }) {
  const sign = color === 'profit' ? (dim.totalPL >= 0 ? 'text-profit-green' : 'text-loss-red')
    : color === 'loss' ? 'text-loss-red' : 'text-text-primary';
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-text-primary">{dim.label}</span>
      <div className="text-right">
        <div className={`font-bold tabular-nums ${sign}`}>
          {dim.tradeCount > 0 ? formatPL(String(dim.totalPL)) : '—'}
        </div>
        <div className="text-xs text-text-muted">
          {dim.tradeCount > 0 ? `${dim.tradeCount} trades · ${dim.winRate != null ? dim.winRate.toFixed(0) : '?'}% WR` : 'No trades'}
        </div>
      </div>
    </div>
  );
}

function DimensionCard({ dim }: { dim: Dimension }) {
  const sign = dim.totalPL >= 0 ? 'text-profit-green' : 'text-loss-red';
  return (
    <div className="text-center p-3 rounded-lg border border-card-border bg-card-bg">
      <div className="text-xs text-text-muted mb-2">{dim.label}</div>
      <div className={`text-lg font-bold tabular-nums ${sign}`}>
        {dim.tradeCount > 0 ? formatPL(String(dim.totalPL)) : '—'}
      </div>
      <div className="text-xs text-text-muted mt-1">
        {dim.tradeCount > 0 ? `${dim.tradeCount} trades` : 'No trades'}
      </div>
      {dim.tradeCount > 0 && dim.winRate != null && (
        <div className="text-xs mt-1">
          Win rate: <span className="font-medium">{dim.winRate.toFixed(1)}%</span>
        </div>
      )}
      {dim.tradeCount > 0 && dim.avgReturnPct != null && (
        <div className="text-xs mt-0.5 text-text-muted">
          Avg return: {dim.avgReturnPct.toFixed(2)}%
        </div>
      )}
    </div>
  );
}
