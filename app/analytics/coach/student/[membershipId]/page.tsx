"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  TrendingUp,
  TrendingDown,
  ArrowLeft,
  Clock,
  Target,
  BarChart3,
  Lightbulb,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatPL } from '@/lib/utils';

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
  avgReturnPct: number | null;
  totalPL: number;
}

interface DisciplineSummary {
  averageDisciplineScore: number | null;
  cleanTrades: number;
  violationTrades: number;
  cleanTradeRate: number | null;
  totalViolations: number;
  performanceWhenClean: Dimension;
  performanceWhenViolating: Dimension;
}

interface CorePerformance {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number | null;
  lossRate: number | null;
  totalPL: number;
  averagePL: number | null;
  averageReturnPct: number | null;
  profitFactor: number | null;
  avgWinningTrade: number | null;
  avgLosingTrade: number | null;
  bestTrade: number | null;
  worstTrade: number | null;
  avgHoldTimeMinutes: number | null;
  longAvgReturnPct: number | null;
  shortAvgReturnPct: number | null;
}

interface StudentAnalytics {
  core: CorePerformance;
  timeOfDay: Dimension[];
  direction: { long: Dimension; short: Dimension };
  setupType: Dimension[];
  stockPrice: Dimension[];
  float: Dimension[];
  shareSize: Dimension[];
  positionSize: Dimension[];
  relativeVolume: Dimension[];
  dayVolume: Dimension[];
  marketCap: Dimension[];
  holdTime: Dimension[];
  tickerPerformance: TickerPerf[];
  discipline: DisciplineSummary;
  ruleAdherence: { followedRules: Dimension; violatedRules: Dimension };
  executionScore: number;
  consistencyScore: number;
  averageExecutionScore: number | null;
  averageConsistencyScore: number | null;
  totalTrades: number;
}

interface Comparison {
  winRateDiff: number | null;
  avgReturnPctDiff: number | null;
  avgPLDiff: number | null;
  avgHoldTimeDiff: number | null;
  winRateStudentAbove: boolean | null;
  avgReturnPctStudentAbove: boolean | null;
  avgPLStudentAbove: boolean | null;
  avgHoldTimeStudentAbove: boolean | null;
}

interface Props {
  params: Promise<{ membershipId: string }>;
}

