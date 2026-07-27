"use client";

import React, { useMemo } from "react";
import { TrendingUp, TrendingDown, AlertTriangle, Target, Clock, DollarSign, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TradeBehaviors } from "@/lib/trade-behavior-tags";

// ─── Trade shape consumed by the dashboard ────────────────────────────────

export interface DashboardTrade {
  side: string;
  realized_pl: string | null;
  size: string;
  holdTime: string;
  ticker: string;
  violations: string[];
  violationsCount: number;
  behaviorTags?: string[];
  behaviorSeverity?: string;
  [key: string]: any;
}

// ─── Aggregated patterns ─────────────────────────────────────────────────

interface PatternCount {
  label: string;
  count: number;
  severity: 'low' | 'medium' | 'high';
}

interface DashboardStats {
  totalTrades: number;
  winRate: number;
  averageHoldTime: string;
  averageWinner: number;
  averageLoser: number;
  mostTradedTicker: string;
  mostCommonViolation: string;
}

interface DashboardData {
  topMistakes: PatternCount[];
  topStrengths: PatternCount[];
  stats: DashboardStats;
  patternTrend: 'improving' | 'declining' | 'stable' | 'unknown';
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getNumericPL(t: DashboardTrade): number | null {
  if (t.realized_pl === null || t.realized_pl === 'null') return null;
  const pl = parseFloat(t.realized_pl);
  return isNaN(pl) ? null : pl;
}

function parseHoldTimeToMinutes(holdTime: string): number {
  if (!holdTime || holdTime === "Open trade") return 0;
  if (holdTime === "<1m") return 0.5;
  const hourMatch = holdTime.match(/(\d+)\s*h/);
  const minMatch = holdTime.match(/(\d+)\s*m/);
  const hours = hourMatch ? parseInt(hourMatch[1], 10) : 0;
  const minutes = minMatch ? parseInt(minMatch[1], 10) : 0;
  return hours * 60 + minutes;
}

function formatMinutes(mins: number): string {
  if (mins < 1) return "<1m";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatPL(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}$${value.toFixed(2)}`;
}

// ─── Dashboard Builder ────────────────────────────────────────────────────

function buildDashboardData(trades: DashboardTrade[]): DashboardData | null {
  if (trades.length < 2) return null;

  // ── Behavior tag aggregation ──
  const mistakeTags = ['Chased Entry', 'Late Entry', 'Exited Too Early', 'Held Loser Too Long', 'Oversized Position', 'Repeated Ticker', 'Rule Violation', 'Dangerous Win'];
  const strengthTags = ['Good Timing', 'Good Exit'];

  const tagCounts: Record<string, number> = {};
  for (const t of trades) {
    if (t.behaviorTags) {
      for (const tag of t.behaviorTags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
  }

  const topMistakes: PatternCount[] = mistakeTags
    .map(label => ({ label, count: tagCounts[label] || 0, severity: label === 'Dangerous Win' || label === 'Held Loser Too Long' || label === 'Oversized Position' ? 'high' as const : 'medium' as const }))
    .filter(m => m.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const topStrengths: PatternCount[] = strengthTags
    .map(label => ({ label, count: tagCounts[label] || 0, severity: 'low' as const }))
    .filter(s => s.count > 0)
    .sort((a, b) => b.count - a.count);

  // ── Statistics ──
  const plValues: number[] = [];
  const winners: number[] = [];
  const losers: number[] = [];
  let totalHoldMinutes = 0;
  let holdCount = 0;

  const tickerCounts: Record<string, number> = {};
  const violationCounts: Record<string, number> = {};

  for (const t of trades) {
    const pl = getNumericPL(t);
    if (pl !== null) {
      plValues.push(pl);
      if (pl > 0) winners.push(pl);
      else if (pl < 0) losers.push(pl);
    }

    const mins = parseHoldTimeToMinutes(t.holdTime || '');
    if (mins > 0) {
      totalHoldMinutes += mins;
      holdCount++;
    }

    const ticker = (t.ticker || '').toUpperCase();
    if (ticker) tickerCounts[ticker] = (tickerCounts[ticker] || 0) + 1;

    for (const v of t.violations || []) {
      violationCounts[v] = (violationCounts[v] || 0) + 1;
    }
  }

  const winRate = plValues.length > 0
    ? Math.round((winners.length / plValues.length) * 100)
    : 0;

  const avgHoldTime = holdCount > 0 ? formatMinutes(totalHoldMinutes / holdCount) : 'N/A';
  const averageWinner = winners.length > 0 ? winners.reduce((s, p) => s + p, 0) / winners.length : 0;
  const averageLoser = losers.length > 0 ? Math.abs(losers.reduce((s, p) => s + p, 0)) / losers.length : 0;

  const mostTradedTicker = Object.entries(tickerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 1)
    .map(([t]) => t)[0] || 'N/A';

  const mostCommonViolation = Object.entries(violationCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 1)
    .map(([v]) => v)[0] || 'None';

  // ── Pattern trend (simple: compare first half vs second half) ──
  let patternTrend: 'improving' | 'declining' | 'stable' | 'unknown' = 'unknown';
  if (trades.length >= 6) {
    const mid = Math.floor(trades.length / 2);
    const firstHalf = trades.slice(0, mid);
    const secondHalf = trades.slice(mid);

    const firstMistakes = firstHalf.filter(t => t.behaviorTags && t.behaviorTags.length > 0).length;
    const secondMistakes = secondHalf.filter(t => t.behaviorTags && t.behaviorTags.length > 0).length;

    const firstMistakePct = firstHalf.length > 0 ? firstMistakes / firstHalf.length : 0;
    const secondMistakePct = secondHalf.length > 0 ? secondMistakes / secondHalf.length : 0;

    if (secondMistakePct < firstMistakePct - 0.1) patternTrend = 'improving';
    else if (secondMistakePct > firstMistakePct + 0.1) patternTrend = 'declining';
    else patternTrend = 'stable';
  }

  const stats: DashboardStats = {
    totalTrades: trades.length,
    winRate,
    averageHoldTime: avgHoldTime,
    averageWinner,
    averageLoser,
    mostTradedTicker,
    mostCommonViolation,
  };

  return { topMistakes, topStrengths, stats, patternTrend };
}

// ─── Component ────────────────────────────────────────────────────────────

interface BehaviorDashboardProps {
  trades: DashboardTrade[];
}

export function BehaviorDashboard({ trades }: BehaviorDashboardProps) {
  const data = useMemo(() => buildDashboardData(trades), [trades]);

  if (!data) return null;

  const hasMistakes = data.topMistakes.length > 0;
  const hasStrengths = data.topStrengths.length > 0;

  if (!hasMistakes && !hasStrengths) return null;

  return (
    <div className="space-y-3">
      {/* Biggest Leak */}
      {hasMistakes && (
        <Card className="border border-red-500/20 bg-red-500/[0.04] backdrop-blur-xl">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-red-400 uppercase tracking-wider">
              <TrendingDown className="h-4 w-4" />
              Biggest Leak
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.topMistakes.map((m, i) => (
                <div key={m.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      i === 0 ? 'bg-red-500/30 text-red-300' :
                      i === 1 ? 'bg-amber-500/20 text-amber-300' :
                      'bg-white/10 text-white/50'
                    }`}>
                      {i + 1}
                    </span>
                    <span className="text-sm text-white/80">{m.label}</span>
                  </div>
                  <span className="text-xs text-white/50 tabular-nums">{m.count} occ{m.count === 1 ? '' : 's'}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Best Strength */}
      {hasStrengths && (
        <Card className="border border-emerald-500/20 bg-emerald-500/[0.04] backdrop-blur-xl">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-emerald-400 uppercase tracking-wider">
              <TrendingUp className="h-4 w-4" />
              Best Strength
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.topStrengths.map((s) => (
                <div key={s.label} className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
                    <span className="text-[10px] text-emerald-400">&#10003;</span>
                  </span>
                  <span className="text-sm text-white/80">{s.label}</span>
                  <span className="text-xs text-white/50">({s.count} trades)</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pattern Trend */}
      <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-white/70 uppercase tracking-wider">Pattern Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
              data.patternTrend === 'improving' ? 'bg-emerald-500/20' :
              data.patternTrend === 'declining' ? 'bg-red-500/20' :
              data.patternTrend === 'stable' ? 'bg-blue-500/20' :
              'bg-white/10'
            }`}>
              <span className={`text-sm ${
                data.patternTrend === 'improving' ? 'text-emerald-400' :
                data.patternTrend === 'declining' ? 'text-red-400' :
                data.patternTrend === 'stable' ? 'text-blue-400' :
                'text-white/50'
              }`}>
                {data.patternTrend === 'improving' ? '↑' :
                 data.patternTrend === 'declining' ? '↓' :
                 data.patternTrend === 'stable' ? '→' : '?'}
              </span>
            </div>
            <div>
              <div className="text-sm font-medium text-white/80 capitalize">{data.patternTrend}</div>
              <div className="text-xs text-white/40">
                {data.patternTrend === 'improving' ? 'Fewer flagged behaviors in recent trades' :
                 data.patternTrend === 'declining' ? 'More flagged behaviors in recent trades' :
                 data.patternTrend === 'stable' ? 'Behavior patterns holding steady' :
                 'Not enough data for trend analysis'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-white/70 uppercase tracking-wider">Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <div className="flex items-center gap-1 text-xs text-white/40">
                <BarChart3 className="h-3 w-3" />
                Trades
              </div>
              <div className="text-sm font-semibold text-white">{data.stats.totalTrades}</div>
            </div>
            <div>
              <div className="flex items-center gap-1 text-xs text-white/40">
                <Target className="h-3 w-3" />
                Win Rate
              </div>
              <div className={`text-sm font-semibold ${data.stats.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                {data.stats.winRate}%
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1 text-xs text-white/40">
                <Clock className="h-3 w-3" />
                Avg Hold
              </div>
              <div className="text-sm font-semibold text-white">{data.stats.averageHoldTime}</div>
            </div>
            <div>
              <div className="flex items-center gap-1 text-xs text-white/40">
                <DollarSign className="h-3 w-3" />
                Avg Win
              </div>
              <div className="text-sm font-semibold text-emerald-400">{formatPL(data.stats.averageWinner)}</div>
            </div>
            <div>
              <div className="flex items-center gap-1 text-xs text-white/40">
                <DollarSign className="h-3 w-3" />
                Avg Loss
              </div>
              <div className="text-sm font-semibold text-red-400">-${data.stats.averageLoser.toFixed(2)}</div>
            </div>
            <div>
              <div className="flex items-center gap-1 text-xs text-white/40">
                <BarChart3 className="h-3 w-3" />
                Most Traded
              </div>
              <div className="text-sm font-semibold text-white">{data.stats.mostTradedTicker}</div>
            </div>
          </div>
          {data.stats.mostCommonViolation !== 'None' && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-white/40">
              <AlertTriangle className="h-3 w-3 text-red-400/70" />
              <span>Most common violation: <span className="text-white/70">{data.stats.mostCommonViolation}</span></span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
