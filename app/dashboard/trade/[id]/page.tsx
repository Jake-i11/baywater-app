"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TradeChart } from "@/components/TradeChart";
import { AIReplay } from "@/components/AIReplay";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { calculateTradeOutcomeCategory } from "@/lib/market-enrichment";
import { getTradePatternAnalysis } from "@/lib/trade-pattern-utils";

// Helper functions for process review display
function getDisciplineDescription(score: number): string {
  if (score >= 80) return "Excellent discipline";
  if (score >= 60) return "Good discipline";
  if (score >= 40) return "Fair discipline";
  if (score >= 20) return "Poor discipline";
  return "Very poor discipline";
}

function getSetupQualityDescription(score: number): string {
  if (score >= 80) return "High quality setup";
  if (score >= 60) return "Good setup";
  if (score >= 40) return "Average setup";
  if (score >= 20) return "Weak setup";
  return "Poor setup";
}

function getTradeGradeColor(grade: string): string {
  switch(grade.toUpperCase()) {
    case 'A': return 'text-emerald-400';
    case 'B': return 'text-green-400';
    case 'C': return 'text-yellow-400';
    case 'D': return 'text-amber-400';
    case 'F': return 'text-red-400';
    default: return 'text-white';
  }
}

function getCategoryIcon(category: string) {
  switch(category) {
    case 'A': return <CheckCircle2 className="h-6 w-6 text-emerald-400" />;
    case 'B': return <AlertTriangle className="h-6 w-6 text-amber-400" />;
    case 'C': return <CheckCircle2 className="h-6 w-6 text-blue-400" />;
    case 'D': return <XCircle className="h-6 w-6 text-red-400" />;
    default: return <span className="h-6 w-6 text-white/60">?</span>;
  }
}

function getCategoryLabel(category: string): string {
  switch(category) {
    case 'A': return 'A) Profitable + Disciplined';
    case 'B': return 'B) Profitable + Undisciplined';
    case 'C': return 'C) Losing + Disciplined';
    case 'D': return 'D) Losing + Undisciplined';
    default: return 'Unknown Category';
  }
}

function getCategoryDescription(category: string): string {
  switch(category) {
    case 'A': return 'Perfect trade: profitable with good process';
    case 'B': return 'Dangerous win: profitable but violated rules';
    case 'C': return 'Good trade, bad outcome: disciplined but lost money';
    case 'D': return 'Bad trade: lost money and violated rules';
    default: return 'Trade category could not be determined';
  }
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
  user_id: string;
  // Intelligence layer fields
  float_shares?: number | null;
  market_cap?: number | null;
  sector?: string | null;
  relative_volume?: number | null;
  ai_review?: string | null;
  ai_replay?: string | null;
  setup_quality?: number | null;
  discipline_score?: number | null;
  violation_cost?: string | null;
};

