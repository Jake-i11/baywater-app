"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle, TrendingUp, TrendingDown, Clock, BarChart2, DollarSign, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";

export default function AICoachDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [coachingData, setCoachingData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCoachingData();
  }, []);

  async function fetchCoachingData() {
    try {
      setLoading(true);
      setError(null);

      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUser = sessionData.session?.user ?? null;
      setUser(sessionUser);

      if (sessionUser) {
        // Try to get cached coaching data first
        const response = await fetch(`/api/pattern-coach?user_id=${sessionUser.id}`);
        if (response.ok) {
          const data = await response.json();
          setCoachingData(data);
        } else {
          setCoachingData(null);
        }
      }
    } catch (err) {
      console.error('Failed to fetch coaching data:', err);
      setError('Failed to load coaching insights');
    } finally {
      setLoading(false);
    }
  }

  async function refreshAnalysis() {
    try {
      setRefreshing(true);
      setError(null);

      if (!user) return;

      const response = await fetch('/api/pattern-coach', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: user.id }),
      });

      if (response.ok) {
        const data = await response.json();
        setCoachingData(data);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to refresh analysis');
      }
    } catch (err) {
      console.error('Failed to refresh coaching analysis:', err);
      setError('Failed to refresh analysis');
    } finally {
      setRefreshing(false);
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
        Loading your AI coach...
      </div>
    );
  }

  if (!user) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-4 text-white"
        style={bgStyle}
      >
        <p className="text-white/50">You need to be logged in to access your AI coach.</p>
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
          <Link href="/dashboard/edge" className="text-sm text-white/70 hover:text-white">
            Your Edge
          </Link>
          <span className="text-sm font-medium text-white">AI Coach</span>
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Your AI Trading Coach</h1>
            <p className="text-white/60 mt-2">
              Personalized insights based on your actual trade data
            </p>
          </div>
          <div className="flex items-center gap-3">
            {coachingData?.last_analyzed && (
              <div className="text-right text-sm text-white/60">
                <p>Last analyzed:</p>
                <p className="font-medium">
                  {new Date(coachingData.last_analyzed).toLocaleString()}
                </p>
              </div>
            )}
            <button
              onClick={refreshAnalysis}
              disabled={refreshing}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
            >
              {refreshing ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                  Analyzing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Refresh Analysis
                </>
              )}
            </button>
          </div>
        </div>

        {/* ERROR STATE */}
        {error && (
          <div className="rounded-lg bg-red-500/10 p-4 border border-red-500/30">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-red-300">Analysis Error</p>
                <p className="text-sm text-red-200 mt-1">{error}</p>
                {coachingData?.message && (
                  <p className="text-sm text-red-200 mt-1">
                    {coachingData.message}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* NO DATA STATE */}
        {!coachingData && !error && (
          <div className="text-center py-16">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
              <ShieldCheck className="h-8 w-8 text-white/60" />
            </div>
            <h2 className="text-xl font-semibold">Welcome to Your AI Coach</h2>
            <p className="text-white/60 mt-3 max-w-md mx-auto">
              Your personal trading coach will analyze your trade patterns and provide data-driven insights.
            </p>
            <button
              onClick={refreshAnalysis}
              disabled={refreshing}
              className="mt-6 rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold shadow-lg shadow-emerald-500/30 hover:bg-emerald-400 disabled:opacity-50"
            >
              {refreshing ? (
                <>
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                  Analyzing...
                </>
              ) : (
                'Generate My Coaching Insights'
              )}
            </button>
            {coachingData?.message && (
              <p className="text-sm text-white/60 mt-4">
                {coachingData.message}
              </p>
            )}
          </div>
        )}

        {/* COACHING CONTENT */}
        {coachingData && coachingData.trading_identity && (
          <>
            {/* SECTION 1: TRADING IDENTITY */}
            <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="h-6 w-6 text-blue-400">👤</span>
                  Your Trading Identity
                </CardTitle>
                <p className="text-xs text-white/50 mt-1">
                  Who you are as a trader based on your actual data
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <span className="h-12 w-12 flex items-center justify-center rounded-full bg-blue-500/20 text-blue-400 font-bold text-lg">
                      YOU
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-lg font-medium">
                      {coachingData.trading_identity.statement}
                    </p>
                    <p className="text-sm text-white/60 mt-2">Why Baywater believes this:</p>
                    <div className="mt-3 space-y-2">
                      {coachingData.trading_identity.evidence.map((item: any, index: number) => (
                        <div key={index} className="flex items-start gap-2 p-2 rounded-lg bg-white/5 border border-white/10">
                          <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium">{item.metric}</p>
                            <p className="text-xs text-white/60">{item.value}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* SECTION 2: YOUR EDGE */}
            <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-emerald-400" />
                  Your Edge
                </CardTitle>
                <p className="text-xs text-white/50 mt-1">
                  Patterns where you have a statistical advantage
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {coachingData.core_edges && coachingData.core_edges.length > 0 ? (
                  coachingData.core_edges.map((edge: any, index: number) => (
                    <div key={index} className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                      <div className="flex items-start gap-3">
                        <span className="h-8 w-8 flex items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                          #{index + 1}
                        </span>
                        <div className="flex-1">
                          <p className="font-medium text-emerald-300">Your edge: {edge.edge}</p>
                          <p className="text-sm text-white/80 mt-1">{edge.why}</p>
                          <div className="mt-3 space-y-1 text-xs">
                            {edge.supporting_stats.map((stat: string, statIndex: number) => (
                              <p key={statIndex} className="text-emerald-200">• {stat}</p>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 mt-3">
                            <span className={`text-xs font-medium ${edge.confidence === 'High' ? 'text-emerald-400' : edge.confidence === 'Medium' ? 'text-yellow-400' : 'text-amber-400'}`}>
                              Confidence: {edge.confidence}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-white/60">
                    <p>No clear edges detected yet.</p>
                    <p className="text-xs mt-2">Trade more to discover your statistical advantages.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* SECTION 3: YOUR STRENGTHS */}
            <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  Your Strengths
                </CardTitle>
                <p className="text-xs text-white/50 mt-1">
                  Areas where you consistently perform well
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {coachingData.biggest_strengths && coachingData.biggest_strengths.length > 0 ? (
                  coachingData.biggest_strengths.map((strength: any, index: number) => (
                    <div key={index} className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="h-6 w-6 text-green-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="font-medium text-green-300">{strength.strength}</p>
                          <div className="mt-2 space-y-1 text-xs text-white/80">
                            {strength.evidence.map((item: string, itemIndex: number) => (
                              <p key={itemIndex} className="text-green-200">• {item}</p>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-white/60">
                    <p>No significant strengths detected yet.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* SECTION 4: YOUR WEAKNESSES */}
            <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                  Your Weaknesses
                </CardTitle>
                <p className="text-xs text-white/50 mt-1">
                  Patterns that are hurting your performance
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {coachingData.biggest_leaks && coachingData.biggest_leaks.length > 0 ? (
                  coachingData.biggest_leaks.map((leak: any, index: number) => (
                    <div key={index} className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-6 w-6 text-red-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="font-medium text-red-300">{leak.problem}</p>
                          <div className="mt-2 space-y-1 text-xs text-red-200">
                            {leak.evidence.map((item: string, itemIndex: number) => (
                              <p key={itemIndex}>• {item}</p>
                            ))}
                          </div>
                          {leak.recommendation && (
                            <div className="mt-3 p-2 rounded-lg bg-white/5 border border-white/10">
                              <p className="text-xs font-medium text-white/80">RECOMMENDATION:</p>
                              <p className="text-xs text-white/60">{leak.recommendation}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-white/60">
                    <p>No significant weaknesses detected.</p>
                    <p className="text-xs mt-1">Keep up the good work!</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* SECTION 5: CONDITIONS TO SEEK */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    Conditions To Seek
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {coachingData.conditions_to_seek && coachingData.conditions_to_seek.length > 0 ? (
                    coachingData.conditions_to_seek.map((condition: any, index: number) => (
                      <div key={index} className="flex items-start gap-2 p-3 rounded-lg bg-white/5 border border-white/10">
                        <TrendingUp className="h-5 w-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-emerald-300">{condition.condition}</p>
                          <p className="text-xs text-white/80 mt-1">{condition.reason}</p>
                          <div className="mt-2 space-y-1 text-xs text-emerald-200">
                            {condition.stats.map((stat: string, statIndex: number) => (
                              <p key={statIndex}>• {stat}</p>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-white/60">
                      <p>No specific conditions to seek identified.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-400" />
                    Conditions To Avoid
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {coachingData.conditions_to_avoid && coachingData.conditions_to_avoid.length > 0 ? (
                    coachingData.conditions_to_avoid.map((condition: any, index: number) => (
                      <div key={index} className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                        <TrendingDown className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-red-300">{condition.condition}</p>
                          <p className="text-xs text-red-200 mt-1">{condition.reason}</p>
                          <div className="mt-2 space-y-1 text-xs text-red-200">
                            {condition.stats.map((stat: string, statIndex: number) => (
                              <p key={statIndex}>• {stat}</p>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-white/60">
                      <p>No specific conditions to avoid identified.</p>
                      <p className="text-xs mt-1">Your performance is consistent across conditions.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* SECTION 6: NEXT FOCUS */}
            <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="h-5 w-5 text-blue-400">🎯</span>
                  Next Focus
                </CardTitle>
                <p className="text-xs text-white/50 mt-1">
                  Your biggest improvement opportunity
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <span className="h-8 w-8 flex items-center justify-center rounded-full bg-blue-500/20 text-blue-400 font-bold flex-shrink-0">
                    #1
                  </span>
                  <div>
                    <p className="text-lg font-medium text-blue-300">
                      {coachingData.next_focus}
                    </p>
                    <p className="text-sm text-blue-200 mt-2">
                      This is your most impactful opportunity for improvement based on your actual trade data.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* SUMMARY INSIGHT */}
            <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="h-5 w-5 text-white/60">ℹ️</span>
                  About Your AI Coach
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-2 p-3 rounded-lg bg-white/5 border border-white/10">
                  <ShieldCheck className="h-5 w-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-white/80">
                    Every insight on this page is backed by your actual trade data. Your AI coach never makes unsupported claims
                    and always provides the statistics behind each recommendation.
                  </p>
                </div>

                <div className="flex items-start gap-2 p-3 rounded-lg bg-white/5 border border-white/10">
                  <BarChart2 className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-white/80">
                    The confidence levels indicate sample size: High (50+ trades), Medium (20-49 trades), Low (5-19 trades).
                    Focus on insights with higher confidence as they represent more reliable patterns.
                  </p>
                </div>

                <div className="flex items-start gap-2 p-3 rounded-lg bg-white/5 border border-white/10">
                  <RefreshCw className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-white/80">
                    Your coaching insights update as you trade more. Click "Refresh Analysis" to get the latest insights based
                    on your most recent trades.
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}