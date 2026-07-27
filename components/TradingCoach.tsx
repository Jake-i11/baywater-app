"use client";

import React, { useMemo } from "react";
import { TrendingUp, TrendingDown, Minus, Target, CheckCircle, AlertTriangle, Lightbulb, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TraderProfileState, BehaviorTrend } from "@/lib/trader-profile-state";
import { formatTrend } from "@/lib/trader-profile-state";

// ─── Component Props ─────────────────────────────────────────────────────

interface TradingCoachProps {
  profile: TraderProfileState;
  trends: BehaviorTrend[];
}

// ─── Grade letter helper ────────────────────────────────────────────────

function getGradeLetter(score: number): string {
  if (score >= 92) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 78) return 'A-';
  if (score >= 70) return 'B+';
  if (score >= 62) return 'B';
  if (score >= 55) return 'B-';
  if (score >= 48) return 'C+';
  if (score >= 40) return 'C';
  if (score >= 30) return 'C-';
  if (score >= 20) return 'D+';
  if (score >= 10) return 'D';
  return 'F';
}

function getGradeColor(score: number): string {
  if (score >= 70) return 'text-emerald-400';
  if (score >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

function getGradeBgColor(score: number): string {
  if (score >= 70) return 'bg-emerald-500/20';
  if (score >= 40) return 'bg-yellow-500/20';
  return 'bg-red-500/20';
}

// ─── Trend arrow helpers ─────────────────────────────────────────────────

function TrendArrow({ trend }: { trend: 'improving' | 'stable' | 'worsening' }) {
  if (trend === 'improving') return <TrendingUp className="h-4 w-4 text-emerald-400" />;
  if (trend === 'worsening') return <TrendingDown className="h-4 w-4 text-red-400" />;
  return <Minus className="h-4 w-4 text-white/40" />;
}

function TrendBg({ trend }: { trend: 'improving' | 'stable' | 'worsening' }) {
  if (trend === 'improving') return 'bg-emerald-500/10';
  if (trend === 'worsening') return 'bg-red-500/10';
  return 'bg-white/5';
}

// ─── Component ──────────────────────────────────────────────────────────

export function TradingCoach({ profile, trends }: TradingCoachProps) {
  const grade = useMemo(() => getGradeLetter(profile.improvementScore), [profile.improvementScore]);
  const gradeColor = getGradeColor(profile.improvementScore);
  const gradeBg = getGradeBgColor(profile.improvementScore);

  // Find the biggest improvement and main focus among trends
  const biggestImprovement = trends.find(t => t.trend === 'improving');
  const worseningIssue = trends.find(t => t.trend === 'worsening');
  const mainFocus = worseningIssue?.behavior || profile.weaknesses[0] || 'Continue building good habits';

  // Best trend entry to display
  const bestTrendEntry = biggestImprovement
    ? formatTrend(biggestImprovement)
    : null;

  return (
    <div className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-white/80">
        <Lightbulb className="h-5 w-5 text-emerald-400" />
        AI Trading Coach
      </h2>

      {/* Current Grade */}
      <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-white/70 uppercase tracking-wider">Current Grade</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${gradeBg}`}>
              <span className={`text-2xl font-bold ${gradeColor}`}>{grade}</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      profile.improvementScore >= 70 ? 'bg-emerald-500' :
                      profile.improvementScore >= 40 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${profile.improvementScore}%` }}
                  />
                </div>
                <span className={`text-xs font-semibold tabular-nums ${gradeColor}`}>
                  {profile.improvementScore}
                </span>
              </div>
              <div className="mt-1 text-xs text-white/40">
                Based on {profile.totalTrades} trades · Win rate · Behavior tags · Risk control
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Biggest Improvement */}
      <Card className="border border-emerald-500/20 bg-emerald-500/[0.04] backdrop-blur-xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-emerald-400 uppercase tracking-wider">
            <TrendingUp className="h-4 w-4" />
            Biggest Improvement
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bestTrendEntry ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-white/80">{bestTrendEntry}</span>
            </div>
          ) : profile.strengths.length > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-white/80">
                ✓ {profile.strengths[0]}
              </span>
            </div>
          ) : (
            <span className="text-sm text-white/40 italic">
              Not enough data to detect improvement yet
            </span>
          )}
        </CardContent>
      </Card>

      {/* Main Focus */}
      <Card className="border border-amber-500/20 bg-amber-500/[0.04] backdrop-blur-xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-amber-400 uppercase tracking-wider">
            <Target className="h-4 w-4" />
            Main Focus
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <span className="text-sm text-white/80">{mainFocus}</span>
          </div>
          {profile.weaknesses.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {profile.weaknesses.slice(1).map((w) => (
                <span key={w} className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] text-red-300/80">
                  {w}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Your Rules */}
      {profile.personalRules.length > 0 && (
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-white/70 uppercase tracking-wider">Your Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {profile.personalRules.map((rule, i) => (
                <div key={i} className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400/70" />
                  <span className="text-sm text-white/80">{rule}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progress: Behavior-by-behavior breakdown */}
      {trends.length > 0 && (
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-white/70 uppercase tracking-wider">
              <BarChart3 className="h-4 w-4" />
              Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {trends.slice(0, 4).map((trend) => (
                <div key={trend.behavior}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-white/70">{trend.behavior}</span>
                    <div className="flex items-center gap-1">
                      <span className={`text-[11px] tabular-nums ${
                        trend.trend === 'improving' ? 'text-emerald-400' :
                        trend.trend === 'worsening' ? 'text-red-400' :
                        'text-white/40'
                      }`}>
                        {trend.previousCount} → {trend.recentCount}
                      </span>
                    </div>
                  </div>
                  <div className={`flex items-center gap-1 rounded-lg px-2 py-1.5 ${TrendBg({ trend: trend.trend })}`}>
                    <TrendArrow trend={trend.trend} />
                    <span className={`text-xs font-medium ${
                      trend.trend === 'improving' ? 'text-emerald-400' :
                      trend.trend === 'worsening' ? 'text-red-400' :
                      'text-white/50'
                    }`}>
                      {formatTrend(trend)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