export default function TradeDetailPage({ params }: { params: { id: string } }) {
  const [user, setUser] = useState<User | null>(null);
  const [trade, setTrade] = useState<Trade | null>(null);
  const [loading, setLoading] = useState(true);
  const [candles, setCandles] = useState<any[]>([]);
const [chartLoading, setChartLoading] = useState(false);
const [patternAnalysis, setPatternAnalysis] = useState<any>(null);
const [patternLoading, setPatternLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const sessionUser = data.session?.user ?? null;
      setUser(sessionUser);

      if (sessionUser) {
        // Fetch the trade by ID
        const { data: tradeData } = await supabase
          .from("trades")
          .select("*")
          .eq("id", params.id)
          .eq("user_id", sessionUser.id)
          .single();

        if (tradeData) {
          setTrade(tradeData);

// Fetch chart data if we have ticker and times
if (tradeData.ticker && (tradeData.entry_time || tradeData.exit_time)) {
  await fetchChartData(tradeData.ticker, tradeData.entry_time || tradeData.exit_time || '');
}

// Fetch pattern analysis
if (tradeData) {
  const analysis = await getTradePatternAnalysis(tradeData.id);
  setPatternAnalysis(analysis);
}
        }
      }
setLoading(false);
setPatternLoading(false);
    });
  }, [params.id]);

  async function fetchChartData(ticker: string, timeStr: string) {
    try {
      setChartLoading(true);
      setCandles([]);

      // Parse the trade time and create a time range
      const tradeTime = new Date(timeStr);
      if (isNaN(tradeTime.getTime())) {
        console.warn("Invalid trade time:", timeStr);
        return;
      }

      // Create start and end times for the chart
      // Start: 1 hour before trade time
      // End: 1 hour after trade time
      const startTime = new Date(tradeTime);
      startTime.setHours(tradeTime.getHours() - 1);

      const endTime = new Date(tradeTime);
      endTime.setHours(tradeTime.getHours() + 1);

      const response = await fetch("/api/chart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticker,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        }),
      });

      if (response.ok) {
        const chartData = await response.json();
        if (chartData.candles && chartData.candles.length > 0) {
          setCandles(chartData.candles);
        }
      } else {
        console.error("Failed to fetch chart data:", response.statusText);
      }
    } catch (error) {
      console.error("Error fetching chart data:", error);
    } finally {
      setChartLoading(false);
    }
  }

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
        <p className="text-white/50">You need to be logged in to view trade details.</p>
        <Link
          href="/login"
          className="rounded-full bg-emerald-500 px-6 py-2 text-sm font-semibold shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
        >
          Log in
        </Link>
      </div>
    );
  }

  if (!trade) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-4 text-white"
        style={bgStyle}
      >
        <p className="text-white/50">Trade not found.</p>
        <Link
          href="/dashboard"
          className="rounded-full bg-emerald-500 px-6 py-2 text-sm font-semibold shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
        >
          Back to History
        </Link>
      </div>
    );
  }

  // Parse violations
  const violations = JSON.parse(trade.violations || "[]");
  const hasViolation = violations.length > 0;

  // Calculate P/L display
  const plValue = trade.realized_pl ? parseFloat(trade.realized_pl) : 0;
  const plColor = plValue >= 0 ? "text-emerald-400" : "text-red-400";
  const plSign = plValue >= 0 ? "+" : "";

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
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-green-600">
            <ShieldCheck className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-semibold">Baywater</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm text-white/50 hover:text-white">
            Analyze
          </Link>
          <Link href="/dashboard" className="text-sm text-white/50 hover:text-white">
            History
          </Link>
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
        {/* BACK BUTTON */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white"
        >
          ← Back to History
        </Link>

        {/* TRADE DETAILS */}
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Trade Details</CardTitle>
            <Link
              href={`/dashboard/trade/${params.id}/replay`}
              className="inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Launch AI Replay
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-white/50">Ticker</p>
                <p className="mt-1 text-xl font-bold">{trade.ticker ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-white/50">Direction</p>
                <p className="mt-1 text-xl font-bold capitalize">{trade.direction ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-white/50">Entry Price</p>
                <p className="mt-1 text-xl font-bold">${trade.entry ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-white/50">Exit Price</p>
                <p className="mt-1 text-xl font-bold">${trade.exit ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-white/50">Position Size</p>
                <p className="mt-1 text-xl font-bold">{trade.size ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-white/50">Realized P/L</p>
                <p className={`mt-1 text-xl font-bold ${plColor}`}>
                  {plSign}${Math.abs(plValue).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4">
              <div>
                <p className="text-xs text-white/50">Entry Time</p>
                <p className="mt-1 text-sm text-white/70">
                  {trade.entry_time ? new Date(trade.entry_time).toLocaleString() : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-white/50">Exit Time</p>
                <p className="mt-1 text-sm text-white/70">
                  {trade.exit_time ? new Date(trade.exit_time).toLocaleString() : "—"}
                </p>
              </div>
            </div>

            {/* VIOLATIONS */}
            <div className="pt-6">
              <p className="text-xs text-white/50">Violations</p>
              {hasViolation ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {violations.map((v: string, i: number) => (
                    <span
                      key={i}
                      className="rounded-full bg-red-500/20 px-3 py-1 text-sm text-red-400"
                    >
                      {v}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="mt-2 inline-block rounded-full bg-emerald-500/20 px-3 py-1 text-sm text-emerald-400">
                  No violations
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* PROCESS REVIEW SECTION */}
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              Process Review
            </CardTitle>
            <p className="text-xs text-white/50 mt-1">
              Separating process quality from trade outcome
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Discipline Score */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-white/50">Discipline Score</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-3xl font-bold">
                    {trade.discipline_score !== null && trade.discipline_score !== undefined
                      ? trade.discipline_score
                      : '—'}
                  </span>
                  <span className="text-sm text-white/60">/ 100</span>
                </div>
                <p className="text-xs text-white/60 mt-1">
                  {trade.discipline_score !== null && trade.discipline_score !== undefined
                    ? getDisciplineDescription(trade.discipline_score)
                    : 'Not calculated'}
                </p>
              </div>
              <div>
                <p className="text-xs text-white/50">Violation Count</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-3xl font-bold">
                    {violations.length}
                  </span>
                  <span className="text-sm text-white/60">
                    {violations.length === 1 ? 'violation' : 'violations'}
                  </span>
                </div>
                <p className="text-xs text-white/60 mt-1">
                  {violations.length === 0 ? 'Perfect execution' : `${20 * violations.length} points deducted`}
                </p>
              </div>
            </div>

            {/* Violation Cost */}
            <div>
              <p className="text-xs text-white/50">Violation Cost</p>
              <div className="flex items-center gap-2 mt-1">
                {trade.violation_cost && parseFloat(trade.violation_cost) < 0 ? (
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                )}
                <span className={`text-2xl font-bold ${trade.violation_cost && parseFloat(trade.violation_cost) < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {trade.violation_cost ? `$${Math.abs(parseFloat(trade.violation_cost)).toFixed(2)}` : '—'}
                </span>
              </div>
              <p className="text-xs text-white/60 mt-1">
                {trade.violation_cost && parseFloat(trade.violation_cost) < 0
                  ? 'Money lost due to rule violations'
                  : violations.length > 0 && plValue > 0
                    ? 'Dangerous win: profitable trade with violations'
                    : 'No violation cost'}
              </p>
            </div>

            {/* Dangerous Win Warning */}
            {violations.length > 0 && plValue > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-300">Dangerous Win Detected</p>
                  <p className="text-sm text-amber-200 mt-1">
                    This trade was profitable but violated your trading rules. Dangerous wins reinforce bad habits
                    and can lead to larger losses when the market conditions change.
                  </p>
                </div>
              </div>
            )}

            {/* Trade Quality Metrics */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
              <div>
                <p className="text-xs text-white/50">Setup Quality</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-2xl font-bold">
                    {trade.setup_quality !== null && trade.setup_quality !== undefined
                      ? trade.setup_quality
                      : '—'}
                  </span>
                  <span className="text-sm text-white/60">/ 100</span>
                </div>
                <p className="text-xs text-white/60 mt-1">
                  {trade.setup_quality !== null && trade.setup_quality !== undefined
                    ? getSetupQualityDescription(trade.setup_quality)
                    : 'Not analyzed'}
                </p>
              </div>
              <div>
                <p className="text-xs text-white/50">Trade Grade</p>
                <div className="flex items-center gap-2 mt-1">
                  {trade.ai_review && JSON.parse(trade.ai_review).trade_grade ? (
                    <span className={`text-3xl font-bold ${getTradeGradeColor(JSON.parse(trade.ai_review).trade_grade)}`}>
                      {JSON.parse(trade.ai_review).trade_grade}
                    </span>
                  ) : (
                    <span className="text-3xl font-bold text-white/60">—</span>
                  )}
                </div>
                <p className="text-xs text-white/60 mt-1">
                  {trade.ai_review && JSON.parse(trade.ai_review).trade_grade
                    ? `Based on rule adherence and execution quality`
                    : 'Not graded'}
                </p>
              </div>
            </div>

            {/* Trade Outcome Category */}
            <div className="pt-4 border-t border-white/10">
              <p className="text-xs text-white/50">Trade Outcome Category</p>
              <div className="flex items-center gap-3 mt-2">
                {getCategoryIcon(calculateTradeOutcomeCategory(plValue, violations))}
                <div>
                  <p className="text-lg font-bold">
                    {getCategoryLabel(calculateTradeOutcomeCategory(plValue, violations))}
                  </p>
                  <p className="text-sm text-white/60">
                    {getCategoryDescription(calculateTradeOutcomeCategory(plValue, violations))}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* HISTORICAL CHART */}
        {trade.ticker && (
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>Historical Price Action</CardTitle>
            </CardHeader>
            <CardContent>
              {chartLoading ? (
                <div className="flex items-center justify-center h-96">
                  <div className="text-white/60">Loading chart data...</div>
                </div>
              ) : candles.length > 0 ? (
                <div className="h-96">
                  <TradeChart
                    candles={candles}
                    ticker={trade.ticker}
                    width={undefined}
                    height={undefined}
                    entryTime={trade.entry_time}
                    exitTime={trade.exit_time}
                    entryPrice={trade.entry ? parseFloat(trade.entry) : undefined}
                    exitPrice={trade.exit ? parseFloat(trade.exit) : undefined}
                  />
                </div>
              ) : (
                <div className="text-center text-white/60 py-8">
                  No chart data available for this time period
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* HISTORICAL PATTERN MATCH SECTION */}
        {patternAnalysis && (
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="h-5 w-5 text-blue-400">🔍</span>
                Historical Pattern Match
              </CardTitle>
              <p className="text-xs text-white/50 mt-1">
                How this trade compares to your historical winners and losers
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Overall Pattern Verdict */}
              <div>
                <p className="text-xs text-white/50">Overall Pattern Verdict</p>
                <div className="flex items-center gap-3 mt-2">
                  {patternAnalysis.winner_similarity_score > patternAnalysis.loser_similarity_score ? (
                    <span className="h-8 w-8 flex-shrink-0 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <span className="text-emerald-400 font-bold">🟢</span>
                    </span>
                  ) : patternAnalysis.loser_similarity_score > patternAnalysis.winner_similarity_score ? (
                    <span className="h-8 w-8 flex-shrink-0 rounded-full bg-red-500/20 flex items-center justify-center">
                      <span className="text-red-400 font-bold">🔴</span>
                    </span>
                  ) : (
                    <span className="h-8 w-8 flex-shrink-0 rounded-full bg-amber-500/20 flex items-center justify-center">
                      <span className="text-amber-400 font-bold">🟡</span>
                    </span>
                  )}

                  <div>
                    {patternAnalysis.winner_similarity_score > patternAnalysis.loser_similarity_score ? (
                      <p className="text-lg font-bold text-emerald-400">
                        This trade resembles your historical winners
                      </p>
                    ) : patternAnalysis.loser_similarity_score > patternAnalysis.winner_similarity_score ? (
                      <p className="text-lg font-bold text-red-400">
                        This trade resembles your historical losers
                      </p>
                    ) : (
                      <p className="text-lg font-bold text-amber-400">
                        Mixed historical pattern
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
                      <div>
                        <p className="text-xs text-white/50">Winner Similarity</p>
                        <p className="font-semibold text-emerald-400">
                          {patternAnalysis.winner_similarity_score || 0}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-white/50">Loser Similarity</p>
                        <p className="font-semibold text-red-400">
                          {patternAnalysis.loser_similarity_score || 0}%
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Why It Matches Winners */}
              {patternAnalysis.matching_factors && patternAnalysis.matching_factors.length > 0 && (
                <div>
                  <p className="text-xs text-white/50">Why this matches your winners</p>
                  <div className="mt-2 space-y-2">
                    {patternAnalysis.matching_factors.map((factor: string, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="mt-1 h-4 w-4 flex-shrink-0 rounded-full bg-emerald-500/20 flex items-center justify-center">
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        </span>
                        <p className="text-sm text-white/90">{factor}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Why It Matches Losers */}
              {(patternAnalysis.risk_flags && patternAnalysis.risk_flags.length > 0) || (patternAnalysis.differing_factors && patternAnalysis.differing_factors.length > 0) ? (
                <div>
                  <p className="text-xs text-white/50">Warning signs from past losing trades</p>
                  <div className="mt-2 space-y-2">
                    {patternAnalysis.risk_flags?.map((flag: string, i: number) => (
                      <div key={`risk-${i}`} className="flex items-start gap-2">
                        <span className="mt-1 h-4 w-4 flex-shrink-0 rounded-full bg-red-500/20 flex items-center justify-center">
                          <AlertTriangle className="h-3 w-3 text-red-400" />
                        </span>
                        <p className="text-sm text-white/90">{flag}</p>
                      </div>
                    ))}
                    {patternAnalysis.differing_factors?.map((factor: string, i: number) => (
                      <div key={`diff-${i}`} className="flex items-start gap-2">
                        <span className="mt-1 h-4 w-4 flex-shrink-0 rounded-full bg-amber-500/20 flex items-center justify-center">
                          <span className="text-amber-400 text-xs">⚠</span>
                        </span>
                        <p className="text-sm text-white/90">{factor}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Historical Edge Card */}
              {patternAnalysis.edge_conditions && patternAnalysis.edge_conditions.length > 0 && (
                <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                  <p className="text-sm font-medium text-white/80">Your Edge</p>
                  <div className="mt-2 space-y-2">
                    {patternAnalysis.edge_conditions.map((edge: string, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" />
                        <p className="text-sm text-white/90">{edge}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Similar Historical Trades */}
              {patternAnalysis.similar_trade_ids && patternAnalysis.similar_trade_ids.length > 0 && (
                <div>
                  <p className="text-xs text-white/50">Similar Historical Trades</p>
                  <div className="mt-2 space-y-3">
                    <div>
                      <p className="text-sm font-medium text-emerald-400 mb-2">Past Winning Examples</p>
                      {patternAnalysis.similar_trade_ids.slice(0, 3).map((tradeId: string, i: number) => (
                        <div key={`win-${i}`} className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mb-1">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium">{tradeId}</span>
                            <span className="text-xs text-white/60">Similarity: {patternAnalysis.similarity_scores?.[i] || 'N/A'}%</span>
                          </div>
                          <span className="text-xs text-emerald-400">Winner</span>
                        </div>
                      ))}
                    </div>

                    {patternAnalysis.losing_pattern_matches && patternAnalysis.losing_pattern_matches > 0 && (
                      <div className="mt-3">
                        <p className="text-sm font-medium text-red-400 mb-2">Past Losing Examples</p>
                        <div className="flex items-center justify-between p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium">Similar losing trades</span>
                            <span className="text-xs text-white/60">Count: {patternAnalysis.losing_pattern_matches}</span>
                          </div>
                          <span className="text-xs text-red-400">Loser patterns</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* No Pattern Analysis Available */}
        {!patternAnalysis && !patternLoading && (
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardContent className="text-center py-8">
              <p className="text-sm text-white/60">Not enough historical trades yet.</p>
              <p className="text-xs text-white/40 mt-2">
                Keep logging trades to unlock personalized pattern recognition.
              </p>
            </CardContent>
          </Card>
        )}

        {/* MARKET CONTEXT */}
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Market Context</CardTitle>
            <p className="text-xs text-white/50 mt-1">
              Why the trade environment mattered
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-white/50">Float</p>
                  <p className="mt-1 font-semibold">
                    {trade.float_shares ? `${(trade.float_shares / 1000000).toFixed(1)}M` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-white/50">Market Cap</p>
                  <p className="mt-1 font-semibold">
                    {trade.market_cap ? `$${(trade.market_cap / 1000000000).toFixed(1)}B` : '—'}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-white/50">Sector</p>
                  <p className="mt-1 font-semibold">
                    {trade.sector || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-white/50">Relative Volume</p>
                  <p className="mt-1 font-semibold">
                    {trade.relative_volume ? `${trade.relative_volume.toFixed(1)}x` : '—'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI REPLAY */}
        {trade.ai_replay && (
          <AIReplay
            replayText={trade.ai_replay}
            entryTime={trade.entry_time || ''}
            exitTime={trade.exit_time || ''}
          />
        )}

        {/* AI ANALYSIS */}
        {trade.ai_review && (
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>AI Trade Analysis</CardTitle>
              <p className="text-xs text-white/50 mt-1">
                Performance evaluation by your AI trading coach
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Summary */}
              <div>
                <p className="text-xs text-white/50">Summary</p>
                <p className="mt-1 text-sm text-white/90">
                  {JSON.parse(trade.ai_review).summary || 'No summary available'}
                </p>
              </div>

              {/* Strengths */}
              <div>
                <p className="text-xs text-white/50">Strengths</p>
                <div className="mt-2 space-y-2">
                  {JSON.parse(trade.ai_review).strengths?.map((strength: string, i: number) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" />
                      <p className="text-sm text-white/90">{strength}</p>
                    </div>
                  )) || <p className="text-sm text-white/60">No strengths identified</p>}
                </div>
              </div>

              {/* Mistakes */}
              <div>
                <p className="text-xs text-white/50">Mistakes</p>
                <div className="mt-2 space-y-2">
                  {JSON.parse(trade.ai_review).mistakes?.map((mistake: string, i: number) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />
                      <p className="text-sm text-white/90">{mistake}</p>
                    </div>
                  )) || <p className="text-sm text-white/60">No mistakes identified</p>}
                </div>
              </div>

              {/* Lesson */}
              <div>
                <p className="text-xs text-white/50">Key Lesson</p>
                <p className="mt-1 text-sm text-white/90 font-medium">
                  {JSON.parse(trade.ai_review).lesson || 'No lesson available'}
                </p>
              </div>

              {/* Scores */}
              <div className="grid grid-cols-2 gap-4 pt-4">
                <div>
                  <p className="text-xs text-white/50">Setup Quality</p>
                  <p className="mt-1 text-xl font-bold">
                    {JSON.parse(trade.ai_review).setup_quality || '—'}/100
                  </p>
                </div>
                <div>
                  <p className="text-xs text-white/50">Confidence</p>
                  <p className="mt-1 text-xl font-bold">
                    {JSON.parse(trade.ai_review).confidence || '—'}/100
                  </p>
                </div>
              </div>

              {/* Emotion */}
              <div>
                <p className="text-xs text-white/50">Emotion Detected</p>
                <p className="mt-1 text-sm text-white/90">
                  {JSON.parse(trade.ai_review).emotion_detected || '—'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* AI UNAVAILABLE */}
        {!trade.ai_review && (
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardContent className="text-center py-8">
              <p className="text-sm text-white/60">AI review unavailable for this trade.</p>
              <p className="text-xs text-white/40 mt-2">
                This trade may have been processed before AI analysis was available.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
