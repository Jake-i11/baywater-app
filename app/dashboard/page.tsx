"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import {
  getDisciplineStatistics,
  getViolationStatistics,
  getTradeQualityBreakdown,
  calculateTradeMetrics,
  calculateDisciplineStreaks,
  calculateDisciplineTrend,
  getCurrentProcessStatus
} from "@/lib/market-enrichment";
import { hasCompletedOnboarding } from "@/lib/profile-utils";
import { getRecentPatternAnalysisSummary } from "@/lib/trade-pattern-utils";

// Onboarding Banner Component
function OnboardingBanner({ userId }: { userId: string }) {
  const [showBanner, setShowBanner] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function checkOnboardingStatus() {
      try {
        const completed = await hasCompletedOnboarding(userId);
        setShowBanner(!completed);
      } catch (error) {
        console.error("Error checking onboarding status:", error);
        setShowBanner(false);
      } finally {
        setLoading(false);
      }
    }

    if (userId) {
      checkOnboardingStatus();
    } else {
      setLoading(false);
    }
  }, [userId]);

  if (loading || !showBanner) {
    return null;
  }

  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-5 w-5 text-blue-400 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-medium text-blue-300">Complete your Baywater setup</p>
          <p className="text-sm text-blue-200 mt-1">
            Unlock your discipline insights and get the full Baywater experience.
          </p>
        </div>
        <a
          href="/onboarding"
          className="rounded-full border border-blue-500/30 bg-blue-500/20 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-500/30 flex-shrink-0"
        >
          Complete Setup
        </a>
      </div>
    </div>
  );
}

