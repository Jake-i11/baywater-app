"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle, TrendingUp, TrendingDown, Clock, BarChart2, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import {
  analyzeSetupPerformance,
  analyzeMarketCapPerformance,
  analyzeFloatPerformance,
  analyzeRelativeVolumePerformance,
  analyzeTimeOfDayPerformance,
  analyzeHoldingPeriodPerformance,
  analyzeTickerPerformance,
  getConfidenceLevel
} from "@/lib/pattern-analysis";

export default function EdgeDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
      }
      setLoading(false);
    });
  }, []);

  // Analyze patterns
  const setupAnalysis = analyzeSetupPerformance(trades);
  const marketCapAnalysis = analyzeMarketCapPerformance(trades);
  const floatAnalysis = analyzeFloatPerformance(trades);
  const volumeAnalysis = analyzeRelativeVolumePerformance(trades);
  const timeAnalysis = analyzeTimeOfDayPerformance(trades);
  const holdingAnalysis = analyzeHoldingPeriodPerformance(trades);
  const tickerAnalysis = analyzeTickerPerformance(trades);

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
        <p className="text-white/50">You need to be logged in to view your edge analysis.</p>
        <Link
          href="/login"
          className="rounded-full bg-emerald-500 px-6 py-2 text-sm font-semibold shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
        >
          Log in
        </Link>
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
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-green-600">
            <ShieldCheck className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-semibold">Baywater</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-white/70 hover:text-white">
            History
          </Link>
          <span className="text-sm font-medium text-white">Your Edge</span>
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

      <div className="mx-auto max-w-6xl space-y-6 px-6 pb-20 pt-6">
        {/* PAGE HEADER */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">Your Trading Edge</h1>
          <p className="text-white/60 mt-2">
            Discover what you're actually good and bad at based on your trade data
          </p>
        </div>

        {/* YOUR BEST SETUPS */}
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-400" />
              Your Best Setups
            </CardTitle>
            <p className="text-xs text-white/50 mt-1">
              Trade setups where you perform best
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {setupAnalysis.length > 0 ? (
              setupAnalysis.map((setup, index) => (
                <div key={index} className="p-4 rounded-lg bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="h-8 w-8 flex items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
                        #{index + 1}
                      </span>
                      <div>
                        <p className="font-medium">{setup.setup}</p>
                        <p className="text-xs text-white/60">{setup.trades} trades</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-emerald-400">
                        ${setup.totalPL.toFixed(2)}
                      </p>
                      <p className="text-xs text-white/60">
                        {setup.winRate}% win rate • ${setup.avgPL.toFixed(2)} avg
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <span className={`text-xs font-medium ${getConfidenceLevel(setup.trades).level === 'high' ? 'text-emerald-400' : getConfidenceLevel(setup.trades).level === 'medium' ? 'text-yellow-400' : 'text-amber-400'}`}>
                      {getConfidenceLevel(setup.trades).description}
                    </span>
                    <span className="text-xs text-white/60">
                      Discipline: {setup.avgDisciplineScore}/100
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-white/60">
                <p>Not enough data to analyze your best setups.</p>
                <p className="text-xs mt-2">Trade more to see your patterns emerge.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* YOUR WORST SETUPS */}
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-400" />
              Your Worst Setups
            </CardTitle>
            <p className="text-xs text-white/50 mt-1">
              Trade setups where you struggle - consider avoiding or improving
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {setupAnalysis.length > 0 ? (
              [...setupAnalysis]
                .sort((a, b) => a.totalPL - b.totalPL)
                .slice(0, 3)
                .map((setup, index) => (
                  <div key={index} className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="h-8 w-8 flex items-center justify-center rounded-full bg-red-500/20 text-red-400 font-medium">
                          #{index + 1}
                        </span>
                        <div>
                          <p className="font-medium">{setup.setup}</p>
                          <p className="text-xs text-red-300">{setup.trades} trades</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-red-400">
                          ${setup.totalPL.toFixed(2)}
                        </p>
                        <p className="text-xs text-red-300">
                          {setup.winRate}% win rate • ${setup.avgPL.toFixed(2)} avg
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <span className={`text-xs font-medium ${getConfidenceLevel(setup.trades).level === 'high' ? 'text-red-400' : getConfidenceLevel(setup.trades).level === 'medium' ? 'text-yellow-400' : 'text-amber-400'}`}>
                        {getConfidenceLevel(setup.trades).description}
                      </span>
                      <span className="text-xs text-red-300">
                        Discipline: {setup.avgDisciplineScore}/100
                      </span>
                    </div>
                  </div>
                ))
            ) : (
              <div className="text-center py-8 text-white/60">
                <p>Not enough data to analyze your worst setups.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* BEST MARKET CONDITIONS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart2 className="h-5 w-5 text-emerald-400" />
                Best Market Caps
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {marketCapAnalysis.length > 0 ? (
                marketCapAnalysis.map((tier, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{tier.tier}</span>
                      <span className="text-xs text-white/60">({tier.range})</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-400">
                        ${tier.totalPL.toFixed(2)}
                      </p>
                      <p className="text-xs text-white/60">
                        {tier.winRate}% • {tier.trades} trades
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-white/60">
                  <p>Not enough market cap data.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart2 className="h-5 w-5 text-emerald-400" />
                Best Float Ranges
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {floatAnalysis.length > 0 ? (
                floatAnalysis.map((bucket, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{bucket.bucket}</span>
                      <span className="text-xs text-white/60">({bucket.range})</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-400">
                        ${bucket.totalPL.toFixed(2)}
                      </p>
                      <p className="text-xs text-white/60">
                        {bucket.winRate}% • {bucket.trades} trades
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-white/60">
                  <p>Not enough float data.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* BEST TIME AND HOLDING PERIODS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-emerald-400" />
                Best Time of Day
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {timeAnalysis.length > 0 ? (
                timeAnalysis.map((period, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{period.timeRange}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-400">
                        ${period.totalPL.toFixed(2)}
                      </p>
                      <p className="text-xs text-white/60">
                        {period.winRate}% • {period.trades} trades
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-white/60">
                  <p>Not enough time of day data.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-emerald-400" />
                Best Holding Periods
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {holdingAnalysis.length > 0 ? (
                holdingAnalysis.map((period, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{period.range}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-400">
                        ${period.totalPL.toFixed(2)}
                      </p>
                      <p className="text-xs text-white/60">
                        {period.winRate}% • {period.trades} trades
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-white/60">
                  <p>Not enough holding period data.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* BEST AND WORST TICKERS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-emerald-400" />
                Best Tickers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {tickerAnalysis.bestTickers.length > 0 ? (
                tickerAnalysis.bestTickers.map((ticker, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold">{ticker.ticker}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-400">
                        ${ticker.totalPL.toFixed(2)}
                      </p>
                      <p className="text-xs text-white/60">
                        {ticker.winRate}% • {ticker.trades} trades
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-white/60">
                  <p>Not enough ticker data.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-red-400" />
                Worst Tickers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {tickerAnalysis.worstTickers.length > 0 ? (
                tickerAnalysis.worstTickers.map((ticker, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-red-400">{ticker.ticker}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-400">
                        ${ticker.totalPL.toFixed(2)}
                      </p>
                      <p className="text-xs text-red-300">
                        {ticker.winRate}% • {ticker.trades} trades
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-white/60">
                  <p>Not enough ticker data.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* SUMMARY INSIGHT */}
        {(setupAnalysis.length > 0 || marketCapAnalysis.length > 0 || timeAnalysis.length > 0) && (
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="h-5 w-5 text-blue-400">💡</span>
                Your Edge Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-white/5 border border-white/10">
                <ShieldCheck className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-white/80">
                  This analysis shows your actual strengths and weaknesses based on your trade data.
                  Focus on trading your best setups during your best market conditions and time periods.
                  Consider avoiding or improving your worst-performing patterns.
                </p>
              </div>

              {setupAnalysis.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                  <TrendingUp className="h-5 w-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-emerald-300">
                    Your best setup is <strong>{setupAnalysis[0]?.setup}</strong> with {setupAnalysis[0]?.trades} trades,
                    {setupAnalysis[0]?.winRate}% win rate, and ${setupAnalysis[0]?.totalPL.toFixed(2)} total profit.
                  </p>
                </div>
              )}

              {timeAnalysis.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <Clock className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-blue-300">
                    You perform best during <strong>{timeAnalysis[0]?.timeRange}</strong> with {timeAnalysis[0]?.trades} trades
                    and ${timeAnalysis[0]?.totalPL.toFixed(2)} total profit.
                  </p>
                </div>
              )}

              <div className="flex items-start gap-2 p-3 rounded-lg bg-white/5 border border-white/10">
                <span className="h-5 w-5 text-white/60 mt-0.5">ℹ️</span>
                <p className="text-sm text-white/80">
                  Remember: This analysis is based on your actual trade data, not opinions.
                  Use these insights to refine your trading strategy and focus on what works for you.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}