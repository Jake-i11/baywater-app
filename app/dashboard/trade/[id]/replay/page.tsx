"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { ShieldCheck, Play, Pause, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AIReplayChart } from "@/components/AIReplayChart";
import { ReplayTimeline } from "@/components/ReplayTimeline";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
  setup_type?: string | null;
  setup_confidence?: number | null;
  decision_quality?: any | null;
};

type ReplayEvent = {
  timestamp: string;
  title: string;
  description: string;
};

type ReplayAnalysis = {
  replay_events: ReplayEvent[];
  setup_type: string;
  setup_confidence: number;
  decision_quality: {
    entry_score: number;
    exit_score: number;
    risk_score: number;
    overall_grade: string;
  };
  decision_vs_outcome: string;
  mistakes: string[];
  strengths: string[];
  lesson: string;
};

export default function AIReplayPage({ params }: { params: { id: string } }) {
  const [user, setUser] = useState<User | null>(null);
  const [trade, setTrade] = useState<Trade | null>(null);
  const [loading, setLoading] = useState(true);
  const [candles, setCandles] = useState<any[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [replayAnalysis, setReplayAnalysis] = useState<ReplayAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const router = useRouter();

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

          // Check if we already have replay analysis
          if (tradeData.decision_quality) {
            try {
              setReplayAnalysis({
                ...tradeData.decision_quality,
                replay_events: tradeData.decision_quality.replay_events || []
              });
            } catch (error) {
              console.error("Error parsing existing analysis:", error);
              // Generate new analysis if parsing fails
              await generateReplayAnalysis(tradeData);
            }
          } else {
            // Generate new analysis if none exists
            await generateReplayAnalysis(tradeData);
          }
        }
      }
      setLoading(false);
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
      // Start: 30 minutes before trade time
      // End: 30 minutes after trade time
      const startTime = new Date(tradeTime);
      startTime.setMinutes(tradeTime.getMinutes() - 30);

      const endTime = new Date(tradeTime);
      endTime.setMinutes(tradeTime.getMinutes() + 30);

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

  async function generateReplayAnalysis(tradeData: Trade) {
    try {
      setAnalysisLoading(true);

      // Call the new replay analysis endpoint
      const response = await fetch(`/api/replay-analysis?tradeId=${tradeData.id}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const analysis = await response.json();
        setReplayAnalysis(analysis);

        // Store the analysis in Supabase
        await supabase
          .from('trades')
          .update({
            decision_quality: analysis,
            setup_type: analysis.setup_type,
            setup_confidence: analysis.setup_confidence
          })
          .eq('id', tradeData.id);
      } else {
        console.error("Failed to generate replay analysis:", response.statusText);
      }
    } catch (error) {
      console.error("Error generating replay analysis:", error);
    } finally {
      setAnalysisLoading(false);
    }
  }

  const handlePlayPause = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleReset = useCallback(() => {
    setIsPlaying(false);
    setCurrentEventIndex(0);
  }, []);

  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
  }, []);

  const handleEventChange = useCallback((index: number) => {
    setCurrentEventIndex(index);
  }, []);

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
        Loading AI Replay...
      </div>
    );
  }

  if (!user) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-4 text-white"
        style={bgStyle}
      >
        <p className="text-white/50">You need to be logged in to view AI replay.</p>
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

      <div className="mx-auto max-w-6xl space-y-6 px-6 pb-20 pt-6">
        {/* BACK BUTTON */}
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/trade/${params.id}`}
            className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white"
          >
            ← Back to Trade
          </Link>
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white"
          >
            <RotateCcw className="h-3 w-3" />
            Reset Replay
          </button>
        </div>

        {/* REPLAY HEADER */}
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-xl">AI Trade Replay: {trade.ticker}</CardTitle>
            <p className="text-sm text-white/60 mt-2">
              Interactive analysis of your trade execution with real-time market context
            </p>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePlayPause}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 hover:bg-emerald-400"
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
              <span className="text-sm text-white/80">
                {isPlaying ? 'Playing' : 'Paused'}
              </span>
            </div>

            <div className="flex items-center gap-2 ml-4">
              <span className="text-xs text-white/50">Speed:</span>
              {[1, 2, 5].map((speed) => (
                <button
                  key={speed}
                  onClick={() => handleSpeedChange(speed)}
                  className={`px-3 py-1 text-xs rounded-full ${
                    playbackSpeed === speed
                      ? 'bg-emerald-500 text-white'
                      : 'bg-white/10 text-white/60 hover:bg-white/20'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>

            {analysisLoading && (
              <div className="ml-auto text-sm text-white/60">
                Generating AI analysis...
              </div>
            )}
          </CardContent>
        </Card>

        {/* REPLAY CHART */}
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Interactive Trade Replay</CardTitle>
            <p className="text-xs text-white/50 mt-1">
              Candles reveal progressively • Current event highlighted
            </p>
          </CardHeader>
          <CardContent className="h-[500px]">
            {chartLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-white/60">Loading chart data...</div>
              </div>
            ) : candles.length > 0 ? (
              <AIReplayChart
                candles={candles}
                ticker={trade.ticker}
                entryPrice={trade.entry ? parseFloat(trade.entry) : undefined}
                exitPrice={trade.exit ? parseFloat(trade.exit) : undefined}
                entryTime={trade.entry_time}
                exitTime={trade.exit_time}
                isPlaying={isPlaying}
                playbackSpeed={playbackSpeed}
                currentEventIndex={currentEventIndex}
                onEventChange={handleEventChange}
                replayEvents={replayAnalysis?.replay_events || []}
              />
            ) : (
              <div className="text-center text-white/60 py-8">
                No chart data available for this time period
              </div>
            )}
          </CardContent>
        </Card>

        {/* REPLAY TIMELINE */}
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>AI Commentary Timeline</CardTitle>
            <p className="text-xs text-white/50 mt-1">
              Synchronized with chart playback • Click events to jump
            </p>
          </CardHeader>
          <CardContent>
            {replayAnalysis ? (
              <ReplayTimeline
                events={replayAnalysis.replay_events}
                currentEventIndex={currentEventIndex}
                onEventClick={handleEventChange}
              />
            ) : analysisLoading ? (
              <div className="text-center text-white/60 py-8">
                Generating AI analysis...
              </div>
            ) : (
              <div className="text-center text-white/60 py-8">
                AI analysis unavailable for this trade
              </div>
            )}
          </CardContent>
        </Card>

        {/* REPLAY ANALYSIS */}
        {replayAnalysis && (
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>Trade Analysis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Setup Recognition */}
              <div>
                <p className="text-xs text-white/50">Setup Type</p>
                <div className="mt-2 flex items-center gap-4">
                  <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-sm text-emerald-400">
                    {replayAnalysis.setup_type || 'Unclassified'}
                  </span>
                  <span className="text-sm text-white/80">
                    Confidence: {replayAnalysis.setup_confidence}%
                  </span>
                </div>
              </div>

              {/* Decision Quality */}
              <div>
                <p className="text-xs text-white/50">Decision Quality</p>
                <div className="grid grid-cols-3 gap-4 mt-2">
                  <div>
                    <p className="text-xs text-white/50">Entry</p>
                    <p className="mt-1 text-lg font-bold">
                      {replayAnalysis.decision_quality.entry_score}/100
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-white/50">Exit</p>
                    <p className="mt-1 text-lg font-bold">
                      {replayAnalysis.decision_quality.exit_score}/100
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-white/50">Risk</p>
                    <p className="mt-1 text-lg font-bold">
                      {replayAnalysis.decision_quality.risk_score}/100
                    </p>
                  </div>
                </div>
                <div className="mt-4 text-center">
                  <p className="text-xs text-white/50">Overall Grade</p>
                  <p className="mt-1 text-3xl font-bold text-emerald-400">
                    {replayAnalysis.decision_quality.overall_grade}
                  </p>
                </div>
              </div>

              {/* Decision vs Outcome */}
              <div>
                <p className="text-xs text-white/50">Decision vs Outcome</p>
                <p className="mt-1 text-sm text-white/90">
                  {replayAnalysis.decision_vs_outcome}
                </p>
              </div>

              {/* Strengths */}
              <div>
                <p className="text-xs text-white/50">Strengths</p>
                <div className="mt-2 space-y-2">
                  {replayAnalysis.strengths.map((strength, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" />
                      <p className="text-sm text-white/90">{strength}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mistakes */}
              <div>
                <p className="text-xs text-white/50">Mistakes</p>
                <div className="mt-2 space-y-2">
                  {replayAnalysis.mistakes.map((mistake, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />
                      <p className="text-sm text-white/90">{mistake}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Lesson */}
              <div className="border-t border-white/10 pt-6">
                <p className="text-xs text-white/50">Key Lesson</p>
                <p className="mt-1 text-sm text-white/90 font-medium">
                  {replayAnalysis.lesson}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}