// Upcoming Commitments Card Component
function UpcomingCommitmentsCard({ userId }: { userId: string }) {
  const [commitments, setCommitments] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function fetchCommitments() {
      try {
        if (!userId) {
          setLoading(false);
          return;
        }

        // Import dynamically to avoid circular dependency
        const { getUnlockedCommitments } = await import('@/lib/commitment-utils');
        const unlockedCommitments = await getUnlockedCommitments(userId);
        setCommitments(unlockedCommitments);
      } catch (error) {
        console.error("Error fetching commitments:", error);
        setCommitments([]);
      } finally {
        setLoading(false);
      }
    }

    fetchCommitments();
  }, [userId]);

  if (loading) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-4 animate-pulse">
        <div className="h-4 bg-white/10 rounded w-1/4 mb-2"></div>
        <div className="h-3 bg-white/10 rounded w-1/2"></div>
      </div>
    );
  }

  if (commitments.length === 0) {
    return (
      <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">No active commitments</p>
              <p className="text-sm text-white/60 mt-1">
                Create a pre-trade commitment before your next trade
              </p>
            </div>
            <Link
              href="/commitments/new"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 flex-shrink-0"
            >
              Create Commitment
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="h-5 w-5 text-blue-400">🎯</span>
          Upcoming Commitment
        </CardTitle>
        <p className="text-xs text-white/50 mt-1">
          Your locked trading plan awaiting execution
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {commitments.map((commitment) => (
          <div key={commitment.id} className="p-3 rounded-lg bg-white/5 border border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{commitment.ticker || '—'}</p>
                <p className="text-sm text-white/60 mt-1">
                  {commitment.setup_type} • Confidence: {commitment.confidence_score}/10
                </p>
                <p className="text-xs text-white/50 mt-1">
                  Created: {new Date(commitment.created_at).toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-1 text-xs text-emerald-400">
                  <span className="h-3 w-3 rounded-full bg-emerald-400"></span>
                  Locked
                </span>
                <Link
                  href={`/commitments/new?edit=${commitment.id}`}
                  className="ml-2 text-xs text-white/60 hover:text-white/80"
                >
                  View →
                </Link>
              </div>
            </div>
            <p className="text-sm text-white/80 mt-2 italic">
              "{commitment.thesis}"
            </p>
          </div>
        ))}
        <div className="pt-3 border-t border-white/10">
          <Link
            href="/commitments/new"
            className="w-full block text-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            + Create New Commitment
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

  type Trade = {
    id: string;
    ticker: string;
    entry: string;
    exit: string;
    size: string;
    time: string;
    violations: string;
    created_at: string;
    direction?: string;
    entry_time?: string;
    exit_time?: string;
    realized_pl?: string;
  };

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
const [trades, setTrades] = useState<Trade[]>([]);
const [loading, setLoading] = useState(true);
const [patternSummary, setPatternSummary] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const sessionUser = data.session?.user ?? null;
      setUser(sessionUser);

      if (sessionUser) {
        const { data: tradeData } = await supabase
          .from("trades")
          .select("*")
          .eq("user_id", sessionUser.id)
          .order("created_at", { ascending: false });

setTrades(tradeData ?? []);

// Fetch pattern analysis summary
if (sessionUser) {
  const summary = await getRecentPatternAnalysisSummary(sessionUser.id);
  setPatternSummary(summary);
}
      }
      setLoading(false);
    });
  }, []);

  // Calculate statistics
  const totalTrades = trades.length;

  // Filter completed trades (have both entry and exit)
  const completedTrades = trades.filter(t => t.entry && t.exit && t.realized_pl);

  // Calculate P/L statistics
  const plValues = completedTrades.map(t => {
    const pl = parseFloat(t.realized_pl || '0');
    return isNaN(pl) ? 0 : pl;
  });

  const winningTrades = plValues.filter(pl => pl > 0);
  const losingTrades = plValues.filter(pl => pl < 0);

  const winRate = totalTrades === 0
    ? 0
    : Math.round((winningTrades.length / completedTrades.length) * 100) || 0;

  const totalPL = plValues.reduce((sum, pl) => sum + pl, 0);
  const avgWin = winningTrades.length > 0
    ? (winningTrades.reduce((sum, pl) => sum + pl, 0) / winningTrades.length).toFixed(2)
    : '0.00';
  const avgLoss = losingTrades.length > 0
    ? (losingTrades.reduce((sum, pl) => sum + pl, 0) / losingTrades.length).toFixed(2)
    : '0.00';

  const violationTrades = trades.filter((t) => {
    const v = JSON.parse(t.violations || "[]");
    return v.length > 0;
  });
  const complianceRate =
    totalTrades === 0
      ? 100
      : Math.round(((totalTrades - violationTrades.length) / totalTrades) * 100);

  // Shared background style
  const bgStyle = {
    background: 'linear-gradient(135deg, #0a1a0f 0%, #07120a 40%, #0c1f14 100%)',
    backgroundImage: `
      linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
      linear-gradient(135deg, #0a1a0f 0%, #07120a 40%, #0c1f14 100%)
    `,
    backgroundSize: '40px 40px, 40px 40px, 100% 100%',
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-white/50" style={bgStyle}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-4 text-white"
        style={bgStyle}
      >
        <p className="text-white/50">You need to be logged in to view your history.</p>
        <a
          href="/login"
          className="rounded-full bg-emerald-500 px-6 py-2 text-sm font-semibold shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
        >
          Log in
        </a>
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden text-white"
      style={bgStyle}
    >
      {/* orbs – green tinted */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-48 left-[8%] h-[500px] w-[500px] rounded-full bg-emerald-500 opacity-20 blur-[120px]" />
        <div className="absolute -bottom-48 right-[8%] h-[500px] w-[500px] rounded-full bg-green-500 opacity-20 blur-[140px]" />
        <div className="absolute top-[28%] left-[42%] h-[400px] w-[400px] rounded-full bg-lime-500 opacity-10 blur-[160px]" />
      </div>

      {/* NAVBAR */}
      <nav className="flex items-center justify-between px-10 py-6">
        <a href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-green-600">
            <ShieldCheck className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-semibold">Baywater</span>
        </a>
        <div className="flex items-center gap-4">
          <a href="/" className="text-sm text-white/50 hover:text-white">
            Analyze
          </a>
          <a href="/dashboard/edge" className="text-sm text-white/50 hover:text-white">
            Your Edge
          </a>
          <a href="/dashboard/coach" className="text-sm text-white/50 hover:text-white">
            AI Coach
          </a>
          <span className="text-sm font-medium text-white">History</span>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/";
            }}
            className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            Log out
          </button>
        </div>
      </nav>

      <div className="mx-auto max-w-4xl space-y-6 px-6 pb-20 pt-6">
        {/* ONBOARDING BANNER - only show if onboarding not completed */}
        <OnboardingBanner userId={user?.id || ''} />
        {/* UPCOMING COMMITMENTS CARD */}
        <UpcomingCommitmentsCard userId={user?.id || ''} />

        {/* STATS ROW */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardContent className="pt-6">
              <p className="text-xs text-white/50">Total trades</p>
              <p className="mt-1 text-3xl font-bold">{totalTrades}</p>
            </CardContent>
          </Card>
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardContent className="pt-6">
              <p className="text-xs text-white/50">Win rate</p>
              <p className="mt-1 text-3xl font-bold text-emerald-400">
                {winRate}%
              </p>
            </CardContent>
          </Card>
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardContent className="pt-6">
              <p className="text-xs text-white/50">Total P/L</p>
              <p
                className={`mt-1 text-3xl font-bold ${
                  totalPL >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                ${totalPL.toFixed(2)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* SECOND STATS ROW */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardContent className="pt-6">
              <p className="text-xs text-white/50">Avg Win</p>
              <p className="mt-1 text-3xl font-bold text-emerald-400">
                ${avgWin}
              </p>
            </CardContent>
          </Card>
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardContent className="pt-6">
              <p className="text-xs text-white/50">Avg Loss</p>
              <p className="mt-1 text-3xl font-bold text-red-400">
                ${avgLoss}
              </p>
            </CardContent>
          </Card>
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardContent className="pt-6">
              <p className="text-xs text-white/50">Compliance rate</p>
              <p
                className={`mt-1 text-3xl font-bold ${
                  complianceRate >= 80 ? "text-emerald-400" : "text-amber-400"
                }`}
              >
                {complianceRate}%
              </p>
            </CardContent>
          </Card>
        </div>

        {/* PATTERN INTELLIGENCE CARD */}
        {patternSummary && patternSummary.totalAnalyzed > 0 && (
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="h-5 w-5 text-blue-400">🔍</span>
                Today's Pattern Intelligence
              </CardTitle>
              <p className="text-xs text-white/50 mt-1">
                How your recent trades compare to your historical patterns
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Recent Pattern Score */}
              <div>
                <p className="text-xs text-white/50">Recent Pattern Score</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-2xl font-bold text-emerald-400">
                    {patternSummary.patternScore}%
                  </span>
                  <span className="text-sm text-white/60">
                    match with historical winners
                  </span>
                </div>
                <p className="text-xs text-white/60 mt-1">
                  Based on your last {patternSummary.totalAnalyzed} analyzed trades
                </p>
              </div>

              {/* Recent Strengths */}
              {patternSummary.recentStrengths && patternSummary.recentStrengths.length > 0 && (
                <div>
                  <p className="text-xs text-white/50">Your recent edge</p>
                  <div className="mt-2 space-y-2">
                    {patternSummary.recentStrengths.map((strength: string, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" />
                        <p className="text-sm text-white/90">{strength}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Warnings */}
              {patternSummary.recentWarnings && patternSummary.recentWarnings.length > 0 && (
                <div>
                  <p className="text-xs text-white/50">Watch out</p>
                  <div className="mt-2 space-y-2">
                    {patternSummary.recentWarnings.map((warning: string, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />
                        <p className="text-sm text-white/90">{warning}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Trade Summary */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-white/5 border border-white/10">
                <span className="h-5 w-5 text-blue-400 mt-0.5">💡</span>
                <p className="text-sm text-white/80">
                  {patternSummary.recentTradeSummary}
                </p>
              </div>

              {/* Pattern Statistics */}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/10">
                <div>
                  <p className="text-xs text-white/50">Winner Matches</p>
                  <p className="mt-1 text-lg font-bold text-emerald-400">
                    {patternSummary.winnerMatches}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-white/50">Loser Matches</p>
                  <p className="mt-1 text-lg font-bold text-red-400">
                    {patternSummary.loserMatches}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* DISCIPLINE & PROCESS INTELLIGENCE */}
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              Process Intelligence
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Discipline Statistics */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-white/50">Current Discipline Score</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-2xl font-bold">
                    {getDisciplineStatistics(trades).currentDisciplineScore}
                  </span>
                  <span className="text-sm text-white/60">/ 100</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-white/50">Average Discipline Score</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-2xl font-bold">
                    {getDisciplineStatistics(trades).averageDisciplineScore}
                  </span>
                  <span className="text-sm text-white/60">/ 100</span>
                </div>
              </div>
            </div>

            {/* Discipline Trend */}
            <div>
              <p className="text-xs text-white/50">Discipline Trend</p>
              <div className="flex items-center gap-2 mt-1">
                {getDisciplineStatistics(trades).disciplineTrend === 'improving' && (
                  <TrendingUp className="h-5 w-5 text-emerald-400" />
                )}
                {getDisciplineStatistics(trades).disciplineTrend === 'declining' && (
                  <TrendingDown className="h-5 w-5 text-red-400" />
                )}
                {getDisciplineStatistics(trades).disciplineTrend === 'stable' && (
                  <span className="h-5 w-5 text-amber-400">→</span>
                )}
                <span className="text-sm font-medium capitalize">
                  {getDisciplineStatistics(trades).disciplineTrend}
                </span>
                {getDisciplineStatistics(trades).disciplineTrend === 'declining' && (
                  <span className="text-xs text-red-400">
                    (After losing streaks)
                  </span>
                )}
              </div>
            </div>

            {/* Process Metrics */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
              <div>
                <p className="text-xs text-white/50">Rule Compliance</p>
                <p className="mt-1 text-xl font-bold text-emerald-400">
                  {complianceRate}%
                </p>
                <p className="text-xs text-white/60">
                  {getDisciplineStatistics(trades).totalViolations} violations
                </p>
              </div>
              <div>
                <p className="text-xs text-white/50">Trades Following Rules</p>
                <p className="mt-1 text-xl font-bold text-emerald-400">
                  {totalTrades - violationTrades.length} / {totalTrades}
                </p>
                <p className="text-xs text-white/60">
                  {Math.round(((totalTrades - violationTrades.length) / totalTrades) * 100)}%
                </p>
              </div>
            </div>

            {/* Insight */}
            {totalTrades > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-white/5 border border-white/10">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-400 flex-shrink-0" />
                <p className="text-sm text-white/80">
                  You followed your rules on {complianceRate}% of trades.
                  {getDisciplineStatistics(trades).disciplineTrend === 'improving' &&
                    ' Your discipline is improving over time.'}
                  {getDisciplineStatistics(trades).disciplineTrend === 'declining' &&
                    ' Focus on maintaining discipline during losing streaks.'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* DISCIPLINE STREAKS SECTION */}
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="h-5 w-5 text-emerald-400">🔥</span>
              Discipline Streaks
            </CardTitle>
            <p className="text-xs text-white/50 mt-1">
              Rewarding consistent rule-following, not profitable outcomes
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Current Streak */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-white/50">Current Discipline Streak</p>
                <div className="flex items-center gap-2 mt-1">
                  {calculateDisciplineStreaks(trades).streakActive ? (
                    <span className="h-6 w-6 text-emerald-400">🔥</span>
                  ) : (
                    <XCircle className="h-6 w-6 text-red-400" />
                  )}
                  <span className="text-2xl font-bold">
                    {calculateDisciplineStreaks(trades).currentStreak}
                  </span>
                  <span className="text-sm text-white/60">
                    {calculateDisciplineStreaks(trades).currentStreak === 1 ? 'trade' : 'trades'}
                  </span>
                </div>
                <p className="text-xs text-white/60 mt-1">
                  {calculateDisciplineStreaks(trades).streakActive
                    ? 'Active streak - keep it going!'
                    : 'Streak broken - get back on track'}
                </p>
              </div>
              <div>
                <p className="text-xs text-white/50">Best Discipline Streak</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="h-6 w-6 text-yellow-400">🏆</span>
                  <span className="text-2xl font-bold">
                    {calculateDisciplineStreaks(trades).bestStreak}
                  </span>
                  <span className="text-sm text-white/60">trades</span>
                </div>
                <p className="text-xs text-white/60 mt-1">
                  Your personal best streak
                </p>
              </div>
            </div>

            {/* Discipline Trend */}
            <div>
              <p className="text-xs text-white/50">Discipline Trend</p>
              <div className="flex items-center gap-2 mt-1">
                {calculateDisciplineTrend(trades).trendDirection === 'improving' && (
                  <TrendingUp className="h-5 w-5 text-emerald-400" />
                )}
                {calculateDisciplineTrend(trades).trendDirection === 'declining' && (
                  <TrendingDown className="h-5 w-5 text-red-400" />
                )}
                {calculateDisciplineTrend(trades).trendDirection === 'stable' && (
                  <span className="h-5 w-5 text-amber-400">→</span>
                )}
                <span className="text-sm font-medium">
                  {calculateDisciplineTrend(trades).trendDescription}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-2">
                <div>
                  <p className="text-xs text-white/50">Recent (10 trades)</p>
                  <p className="text-lg font-bold">
                    {calculateDisciplineTrend(trades).recentAverage}/100
                  </p>
                </div>
                <div>
                  <p className="text-xs text-white/50">Previous (10 trades)</p>
                  <p className="text-lg font-bold">
                    {calculateDisciplineTrend(trades).olderAverage}/100
                  </p>
                </div>
                <div>
                  <p className="text-xs text-white/50">Change</p>
                  <p className={`text-lg font-bold ${calculateDisciplineTrend(trades).trendPercentage >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {calculateDisciplineTrend(trades).trendPercentage >= 0 ? '+' : ''}{calculateDisciplineTrend(trades).trendPercentage}%
                  </p>
                </div>
              </div>
            </div>

            {/* Violation Streaks */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
              <div>
                <p className="text-xs text-white/50">Current Violation Streak</p>
                <div className="flex items-center gap-2 mt-1">
                  <AlertTriangle className="h-6 w-6 text-red-400" />
                  <span className="text-2xl font-bold">
                    {calculateDisciplineStreaks(trades).currentViolationStreak}
                  </span>
                  <span className="text-sm text-white/60">
                    {calculateDisciplineStreaks(trades).currentViolationStreak === 1 ? 'trade' : 'trades'}
                  </span>
                </div>
                <p className="text-xs text-white/60 mt-1">
                  {calculateDisciplineStreaks(trades).currentViolationStreak > 0
                    ? 'Consecutive trades with violations'
                    : 'No current violation streak'}
                </p>
              </div>
              <div>
                <p className="text-xs text-white/50">Longest Violation Streak</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-2xl font-bold text-red-400">
                    {calculateDisciplineStreaks(trades).longestViolationStreak}
                  </span>
                  <span className="text-sm text-white/60">trades</span>
                </div>
                <p className="text-xs text-white/60 mt-1">
                  {calculateDisciplineStreaks(trades).mostCommonViolation
                    ? `Most common: ${calculateDisciplineStreaks(trades).mostCommonViolation}`
                    : 'No violation patterns detected'}
                </p>
              </div>
            </div>

            {/* Current Process Status */}
            <div className="pt-4 border-t border-white/10">
              <p className="text-xs text-white/50">Current Process Status</p>
              <div className="flex items-center gap-3 mt-2">
                {getCurrentProcessStatus(trades).status === 'excellent' && (
                  <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                )}
                {getCurrentProcessStatus(trades).status === 'good' && (
                  <CheckCircle2 className="h-6 w-6 text-green-400" />
                )}
                {getCurrentProcessStatus(trades).status === 'fair' && (
                  <span className="h-6 w-6 text-amber-400">⚠️</span>
                )}
                {getCurrentProcessStatus(trades).status === 'poor' && (
                  <XCircle className="h-6 w-6 text-red-400" />
                )}
                <div>
                  <p className="text-lg font-bold capitalize">
                    {getCurrentProcessStatus(trades).status} process
                  </p>
                  <p className="text-sm text-white/60">
                    {getCurrentProcessStatus(trades).description}
                  </p>
                </div>
              </div>
            </div>

            {/* Streak Insight */}
            {calculateDisciplineStreaks(trades).currentStreak > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-white/5 border border-white/10">
                <span className="h-5 w-5 text-emerald-400 mt-0.5">💡</span>
                <p className="text-sm text-white/80">
                  {calculateDisciplineStreaks(trades).streakActive
                    ? `You're on a ${calculateDisciplineStreaks(trades).currentStreak} trade discipline streak! This shows consistent rule-following regardless of trade outcomes.`
                    : `Your ${calculateDisciplineStreaks(trades).currentStreak} trade streak was broken. Focus on getting back to disciplined trading.`}
                  {calculateDisciplineStreaks(trades).bestStreak > 0 &&
                    ` Your best streak is ${calculateDisciplineStreaks(trades).bestStreak} trades.`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* VIOLATION COST INTELLIGENCE */}
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              Violation Cost Intelligence
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-white/50">Total Money Lost from Violations</p>
                <p className="mt-1 text-xl font-bold text-red-400">
                  ${Math.abs(getViolationStatistics(trades).totalViolationCost).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-white/50">Number of Violation Trades</p>
                <p className="mt-1 text-xl font-bold text-red-400">
                  {getViolationStatistics(trades).totalViolationTrades}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-white/50">Most Expensive Violation</p>
                <p className="mt-1 text-xl font-bold text-red-400">
                  ${Math.abs(getViolationStatistics(trades).mostExpensiveViolation).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-white/50">Dangerous Wins</p>
                <p className="mt-1 text-xl font-bold text-amber-400">
                  {getViolationStatistics(trades).dangerousWinsCount}
                </p>
                <p className="text-xs text-white/60">
                  Bad process, profitable outcome
                </p>
              </div>
            </div>

            {/* Insight */}
            {getViolationStatistics(trades).totalViolationCost < 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-300">
                  Rule violations cost you ${Math.abs(getViolationStatistics(trades).totalViolationCost).toFixed(2)}.
                  {getViolationStatistics(trades).dangerousWinsCount > 0 &&
                    ` You had ${getViolationStatistics(trades).dangerousWinsCount} dangerous wins where bad process created profitable outcomes.`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* TRADE QUALITY BREAKDOWN */}
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="h-5 w-5 text-blue-400">📊</span>
              Trade Quality Breakdown
            </CardTitle>
            <p className="text-xs text-white/50 mt-1">
              Understanding that good process ≠ always profitable, bad process ≠ always losing
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-medium">A) Profitable + Disciplined</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-medium">B) Profitable + Undisciplined</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-400" />
                  <span className="text-sm font-medium">C) Losing + Disciplined</span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-400" />
                  <span className="text-sm font-medium">D) Losing + Undisciplined</span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-emerald-400">
                    {getTradeQualityBreakdown(trades).categoryA}
                  </span>
                  <span className="text-xs text-white/60">trades</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-amber-400">
                    {getTradeQualityBreakdown(trades).categoryB}
                  </span>
                  <span className="text-xs text-white/60">trades</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-blue-400">
                    {getTradeQualityBreakdown(trades).categoryC}
                  </span>
                  <span className="text-xs text-white/60">trades</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-red-400">
                    {getTradeQualityBreakdown(trades).categoryD}
                  </span>
                  <span className="text-xs text-white/60">trades</span>
                </div>
              </div>
            </div>

            {/* Insight */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-white/5 border border-white/10">
              <span className="h-5 w-5 text-blue-400 mt-0.5">💡</span>
              <p className="text-sm text-white/80">
                Category C trades (Losing + Disciplined) are good trades with bad outcomes.
                Category B trades (Profitable + Undisciplined) are dangerous wins that reinforce bad habits.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* TRADE TABLE */}
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Trade History</CardTitle>
          </CardHeader>
          <CardContent>
            {trades.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-white/40">No trades logged yet.</p>
                <a
                  href="/"
                  className="mt-3 inline-block text-sm text-emerald-400 hover:text-emerald-300"
                >
                  Analyze your first trade →
                </a>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs text-white/40">
                      <th className="pb-3 pr-4">Date</th>
                      <th className="pb-3 pr-4">Ticker</th>
                      <th className="pb-3 pr-4">Entry</th>
                      <th className="pb-3 pr-4">Exit</th>
                      <th className="pb-3 pr-4">Size</th>
                      <th className="pb-3 pr-4">P/L</th>
                      <th className="pb-3">Violations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((trade) => {
                      const violations = JSON.parse(trade.violations || "[]");
                      const hasViolation = violations.length > 0;
                      return (
                        <tr
                          key={trade.id}
                          className={`border-b border-white/5 ${
                            hasViolation ? "bg-red-500/5" : ""
                          } cursor-pointer hover:bg-white/5`}
                          onClick={() => window.location.href = `/dashboard/trade/${trade.id}`}
                        >
                          <td className="py-3 pr-4 text-white/40">
                            {new Date(trade.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 pr-4 font-semibold">
                            {trade.ticker ?? "—"}
                          </td>
                          <td className="py-3 pr-4 text-white/70">
                            {trade.entry ?? "—"}
                          </td>
                          <td className="py-3 pr-4 text-white/70">
                            {trade.exit ?? "—"}
                          </td>
                          <td className="py-3 pr-4 text-white/70">
                            {trade.size ?? "—"}
                          </td>
                          <td className="py-3 pr-4 text-white/70">
                            {trade.realized_pl ? (
                              <span className={parseFloat(trade.realized_pl) >= 0 ? "text-emerald-400" : "text-red-400"}>
                                ${parseFloat(trade.realized_pl).toFixed(2)}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="py-3">
                            {hasViolation ? (
                              <div className="flex flex-wrap gap-1">
                                {violations.map((v: string, i: number) => (
                                  <span
                                    key={i}
                                    className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-400"
                                  >
                                    {v}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">
                                Clean
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}