export default function CoachStudentAnalyticsPage({ params }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgId = searchParams.get('orgId') ?? '';

  const [membershipId, setMembershipId] = useState<string>('');
  const [studentData, setStudentData] = useState<{
    pseudonym: string;
    joined_at: string;
    studentAnalytics: StudentAnalytics;
    firmAnalytics: StudentAnalytics | null;
    comparison: Comparison;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const { membershipId: id } = await params;
    setMembershipId(id);

    if (!orgId) {
      setError('Missing organization');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(
        `/api/analytics/coach/student?orgId=${orgId}&membershipId=${id}`,
        { cache: 'no-store' }
      );

      if (res.status === 404) {
        setError('Student not found');
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError('Failed to load analytics');
        setLoading(false);
        return;
      }

      const data = await res.json() as {
        pseudonym: string;
        joined_at: string;
        studentAnalytics: StudentAnalytics;
        firmAnalytics: StudentAnalytics | null;
        comparison: Comparison;
      };
      setStudentData(data);
    } catch {
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  }, [params, orgId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-text-muted">Loading student analytics...</p>
        </div>
      </div>
    );
  }

  if (error || !studentData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-loss-red mb-2">{error ?? 'Not found'}</p>
          <Link href={`/analytics/coach?orgId=${orgId}`} className="text-accent hover:underline">
            ← Back to Firm Analytics
          </Link>
        </div>
      </div>
    );
  }

  const { pseudonym, joined_at, studentAnalytics: s, firmAnalytics: f, comparison } = studentData;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/analytics/coach?orgId=${orgId}`}
            className="text-sm text-accent hover:underline flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Firm
          </Link>
          <h1 className="text-2xl font-bold text-text-primary">{pseudonym}</h1>
          <p className="text-sm text-text-muted mt-1">
            Joined {new Date(joined_at).toLocaleDateString()} · {s.totalTrades} trades
          </p>
        </div>
        <Link
          href={`/analytics/coach/student/${membershipId}/trades?orgId=${orgId}`}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors text-sm"
        >
          <BarChart3 className="w-4 h-4" />
          View Trades
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Core Performance with Firm Comparison */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard
          label="Total Trades"
          value={String(s.core.totalTrades)}
          subtext={`${s.core.winningTrades}W / ${s.core.losingTrades}L`}
        />
        <StatCard
          label="Win Rate"
          value={s.core.winRate != null ? `${s.core.winRate.toFixed(1)}%` : 'N/A'}
          subtext={comparison.winRateDiff != null ? `${comparison.winRateDiff > 0 ? '+' : ''}${comparison.winRateDiff.toFixed(1)}pp vs firm` : 'N/A vs firm'}
          trendDir={comparison.winRateStudentAbove}
        />
        <StatCard
          label="Net P&L"
          value={formatPL(String(s.core.totalPL))}
          subtext={comparison.avgPLDiff != null ? `${comparison.avgPLDiff > 0 ? '+' : ''}${formatPL(String(comparison.avgPLDiff))}/trade vs firm` : 'N/A vs firm'}
          trendDir={comparison.avgPLStudentAbove}
          isPL
        />
        <StatCard
          label="Avg Return"
          value={s.core.averageReturnPct != null ? `${s.core.averageReturnPct.toFixed(2)}%` : 'N/A'}
          subtext={comparison.avgReturnPctDiff != null ? `${comparison.avgReturnPctDiff > 0 ? '+' : ''}${comparison.avgReturnPctDiff.toFixed(2)}pp vs firm` : 'N/A vs firm'}
          trendDir={comparison.avgReturnPctStudentAbove}
        />
        <StatCard
          label="Profit Factor"
          value={s.core.profitFactor != null ? s.core.profitFactor.toFixed(2) : 'N/A'}
          subtext={s.core.profitFactor != null && s.core.profitFactor >= 1 ? 'Profitable' : 'Not profitable'}
        />
        <StatCard
          label="Avg Hold Time"
          value={s.core.avgHoldTimeMinutes != null ? `${Math.round(s.core.avgHoldTimeMinutes)}m` : 'N/A'}
          subtext={comparison.avgHoldTimeDiff != null ? `${comparison.avgHoldTimeDiff > 0 ? '+' : ''}${Math.round(comparison.avgHoldTimeDiff)}m vs firm` : 'N/A vs firm'}
          trendDir={comparison.avgHoldTimeStudentAbove}
        />
      </div>

      {/* Student vs Firm Comparison Bar */}
      {f && (
        <Card className="bg-accent-tint/20 border-accent/30">
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-accent flex items-center gap-2">
              <Target className="w-4 h-4" />
              Student vs Firm Comparison
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-text-muted mb-3">
              How this student compares to the firm aggregate across all authorized students.
              Sample sizes are shown for both.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <CompareRow
                label="Win Rate"
                studentVal={s.core.winRate}
                firmVal={f.core.winRate}
                diff={comparison.winRateDiff}
                studentAbove={comparison.winRateStudentAbove}
                studentN={s.core.totalTrades}
                firmN={f.core.totalTrades}
              />
              <CompareRow
                label="Avg Return %"
                studentVal={s.core.averageReturnPct}
                firmVal={f.core.averageReturnPct}
                diff={comparison.avgReturnPctDiff}
                studentAbove={comparison.avgReturnPctStudentAbove}
                studentN={s.core.totalTrades}
                firmN={f.core.totalTrades}
              />
              <CompareRow
                label="Avg P&L per Trade"
                studentVal={s.core.averagePL}
                firmVal={f.core.averagePL}
                diff={comparison.avgPLDiff}
                studentAbove={comparison.avgPLStudentAbove}
                studentN={s.core.totalTrades}
                firmN={f.core.totalTrades}
                isPL
              />
              <CompareRow
                label="Avg Hold Time (min)"
                studentVal={s.core.avgHoldTimeMinutes}
                firmVal={f.core.avgHoldTimeMinutes}
                diff={comparison.avgHoldTimeDiff}
                studentAbove={comparison.avgHoldTimeStudentAbove}
                studentN={s.core.totalTrades}
                firmN={f.core.totalTrades}
                isMinutes
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Direction + Discipline */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Direction
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">              <DimensionRow dim={s.direction.long} showN />
            <DimensionRow dim={s.direction.short} showN />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted flex items-center gap-2">
              <Lightbulb className="w-4 h-4" />
              Discipline & Execution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-primary">Avg Discipline Score</span>
              <span className="font-bold">{s.discipline.averageDisciplineScore != null ? `${Math.round(s.discipline.averageDisciplineScore)}` : 'N/A'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-primary">Execution Score</span>
              <span className="font-bold">{s.executionScore}</span>
            </div>
            <div className="text-xs text-text-muted">
              Setup-quality component (20 pts): N/A — behavior tags are not stored per trade.
              Score reflects P&L + discipline components only.
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-primary">Consistency Score</span>
              <span className="font-bold">{s.consistencyScore}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-primary">Clean Trades (0 violations)</span>
              <span className="font-bold">{s.discipline.cleanTrades}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-primary">Trades with Violations</span>
              <span className="font-bold">{s.discipline.violationTrades}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-primary">Clean Trade Rate</span>
              <span className="font-bold">{s.discipline.cleanTradeRate != null ? `${s.discipline.cleanTradeRate.toFixed(1)}%` : 'N/A'}</span>
            </div>
            <div className="border-t border-card-border pt-3 mt-3 space-y-2">
              <DimensionRow dim={s.ruleAdherence.followedRules} showN color="profit" />
              <DimensionRow dim={s.ruleAdherence.violatedRules} showN color="loss" />
            </div>
            <div className="border-t border-card-border pt-3 mt-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-primary">Avg Execution Score (with tags)</span>
                <span className="font-bold">{s.averageExecutionScore != null ? `${s.averageExecutionScore}` : 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-primary">Avg Consistency Score</span>
                <span className="font-bold">{s.averageConsistencyScore != null ? `${s.averageConsistencyScore}` : 'N/A'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Top Tickers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 max-h-64 overflow-y-auto">
            {s.tickerPerformance.length > 0 ? (
              s.tickerPerformance.slice(0, 10).map(t => (
                <div key={t.ticker} className="flex items-center justify-between text-sm py-1.5 border-b border-card-border last:border-0">
                  <span className="font-medium text-text-primary w-16">{t.ticker}</span>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-text-muted w-10 text-right">{t.tradeCount}</span>
                    <span className={`w-16 text-right font-medium tabular-nums ${t.totalPL >= 0 ? 'text-profit-green' : 'text-loss-red'}`}>
                      {formatPL(String(t.totalPL))}
                    </span>
                    {t.winRate != null && (
                      <span className="w-12 text-right text-text-muted">{t.winRate.toFixed(0)}%</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-text-muted">No ticker data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Time of Day */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Time of Day (2-hour buckets)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {s.timeOfDay.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {s.timeOfDay.map(dim => (
                <DimensionCard dim={dim} showN />
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted text-center py-4">No time-of-day data available</p>
          )}
        </CardContent>
      </Card>

      {/* Setup Type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted flex items-center gap-2">
            <Target className="w-4 h-4" />
            Setup Type
          </CardTitle>
        </CardHeader>
        <CardContent>
          {s.setupType.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {s.setupType.map(dim => (
                <DimensionCard dim={dim} showN />
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted text-center py-4">No setup type data available</p>
          )}
        </CardContent>
      </Card>

      {/* Stock Characteristics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Position Size */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Position Size (Notional)</CardTitle>
          </CardHeader>
          <CardContent>
            {s.positionSize.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {s.positionSize.map(dim => (
                  <DimensionCard key={dim.key} dim={dim} showN compact />
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-muted">No position size data available</p>
            )}
          </CardContent>
        </Card>

        {/* Share Size */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Share Size</CardTitle>
          </CardHeader>
          <CardContent>
            {s.shareSize.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {s.shareSize.map(dim => (
                  <DimensionCard key={dim.key} dim={dim} showN compact />
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-muted">No share size data available</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Hold Time */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Hold Time Buckets
          </CardTitle>
        </CardHeader>
        <CardContent>
          {s.holdTime.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {s.holdTime.map(dim => (
                <DimensionCard key={dim.key} dim={dim} showN />
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted text-center py-4">No hold time data available</p>
          )}
        </CardContent>
      </Card>      {/* Stock Price + Float (when available) */}
      {(s.stockPrice.length > 0 || s.float.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {s.stockPrice.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Entry Price Buckets</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {s.stockPrice.map(dim => (
                    <DimensionCard key={dim.key} dim={dim} showN compact />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {s.float.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Float Buckets</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {s.float.map(dim => (
                    <DimensionCard key={dim.key} dim={dim} showN compact />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Day Volume + Market Cap (when available) */}
      {(s.dayVolume.length > 0 || s.marketCap.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {s.dayVolume.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Day Volume Buckets</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {s.dayVolume.map(dim => (
                    <DimensionCard key={dim.key} dim={dim} showN compact />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {s.marketCap.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-text-muted">Market Cap Buckets</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {s.marketCap.map(dim => (
                    <DimensionCard key={dim.key} dim={dim} showN compact />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )} 

      {/* Market context note */}
      <Card className="border-dashed">
        <CardContent className="py-4 text-center">
          <p className="text-sm text-text-muted">
            Trend/market context classification (uptrend, reversal, etc.) is not yet available.
            This dimension will be added when a dedicated classification pipeline is in place.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtext,
  trendDir,
  isPL,
}: {
  label: string;
  value: string;
  subtext: string;
  trendDir?: boolean | null;
  isPL?: boolean;
  isMinutes?: boolean;
}) {
  const trendColor = trendDir === true ? 'text-profit-green' : trendDir === false ? 'text-loss-red' : '';
  const trendIcon = trendDir === true ? <TrendingUp className="w-3 h-3 inline mr-0.5" />
    : trendDir === false ? <TrendingDown className="w-3 h-3 inline mr-0.5" /> : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-lg font-bold text-text-primary">{value}</div>
        <div className={`text-xs mt-1 flex items-center ${trendColor}`}>
          {trendIcon}
          {subtext}
        </div>
      </CardContent>
    </Card>
  );
}

function DimensionRow({ dim, showN, color }: { dim: Dimension; showN?: boolean; color?: 'profit' | 'loss' | 'neutral' }) {
  const sign = color === 'profit' ? (dim.totalPL >= 0 ? 'text-profit-green' : 'text-loss-red')
    : color === 'loss' ? 'text-loss-red' : 'text-text-primary';
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <span className="text-text-primary">{dim.label}</span>
        {showN && <span className="text-xs text-text-muted">(N={dim.tradeCount})</span>}
      </div>
      <div className="text-right">
        <div className={`font-bold tabular-nums ${sign}`}>
          {dim.tradeCount > 0 ? formatPL(String(dim.totalPL)) : '—'}
        </div>
        {dim.tradeCount > 0 && (
          <div className="text-xs text-text-muted">
            {dim.winRate != null ? `${dim.winRate.toFixed(0)}% WR · ${dim.avgReturnPct != null ? dim.avgReturnPct.toFixed(2) : '?'}% ret` : 'No P&L data'}
          </div>
        )}
      </div>
    </div>
  );
}

function DimensionCard({ dim, showN, compact }: { dim: Dimension; showN?: boolean; compact?: boolean }) {
  const sign = dim.totalPL >= 0 ? 'text-profit-green' : 'text-loss-red';
  return (
    <div className={`text-center p-2 rounded-lg border border-card-border bg-card-bg ${compact ? 'py-2' : 'py-3'}`}>
      <div className="text-xs text-text-muted mb-1">
        {dim.label}
        {showN && <span className="text-text-muted/60"> · N={dim.tradeCount}</span>}
      </div>
      <div className={`text-sm font-bold tabular-nums ${sign}`}>
        {dim.tradeCount > 0 ? formatPL(String(dim.totalPL)) : '—'}
      </div>
      {dim.tradeCount > 0 && dim.winRate != null && (
        <div className="text-xs text-text-muted">{dim.winRate.toFixed(1)}% WR</div>
      )}
      {dim.tradeCount > 0 && dim.avgReturnPct != null && (
        <div className="text-xs text-text-muted">{dim.avgReturnPct.toFixed(2)}% ret</div>
      )}
    </div>
  );
}

function CompareRow({
  label,
  studentVal,
  firmVal,
  diff,
  studentAbove,
  studentN,
  firmN,
  isPL,
  isMinutes,
}: {
  label: string;
  studentVal: number | null;
  firmVal: number | null;
  diff: number | null;
  studentAbove: boolean | null;
  studentN: number;
  firmN: number;
  isPL?: boolean;
  isMinutes?: boolean;
}) {
  const formatVal = (v: number | null) => {
    if (v == null) return 'N/A';
    if (isPL) return formatPL(String(v));
    if (isMinutes) return `${Math.round(v)}m`;
    return `${v.toFixed(2)}${label.includes('%') || label.includes('Return') ? '%' : ''}`;
  };

  const diffStr = diff != null ? `${diff > 0 ? '+' : ''}${isPL ? formatPL(String(diff)) : isMinutes ? `${Math.round(diff)}m` : `${diff.toFixed(2)}pp`}` : 'N/A';

  return (
    <div className="p-3 rounded-lg border border-card-border bg-card-bg">
      <div className="text-xs text-text-muted mb-2">{label}</div>
      <div className="space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-text-muted">Student</span>
          <span className="font-medium text-text-primary">{formatVal(studentVal)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-muted">Firm</span>
          <span className="font-medium text-text-primary">{formatVal(firmVal)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-card-border pt-1.5 mt-1.5">
          <span className="text-xs text-text-muted">Diff</span>
          <span className={`text-xs font-bold ${studentAbove === true ? 'text-profit-green' : studentAbove === false ? 'text-loss-red' : 'text-text-muted'}`}>
            {diffStr}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-text-muted border-t border-card-border pt-1.5">
          <span>Student N={studentN}</span>
          <span>Firm N={firmN}</span>
        </div>
      </div>
    </div>
  );
}
